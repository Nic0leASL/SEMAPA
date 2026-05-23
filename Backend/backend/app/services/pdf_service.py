import os
import logging
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.barcode.qr import QrCodeWidget
from app.cassandra.connection import CassandraConnection

logger = logging.getLogger("PDFService")

class PdfService:
    @staticmethod
    def get_qr_drawing(text: str, size: float = 80) -> Drawing:
        """Returns a vector Drawing containing the QR code, scaled to the target size."""
        try:
            qr_code = QrCodeWidget(text)
            bounds = qr_code.getBounds()
            qr_w = bounds[2] - bounds[0]
            qr_h = bounds[3] - bounds[1]
            # scale transform matrix
            d = Drawing(size, size, transform=[size / qr_w, 0, 0, size / qr_h, 0, 0])
            d.add(qr_code)
            return d
        except Exception as e:
            logger.warning(f"Failed to generate vector QR: {e}. Generating placeholder Drawing.")
            d = Drawing(size, size)
            d.add(Rect(0, 0, size, size, fillColor=colors.lightgrey, strokeColor=colors.grey))
            d.add(String(10, size/2 - 4, "QR Code", fontSize=8, fillColor=colors.black))
            return d

    @classmethod
    def generate_preaviso_pdf(cls, contract_num: str, format_type: str) -> str:
        """
        Generates invoice PDF in either 55mm thermal ('thermal') or Half Letter ('half_letter') formats.
        Returns the generated filename saved in the uploads/ directory.
        """
        session = CassandraConnection.get_session()
        
        # 1. Fetch Contract data
        c_rows = list(session.execute(f"SELECT titular_contrato, ci_titular, medidor_iot, categoria, subcategoria, numero_catastro FROM contratos WHERE numero_contrato = '{contract_num}'"))
        if not c_rows:
            raise ValueError(f"Contract {contract_num} not found.")
        c = c_rows[0]

        # 2. Fetch Unpaid Bills
        unpaid = list(session.execute(f"SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado FROM lecturas_unpaid_by_contrato WHERE numero_contrato = '{contract_num}'"))
        
        # 3. Fetch History of consumption (last 6 months) for preaviso history
        history = list(session.execute(f"SELECT fecha_hora_lectura, consumo, pagado FROM lecturas_by_medidor WHERE medidor_iot = '{c.medidor_iot}' LIMIT 6"))

        # Details
        total_debt = sum(b.monto_facturado for b in unpaid)
        latest_consumption = unpaid[0].consumo if unpaid else 0
        latest_amount = unpaid[0].monto_facturado if unpaid else 0.0
        latest_date = unpaid[0].fecha_hora_lectura if unpaid else datetime.now()
        deadline = latest_date + timedelta(days=15)

        # Output folder
        uploads_dir = "uploads"
        os.makedirs(uploads_dir, exist_ok=True)
        filename = f"preaviso_{contract_num}_{format_type}.pdf"
        filepath = os.path.join(uploads_dir, filename)

        styles = getSampleStyleSheet()
        
        if format_type == "thermal":
            # 55mm width = 155.9 points, variable height (say 420pt)
            doc = SimpleDocTemplate(
                filepath,
                pagesize=(155.9, 450.0),
                leftMargin=8,
                rightMargin=8,
                topMargin=10,
                bottomMargin=10
            )
            
            # Tiny styles for 55mm thermal roll
            title_style = ParagraphStyle(
                'ThermalTitle',
                fontName='Helvetica-Bold',
                fontSize=9,
                leading=10,
                alignment=1, # Center
                textColor=colors.HexColor('#0F294A')
            )
            subtitle_style = ParagraphStyle(
                'ThermalSub',
                fontName='Helvetica',
                fontSize=6.5,
                leading=8,
                alignment=1,
                textColor=colors.grey
            )
            text_style = ParagraphStyle(
                'ThermalText',
                fontName='Helvetica',
                fontSize=6.5,
                leading=8,
                textColor=colors.black
            )
            bold_style = ParagraphStyle(
                'ThermalBold',
                fontName='Helvetica-Bold',
                fontSize=6.5,
                leading=8,
                textColor=colors.black
            )
            center_style = ParagraphStyle(
                'ThermalCenter',
                fontName='Helvetica',
                fontSize=6,
                leading=7.5,
                alignment=1
            )

            story = []
            story.append(Paragraph("SEMAPA COCHABAMBA", title_style))
            story.append(Paragraph("Servicio de Agua Potable y Alcantarillado", subtitle_style))
            story.append(Spacer(1, 4))
            
            # Divider
            d_line = Drawing(140, 2)
            d_line.add(Line(0, 0, 140, 0, strokeColor=colors.HexColor('#0F294A'), strokeWidth=0.75))
            story.append(d_line)
            story.append(Spacer(1, 4))

            # Info Table
            info_data = [
                [Paragraph("<b>CONTRATO:</b>", text_style), Paragraph(contract_num, bold_style)],
                [Paragraph("<b>CATASTRO:</b>", text_style), Paragraph(c.numero_catastro, text_style)],
                [Paragraph("<b>CLIENTE:</b>", text_style), Paragraph(c.titular_contrato[:20], text_style)],
                [Paragraph("<b>MEDIDOR:</b>", text_style), Paragraph(c.medidor_iot, text_style)],
                [Paragraph("<b>CATEGORIA:</b>", text_style), Paragraph(f"{c.categoria} ({c.subcategoria})", text_style)],
            ]
            t_info = Table(info_data, colWidths=[50, 90])
            t_info.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('BOTTOMPADDING', (0,0), (-1,-1), 1),
                ('TOPPADDING', (0,0), (-1,-1), 1),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ]))
            story.append(t_info)
            story.append(Spacer(1, 4))
            story.append(d_line)
            story.append(Spacer(1, 4))

            # Billing Table
            bill_data = [
                [Paragraph("Concepto / Mes", bold_style), Paragraph("Cons. (m3)", bold_style), Paragraph("Imp. (Bs)", bold_style)],
            ]
            
            if unpaid:
                for b in unpaid[:3]: # Show top 3 unpaid bills
                    month_name = b.fecha_hora_lectura.strftime("%m/%y")
                    bill_data.append([
                        Paragraph(f"Agua Potable - {month_name}", text_style),
                        Paragraph(str(b.consumo), text_style),
                        Paragraph(f"{b.monto_facturado:.2f}", text_style)
                    ])
            else:
                bill_data.append([Paragraph("Consumos pagados al día", text_style), Paragraph("-", text_style), Paragraph("0.00", text_style)])
                
            t_bill = Table(bill_data, colWidths=[70, 35, 35])
            t_bill.setStyle(TableStyle([
                ('LINEBELOW', (0,0), (-1,0), 0.5, colors.grey),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                ('TOPPADDING', (0,0), (-1,-1), 2),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ]))
            story.append(t_bill)
            story.append(Spacer(1, 4))
            story.append(d_line)
            story.append(Spacer(1, 4))

            # Totals
            totals_data = [
                [Paragraph("<b>DEUDA TOTAL:</b>", text_style), Paragraph(f"<b>Bs. {total_debt:.2f}</b>", bold_style)],
                [Paragraph("F. Límite Pago:", text_style), Paragraph(deadline.strftime("%d/%m/%Y"), bold_style)]
            ]
            t_tot = Table(totals_data, colWidths=[75, 65])
            t_tot.setStyle(TableStyle([
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ]))
            story.append(t_tot)
            story.append(Spacer(1, 8))

            # Embed Vector QR Code
            qr_content = f"SEMAPA - Contrato: {contract_num} | Deuda: Bs. {total_debt:.2f} | Vence: {deadline.strftime('%d/%m/%Y')}"
            qr_drawing = cls.get_qr_drawing(qr_content, size=55)
            
            # Align QR in center using a single-column table
            qr_table = Table([[qr_drawing]], colWidths=[140])
            qr_table.setStyle(TableStyle([
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ]))
            story.append(qr_table)
            
            story.append(Spacer(1, 6))
            story.append(Paragraph("Conserve su recibo físico.<br/>¡Gracias por su pago puntual!", center_style))

            doc.build(story)

        else:
            # Half Letter size = 5.5 x 8.5 inches (396 x 612 points)
            # Portrait mode
            doc = SimpleDocTemplate(
                filepath,
                pagesize=(396.0, 612.0),
                leftMargin=18,
                rightMargin=18,
                topMargin=15,
                bottomMargin=15
            )

            # Styles for Half Letter
            title_style = ParagraphStyle(
                'HalfTitle',
                fontName='Helvetica-Bold',
                fontSize=14,
                leading=16,
                textColor=colors.HexColor('#0F294A')
            )
            section_style = ParagraphStyle(
                'HalfSec',
                fontName='Helvetica-Bold',
                fontSize=9,
                leading=11,
                textColor=colors.HexColor('#0F294A')
            )
            text_style = ParagraphStyle(
                'HalfText',
                fontName='Helvetica',
                fontSize=7.5,
                leading=9,
                textColor=colors.black
            )
            bold_style = ParagraphStyle(
                'HalfBold',
                fontName='Helvetica-Bold',
                fontSize=7.5,
                leading=9,
                textColor=colors.black
            )
            center_style = ParagraphStyle(
                'HalfCenter',
                fontName='Helvetica',
                fontSize=7,
                leading=9,
                alignment=1,
                textColor=colors.grey
            )

            story = []

            # Header Layout: Two column (SEMAPA Title left, PREAVISO right)
            header_table = Table([
                [Paragraph("<b>SEMAPA</b> COCHABAMBA", title_style), 
                 Paragraph("<b>PREAVISO DE COBRANZA</b>", ParagraphStyle('RightBold', fontName='Helvetica-Bold', fontSize=10, leading=12, alignment=2, textColor=colors.HexColor('#0D7E8A')))]
            ], colWidths=[200, 160])
            header_table.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ]))
            story.append(header_table)
            story.append(Spacer(1, 5))

            # Divider line
            d_line = Drawing(360, 2)
            d_line.add(Line(0, 0, 360, 0, strokeColor=colors.HexColor('#0F294A'), strokeWidth=1.5))
            story.append(d_line)
            story.append(Spacer(1, 6))

            # Client & Meter Details table (Rounded style with Table background)
            details_data = [
                [Paragraph("<b>Nro. Contrato:</b>", text_style), Paragraph(contract_num, bold_style),
                 Paragraph("<b>Nro. Catastro:</b>", text_style), Paragraph(c.numero_catastro, text_style)],
                [Paragraph("<b>Titular:</b>", text_style), Paragraph(c.titular_contrato, text_style),
                 Paragraph("<b>C.I.:</b>", text_style), Paragraph(c.ci_titular, text_style)],
                [Paragraph("<b>Categoría:</b>", text_style), Paragraph(f"{c.categoria} - {c.subcategoria}", text_style),
                 Paragraph("<b>ID Medidor:</b>", text_style), Paragraph(c.medidor_iot, text_style)],
            ]
            t_details = Table(details_data, colWidths=[70, 110, 75, 105])
            t_details.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#F4F7FA')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#D2D9E2')),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('LEFTPADDING', (0,0), (-1,-1), 6),
                ('RIGHTPADDING', (0,0), (-1,-1), 6),
            ]))
            story.append(t_details)
            story.append(Spacer(1, 10))

            # Inner Columns Layout: Unpaid details (left) & QR/History (right)
            # Left: Invoice items
            story.append(Paragraph("DETALLE DE FACTURAS PENDIENTES", section_style))
            story.append(Spacer(1, 3))
            
            bill_data = [
                [Paragraph("Periodo", bold_style), Paragraph("Lect. Anterior", bold_style), Paragraph("Lect. Actual", bold_style), Paragraph("Cons. (m3)", bold_style), Paragraph("Monto (Bs)", bold_style)]
            ]
            
            if unpaid:
                for u in unpaid[:4]:
                    period = u.fecha_hora_lectura.strftime("%m/%Y")
                    bill_data.append([
                        Paragraph(period, text_style),
                        Paragraph(str(u.lectura_anterior), text_style),
                        Paragraph(str(u.lectura_actual), text_style),
                        Paragraph(f"{u.consumo} $m^3$", text_style),
                        Paragraph(f"Bs. {u.monto_facturado:.2f}", bold_style)
                    ])
            else:
                bill_data.append([Paragraph("No se registran facturas pendientes.", text_style), Paragraph("-", text_style), Paragraph("-", text_style), Paragraph("-", text_style), Paragraph("Bs. 0.00", text_style)])
                
            t_bill = Table(bill_data, colWidths=[75, 75, 75, 65, 70])
            t_bill.setStyle(TableStyle([
                ('LINEBELOW', (0,0), (-1,0), 1, colors.HexColor('#0F294A')),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#EAEFF5')),
                ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor('#C8D1DB')),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('TOPPADDING', (0,0), (-1,-1), 4),
                ('LEFTPADDING', (0,0), (-1,-1), 6),
                ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
            ]))
            story.append(t_bill)
            story.append(Spacer(1, 10))

            # Bottom: summary totals and QR
            qr_content = f"SEMAPA - Contrato: {contract_num} | Deuda: Bs. {total_debt:.2f} | Vence: {deadline.strftime('%d/%m/%Y')}"
            qr_drawing = cls.get_qr_drawing(qr_content, size=75)

            # Summary and history layout side-by-side
            # Left: Totals and message, Right: QR Code
            summary_left_data = [
                [Paragraph("<b>TOTAL DEUDA EXIGIBLE:</b>", ParagraphStyle('LargeText', fontName='Helvetica-Bold', fontSize=9, leading=10)),
                 Paragraph(f"<b>Bs. {total_debt:.2f}</b>", ParagraphStyle('LargeTextBold', fontName='Helvetica-Bold', fontSize=10, leading=10, textColor=colors.HexColor('#D9383A')))],
                [Paragraph("<b>FECHA LÍMITE DE PAGO:</b>", text_style), Paragraph(deadline.strftime("%d/%m/%Y"), bold_style)],
                [Paragraph("<i>Nota: Realice el pago en oficinas de SEMAPA o entidades financieras autorizadas. Evite el corte de servicio.</i>", ParagraphStyle('TinyNote', fontName='Helvetica-Oblique', fontSize=6, leading=7)), Paragraph("", text_style)]
            ]
            t_summary_left = Table(summary_left_data, colWidths=[150, 100])
            t_summary_left.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'TOP'),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
            ]))

            bottom_table = Table([
                [t_summary_left, qr_drawing]
            ], colWidths=[260, 100])
            bottom_table.setStyle(TableStyle([
                ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                ('ALIGN', (1,0), (1,0), 'RIGHT'),
                ('LEFTPADDING', (0,0), (-1,-1), 0),
                ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ]))
            
            story.append(d_line)
            story.append(Spacer(1, 5))
            story.append(bottom_table)
            
            # Consumption History Table (mini)
            story.append(Spacer(1, 6))
            story.append(Paragraph("HISTORIAL DE CONSUMOS RECIENTES", section_style))
            story.append(Spacer(1, 3))
            
            hist_headers = [Paragraph("Mes/Año", bold_style)]
            hist_values = [Paragraph("Consumo", text_style)]
            for h in reversed(history[:6]):
                date_str = h.fecha_hora_lectura.strftime("%m/%y") if h.fecha_hora_lectura else "N/A"
                hist_headers.append(Paragraph(date_str, bold_style))
                hist_values.append(Paragraph(f"{h.consumo} $m^3$", text_style))
                
            t_hist = Table([hist_headers, hist_values], colWidths=[60] + [50]*len(history[:6]))
            t_hist.setStyle(TableStyle([
                ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#C8D1DB')),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F4F7FA')),
                ('BOTTOMPADDING', (0,0), (-1,-1), 3),
                ('TOPPADDING', (0,0), (-1,-1), 3),
                ('ALIGN', (0,0), (-1,-1), 'CENTER'),
            ]))
            story.append(t_hist)

            story.append(Spacer(1, 8))
            story.append(Paragraph("Conserve este preaviso. Esta no es una factura fiscal válida.", center_style))

            doc.build(story)

        logger.info(f"PDF generated successfully: {filepath}")
        return filename
