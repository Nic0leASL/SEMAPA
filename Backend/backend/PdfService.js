import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Robust UTF-8 decoder helper to clean double-encoded strings
function decodeUtf8(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    // Fallback manual replacement for common broken characters
    return str
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã/g, 'Á')
      .replace(/Ã‰/g, 'É')
      .replace(/Ã/g, 'Í')
      .replace(/Ã“/g, 'Ó')
      .replace(/Ãš/g, 'Ú')
      .replace(/Ã‘/g, 'Ñ');
  }
}

// Clean and safe date formatter
function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export default class PdfService {
  /**
   * Generates a preaviso PDF in the specified format (thermal or half_letter)
   * @param {string} contrato - Contract ID
   * @param {'thermal'|'half_letter'} format - Receipt layout type
   * @param {import('cassandra-driver').Client} client - Cassandra client instance
   * @returns {Promise<string>} Filename of the generated PDF
   */
  static async generatePreavisoPdf(contrato, format, client) {
    const filename = `preaviso_${contrato}_${format}.pdf`;
    const filepath = path.join(UPLOAD_DIR, filename);

    // 1. Fetch Contract Details
    const contractResult = await client.execute(
      "SELECT titular_contrato, ci_titular, medidor_iot, categoria, subcategoria, numero_catastro FROM contratos WHERE numero_contrato = ?",
      [contrato],
      { prepare: true }
    );
    if (contractResult.rows.length === 0) {
      throw new Error(`Contrato ${contrato} no encontrado.`);
    }
    const contract = contractResult.rows[0];

    // 2. Fetch Infrastructure Details
    let address = "No registrada";
    let zona = "Desconocido";
    let distrito = "N/A";
    if (contract.numero_catastro) {
      const infraResult = await client.execute(
        "SELECT direccion, zona, distrito FROM infraestructuras WHERE numero_catastro = ?",
        [contract.numero_catastro],
        { prepare: true }
      );
      if (infraResult.rows.length > 0) {
        const infra = infraResult.rows[0];
        address = infra.direccion || address;
        zona = infra.zona || zona;
        distrito = infra.distrito !== null ? String(infra.distrito) : distrito;
      }
    }

    // 3. Fetch Unpaid Bills to compute total debt
    const unpaidResult = await client.execute(
      "SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado FROM lecturas_unpaid_by_contrato WHERE numero_contrato = ?",
      [contrato],
      { prepare: true }
    );
    const unpaidBills = unpaidResult.rows;
    const totalDebt = unpaidBills.reduce((sum, b) => sum + b.monto_facturado, 0.0);

    // 4. Fetch Reading History (up to 6 months)
    let historyList = [];
    if (contract.medidor_iot) {
      const historyResult = await client.execute(
        "SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado FROM lecturas_by_medidor WHERE medidor_iot = ? LIMIT 6",
        [contract.medidor_iot],
        { prepare: true }
      );
      historyList = historyResult.rows;
    }

    // Identify latest reading details to display on the main bill section
    let latestReading = null;
    if (unpaidBills.length > 0) {
      latestReading = unpaidBills[0]; // Most recent unpaid reading
    } else if (historyList.length > 0) {
      latestReading = historyList[0]; // Most recent reading in general (paid)
    }

    const latestConsumo = latestReading ? latestReading.consumo : 0;
    const latestMonto = latestReading ? (latestReading.monto_facturado || 0) : 0.0;
    const latestLectAnt = latestReading ? latestReading.lectura_anterior : 0;
    const latestLectAct = latestReading ? latestReading.lectura_actual : 0;
    const latestDate = latestReading ? latestReading.fecha_hora_lectura : new Date();

    const decodedTitular = decodeUtf8(contract.titular_contrato);
    const decodedAddress = decodeUtf8(address);
    const decodedZona = decodeUtf8(zona);

    // Generate QR code data
    const qrText = `SEMAPA - Preaviso\nContrato: ${contrato}\nTitular: ${decodedTitular}\nCI: ${contract.ci_titular}\nDeuda: Bs. ${totalDebt.toFixed(2)}\nMedidor: ${contract.medidor_iot}`;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: format === 'thermal' ? [170, 460] : [612, 396], // 170x460pt (thermal ticket), 612x396pt (half-letter landscape)
        margin: format === 'thermal' ? 8 : 20
      });

      const writeStream = fs.createWriteStream(filepath);
      doc.pipe(writeStream);

      writeStream.on('finish', () => resolve(filename));
      writeStream.on('error', (err) => reject(err));

      if (format === 'thermal') {
        // --- THERMAL LAYOUT (55mm roll) ---
        // Header
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(12).text('SEMAPA', { align: 'center' });
        doc.font('Helvetica').fontSize(7.5).text('COCHABAMBA - BOLIVIA', { align: 'center' });
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9).text('PREAVISO DE COBRANZA', { align: 'center' });
        
        // Dashed divider
        doc.moveDown(0.2);
        doc.strokeColor('#555555').lineWidth(0.8).dash(2, { space: 2 })
           .moveTo(8, doc.y).lineTo(162, doc.y).stroke().undash();
        doc.moveDown(0.4);

        // Client details
        doc.font('Helvetica-Bold').fontSize(7.5).text('Nro. Contrato: ', { continued: true })
           .font('Helvetica').text(contrato);
        doc.font('Helvetica-Bold').text('Titular: ', { continued: true })
           .font('Helvetica').text(decodedTitular, { width: 140 });
        doc.font('Helvetica-Bold').text('C.I. / NIT: ', { continued: true })
           .font('Helvetica').text(contract.ci_titular || 'N/A');
        doc.font('Helvetica-Bold').text('Medidor IoT: ', { continued: true })
           .font('Helvetica').text(contract.medidor_iot || 'N/A');
        doc.font('Helvetica-Bold').text('Categoría: ', { continued: true })
           .font('Helvetica').text(`${contract.categoria || 'Residencial'}-${contract.subcategoria || 'R1'}`);

        // Dashed divider
        doc.moveDown(0.4);
        doc.strokeColor('#555555').lineWidth(0.8).dash(2, { space: 2 })
           .moveTo(8, doc.y).lineTo(162, doc.y).stroke().undash();
        doc.moveDown(0.4);

        // Consumption details
        doc.font('Helvetica-Bold').fontSize(7.5).text('Fecha Lectura: ', { continued: true })
           .font('Helvetica').text(formatDate(latestDate));
        doc.font('Helvetica-Bold').text('Lect. Anterior: ', { continued: true })
           .font('Helvetica').text(String(latestLectAnt));
        doc.font('Helvetica-Bold').text('Lect. Actual: ', { continued: true })
           .font('Helvetica').text(String(latestLectAct));
        doc.font('Helvetica-Bold').text('Consumo Período: ', { continued: true })
           .font('Helvetica').text(`${latestConsumo} m³`);
        doc.font('Helvetica-Bold').text('Monto del Mes: ', { continued: true })
           .font('Helvetica').text(`Bs. ${latestMonto.toFixed(2)}`);

        // Dashed divider
        doc.moveDown(0.4);
        doc.strokeColor('#555555').lineWidth(0.8).dash(2, { space: 2 })
           .moveTo(8, doc.y).lineTo(162, doc.y).stroke().undash();
        doc.moveDown(0.4);

        // Debt Total
        doc.fillColor(totalDebt > 0 ? '#cc0000' : '#006600')
           .font('Helvetica-Bold').fontSize(9.5)
           .text(`TOTAL DEUDA: Bs. ${totalDebt.toFixed(2)}`, { align: 'center' });
        doc.fontSize(7.5).text(totalDebt > 0 ? 'ESTADO: PENDIENTE' : 'ESTADO: AL DÍA', { align: 'center' });
        doc.fillColor('#000000').moveDown(0.5);

        // QR Code
        QRCode.toBuffer(qrText, { margin: 1, width: 80 }).then(qrBuffer => {
          const qrY = doc.y;
          doc.image(qrBuffer, (170 - 80) / 2, qrY, { width: 80 });
          doc.y = qrY + 85;

          // Footer info
          doc.font('Helvetica').fontSize(6.5).text('Preaviso digital referencial para pago.', { align: 'center' });
          doc.text('¡Cuidar el agua es deber de todos!', { align: 'center' });
          doc.end();
        }).catch(err => {
          doc.end();
          reject(err);
        });

      } else {
        // --- HALF LETTER LAYOUT (landscape) ---
        // Header bar
        doc.rect(20, 20, 572, 42).fill('#0284c7');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(15).text('SEMAPA', 30, 28);
        doc.font('Helvetica').fontSize(8.5).text('PREAVISO DIGITAL DE COBRANZA', 30, 46);
        
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(`CONTRATO Nro: ${contrato}`, 400, 32, { align: 'right', width: 180 });

        // Left Column (y starts at 75)
        // Background card
        doc.rect(20, 72, 270, 275).fill('#f8fafc');
        
        // Titles & Details
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('DATOS DEL TITULAR Y SERVICIO', 30, 82);
        
        let detailY = 98;
        const lineSpacing = 13.5;
        
        const renderRow = (label, val, maxW = 180) => {
          doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text(label, 30, detailY);
          doc.fillColor('#0f172a').font('Helvetica').fontSize(7.5).text(val, 90, detailY, { width: maxW });
          detailY += lineSpacing;
        };

        renderRow('Titular:', decodedTitular, 190);
        // adjust detailY dynamic spacing if titular is long (we want a strict vertical alignment)
        if (decodedTitular.length > 40) detailY += 8;

        renderRow('C.I. / NIT:', contract.ci_titular || 'N/A');
        
        // Address row needs wrapping
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(7.5).text('Dirección:', 30, detailY);
        doc.fillColor('#0f172a').font('Helvetica').fontSize(7.5).text(decodedAddress, 90, detailY, { width: 190, height: 24 });
        detailY += 22; // address takes up 2 lines normally
        
        renderRow('Zona/Dist:', `${decodedZona} / Dist. ${distrito}`);
        renderRow('Medidor IoT:', contract.medidor_iot || 'N/A');
        renderRow('Categoría:', `${contract.categoria || 'Residencial'} - ${contract.subcategoria || 'R1'}`);

        // Divider
        doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(30, 192).lineTo(280, 192).stroke();

        // Consumos details section
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('DETALLE DE CONSUMO Y COBRO', 30, 202);
        
        detailY = 218;
        renderRow('Fecha Lectura:', formatDate(latestDate));
        renderRow('Lecturas (A/N):', `${latestLectAct} m³ / ${latestLectAnt} m³`);
        renderRow('Consumo Mes:', `${latestConsumo} m³`);
        renderRow('Monto Período:', `Bs. ${latestMonto.toFixed(2)}`);

        // Debt Total box at the bottom left column
        const boxColor = totalDebt > 0 ? '#fee2e2' : '#dcfce7';
        const textColor = totalDebt > 0 ? '#991b1b' : '#166534';
        const labelText = totalDebt > 0 ? `DEUDA TOTAL: Bs. ${totalDebt.toFixed(2)}` : 'AL DÍA / SIN DEUDA';
        doc.rect(30, 290, 250, 42).fill(boxColor);
        doc.fillColor(textColor).font('Helvetica-Bold').fontSize(11).text(labelText, 35, 305, { align: 'center', width: 240 });

        // Right Column (x starts at 305)
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(9).text('HISTORIAL DE CONSUMOS (ÚLTIMOS MESES)', 305, 72);
        
        // Draw History Table Header
        doc.rect(305, 87, 287, 14).fill('#e2e8f0');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7);
        doc.text('Fecha', 310, 91);
        doc.text('Lectura', 370, 91, { width: 45, align: 'right' });
        doc.text('Consumo', 420, 91, { width: 45, align: 'right' });
        doc.text('Monto', 470, 91, { width: 50, align: 'right' });
        doc.text('Estado', 525, 91, { width: 60, align: 'center' });

        // Render up to 5 history rows
        let rowY = 106;
        const rowHeight = 14.5;
        for (let i = 0; i < Math.min(5, historyList.length); i++) {
          const h = historyList[i];
          if (i % 2 === 1) {
            doc.rect(305, rowY - 2, 287, rowHeight).fill('#f8fafc');
          }
          
          doc.fillColor('#475569').font('Helvetica').fontSize(7);
          doc.text(formatDate(h.fecha_hora_lectura), 310, rowY);
          doc.text(String(h.lectura_actual), 370, rowY, { width: 45, align: 'right' });
          doc.text(`${h.consumo} m³`, 420, rowY, { width: 45, align: 'right' });
          doc.text(`Bs. ${(h.monto_facturado || 0).toFixed(2)}`, 470, rowY, { width: 50, align: 'right' });
          
          const statusText = h.pagado ? 'Pagado' : 'Impago';
          const statusColor = h.pagado ? '#166534' : '#b91c1c';
          doc.fillColor(statusColor).font('Helvetica-Bold').text(statusText, 525, rowY, { width: 60, align: 'center' });
          
          rowY += rowHeight;
        }

        // QR Code area
        doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('Escanee este código QR para pago digital y más detalles:', 305, 192, { align: 'center', width: 287 });
        
        QRCode.toBuffer(qrText, { margin: 1, width: 85 }).then(qrBuffer => {
          doc.image(qrBuffer, 406, 205, { width: 85 });
          
          // Footer notice
          doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text('Preaviso digital referencial válido para cobro en entidades bancarias autorizadas.', 305, 305, { align: 'center', width: 287 });
          doc.text('Ahorre agua, preserve el futuro.', 305, 317, { align: 'center', width: 287 });

          // Bottom black band
          doc.rect(20, 355, 572, 21).fill('#0f172a');
          doc.fillColor('#ffffff').font('Helvetica').fontSize(7).text('SEMAPA - Agua Limpia, Vida Sana. Oficina Central: Cochabamba, Bolivia. Teléfono de emergencias: 178', 20, 362, { align: 'center', width: 572 });

          doc.end();
        }).catch(err => {
          doc.end();
          reject(err);
        });
      }
    });
  }
}
