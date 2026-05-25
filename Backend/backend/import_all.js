import cassandra from 'cassandra-driver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import csv from 'csv-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new cassandra.Client({
  contactPoints: ['cassandra-node1', '127.0.0.1'],
  localDataCenter: 'datacenter1',
  keyspace: 'semapa',
  protocolOptions: { port: 9042 },
  socketOptions: { connectTimeout: 10000 }
});

function decodeUtf8(str) {
  if (!str) return '';
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã /g, 'Á')
      .replace(/Ã‰/g, 'É')
      .replace(/Ã /g, 'Í')
      .replace(/Ã“/g, 'Ó')
      .replace(/Ãš/g, 'Ú')
      .replace(/Ã‘/g, 'Ñ');
  }
}

async function parseCsv(filepath, skipLines = 0, headers = null) {
  return new Promise((resolve, reject) => {
    const results = [];
    const content = fs.readFileSync(filepath, 'latin1');
    const lines = content.split(/\r?\n/);
    const cleanContent = lines.slice(skipLines).join('\n');
    const options = headers ? { headers } : {};
    
    Readable.from(cleanContent)
      .pipe(csv(options))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err));
  });
}

async function executeConcurrent(query, paramsArray, concurrency = 100) {
  const queryOptions = { prepare: true };
  let index = 0;
  const promises = [];
  
  async function worker() {
    while (index < paramsArray.length) {
      const currentIdx = index++;
      const params = paramsArray[currentIdx];
      try {
        await client.execute(query, params, queryOptions);
      } catch (err) {
        console.error(`Insert failed at index ${currentIdx}: ${err.message}`);
      }
    }
  }
  
  for (let i = 0; i < Math.min(concurrency, paramsArray.length); i++) {
    promises.push(worker());
  }
  
  await Promise.all(promises);
}

const DATOS_DIR = path.join(__dirname, '..', 'datos');
const files = {
  distritos: path.join(DATOS_DIR, '03 Practica 5 Recursos - Distritos.csv'),
  contratos: path.join(DATOS_DIR, '03 Practica 5 Recursos contratos_agua.csv'),
  infraestructura: path.join(DATOS_DIR, '03 Practica 5 Recursos infraestructuras_cochabamba.csv'),
  medidores: path.join(DATOS_DIR, '03 Practica 5 Recursos medidores_iot.csv'),
  lecturas: path.join(DATOS_DIR, '03 Practica 5 Recursos lecturas_iot.csv')
};

async function run() {
  console.log("Starting data cleaning and re-ingestion script...");
  const overallStart = Date.now();
  
  try {
    await client.connect();
    console.log("Connected to Cassandra cluster successfully.");

    // Clean tables first to avoid stale data
    const tablesToClean = [
      'distritos', 'contratos', 'contratos_by_ci', 'infraestructuras', 'medidores', 
      'medidores_by_distrito', 'lecturas_by_medidor', 'lecturas_by_zona', 'lecturas_by_distrito',
      'lecturas_unpaid_by_contrato', 'tarifas', 'errores_iot', 'lecturas_duplicadas_log',
      'reporte_consumo_zona', 'reporte_consumo_distrito', 'reporte_financiero', 'reporte_errores'
    ];

    console.log("Truncating existing tables...");
    for (const t of tablesToClean) {
      await client.execute(`TRUNCATE ${t}`).catch(e => console.warn(`Could not truncate ${t}: ${e.message}`));
    }
    console.log("Tables truncated.");

    // Step 1: Seed default tariffs
    console.log("Seeding default tariffs...");
    const defaultTariffs = {
      "Residencial-R1": 2.00, "Residencial-R2": 2.50, "Residencial-R3": 3.50, "Residencial-R4": 5.00,
      "Comercial-C": 8.00, "Comercial-CE": 9.50, "Industrial-I": 12.00, "Preferencial-P": 3.00, "Social-S": 1.50,
      "R1": 2.00, "R2": 2.50, "R3": 3.50, "R4": 5.00, "C": 8.00, "CE": 9.50, "I": 12.00, "P": 3.00, "S": 1.50,
      "Residencial": 2.50, "Comercial": 8.00, "Industrial": 12.00, "Preferencial": 3.00, "Social": 1.50
    };
    const tariffParams = Object.entries(defaultTariffs).map(([k, v]) => [k, parseFloat(v)]);
    await executeConcurrent("INSERT INTO tarifas (categoria, precio_m3) VALUES (?, ?)", tariffParams, 10);

    // Step 2: Distritos
    console.log("Importing Distritos...");
    const distHeaders = [
      'sub_alcaldia', 'distrito', 'sub_distrito', 'zona', 'gateway', 
      'altitude', 'codigo', 'habitantes', 'r1', 'r2', 'r3', 'r4', 
      'c', 'ce', 'i', 'p', 's', 'total'
    ];
    const rawDist = await parseCsv(files.distritos, 2, distHeaders);
    let lastSubAlcaldia = '';
    let lastDistrito = 0;
    let lastHabitantes = 0;
    
    const distParams = [];
    for (const row of rawDist) {
      if (!row.sub_distrito || !row.zona) continue;
      const sub_alcaldia = decodeUtf8((row.sub_alcaldia || lastSubAlcaldia).trim());
      const distrito = parseInt(row.distrito || lastDistrito);
      const habitantes = parseInt(row.habitantes || lastHabitantes);
      
      lastSubAlcaldia = sub_alcaldia;
      lastDistrito = distrito;
      lastHabitantes = habitantes;
      
      distParams.push([
        distrito, parseInt(row.sub_distrito || '0'), decodeUtf8(row.zona.trim()), sub_alcaldia,
        decodeUtf8((row.gateway || 'Desconocido').trim()), parseFloat(row.altitude || '0.0'),
        parseInt(row.codigo || '0'), habitantes, parseInt(row.r1 || '0'), parseInt(row.r2 || '0'),
        parseInt(row.r3 || '0'), parseInt(row.r4 || '0'), parseInt(row.c || '0'), parseInt(row.ce || '0'),
        parseInt(row.i || '0'), parseInt(row.p || '0'), parseInt(row.s || '0'), parseInt(row.total || '0')
      ]);
    }
    const distQuery = `
      INSERT INTO distritos (
        distrito, sub_distrito, zona, sub_alcaldia, gateway, altitude, codigo, habitantes,
        r1, r2, r3, r4, c, ce, i, p, s, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await executeConcurrent(distQuery, distParams, 50);
    console.log(`Imported ${distParams.length} districts.`);

    // Step 3: Contratos (skipLines = 0)
    console.log("Importing Contratos...");
    const rawContratos = await parseCsv(files.contratos, 0);
    const contractsParams = [];
    const contractsByCiParams = [];
    
    for (const row of rawContratos) {
      const numContrato = (row.numero_contrato || '').trim();
      if (!numContrato) continue;
      const numCatastro = (row.numero_catastro || '').trim();
      const titular = decodeUtf8((row.titular_contrato || '').trim());
      const ci = (row.ci_titular || '').trim();
      const cat = decodeUtf8((row.categoria || '').trim());
      const sub = decodeUtf8((row.subcategoria || '').trim());
      const medId = (row.medidor_iot || '').trim();
      const fecha = (row.fecha_contrato || '').trim();
      const estado = decodeUtf8((row.estado_contrato || '').trim());
      const diam = (row.diametro_conexion || '').trim();
      const tipo = decodeUtf8((row.tipo_servicio || '').trim());

      contractsParams.push([numContrato, numCatastro, titular, ci, cat, sub, medId, fecha, estado, diam, tipo]);
      contractsByCiParams.push([ci, numContrato, numCatastro, titular, cat, sub, medId, fecha, estado, diam, tipo]);
    }
    const qContratos = "INSERT INTO contratos (numero_contrato, numero_catastro, titular_contrato, ci_titular, categoria, subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const qByCi = "INSERT INTO contratos_by_ci (ci_titular, numero_contrato, numero_catastro, titular_contrato, categoria, subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    await executeConcurrent(qContratos, contractsParams, 100);
    await executeConcurrent(qByCi, contractsByCiParams, 100);
    console.log(`Imported ${contractsParams.length} contracts.`);

    // Step 4: Infraestructuras (skipLines = 0)
    console.log("Importing Infraestructuras...");
    const rawInfra = await parseCsv(files.infraestructura, 0);
    const infraParams = [];
    
    for (const row of rawInfra) {
      const catastro = (row.numero_catastro || '').trim();
      if (!catastro) continue;
      infraParams.push([
        catastro, decodeUtf8((row.propietario || '').trim()), (row.ci || '').trim(),
        decodeUtf8((row.direccion || '').trim()), decodeUtf8((row.zona || '').trim()),
        parseInt(row.distrito || '0'), parseInt(row.manzano || '0'), parseInt(row.lote || '0'),
        parseInt(row.superficie_terreno || '0'), parseInt(row.area_construida || '0'),
        decodeUtf8((row.uso_suelo || '').trim()), (row.matricula_ddrr || '').trim(),
        parseInt(row.valor_catastral || '0'), parseFloat(row.impuesto_anual || '0.0'),
        parseFloat(row.latitud || '0.0'), parseFloat(row.longitud || '0.0')
      ]);
    }
    const qInfra = `
      INSERT INTO infraestructuras (
        numero_catastro, propietario, ci, direccion, zona, distrito, manzano, lote,
        superficie_terreno, area_construida, uso_suelo, matricula_ddrr, valor_catastral,
        impuesto_anual, latitud, longitud
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await executeConcurrent(qInfra, infraParams, 100);
    console.log(`Imported ${infraParams.length} properties.`);

    // Step 5: Medidores (skipLines = 0)
    console.log("Importing Medidores...");
    const rawMedidores = await parseCsv(files.medidores, 0);
    const medParams = [];
    let totalDanados = 0;
    let totalMantenimiento = 0;

    for (const row of rawMedidores) {
      const medId = (row.medidor_iot || '').trim();
      if (!medId) continue;
      const estado = decodeUtf8((row.estado || '').trim());
      if (estado === 'Dañado') totalDanados++;
      if (estado === 'Mantenimiento') totalMantenimiento++;

      medParams.push([
        medId, (row.fecha_instalacion || '').trim(),
        row.fecha_desinstalacion ? row.fecha_desinstalacion.trim() : null,
        estado, parseInt(row.tipo_medidor_id || '0')
      ]);
    }
    const qMed = "INSERT INTO medidores (medidor_iot, fecha_instalacion, fecha_desinstalacion, estado, tipo_medidor_id) VALUES (?, ?, ?, ?, ?)";
    await executeConcurrent(qMed, medParams, 100);
    console.log(`Imported ${medParams.length} meters.`);

    // Generate medidores_by_distrito mapping
    console.log("Generating medidores_by_distrito mapping...");
    const contractsMap = {};
    contractsParams.forEach(c => {
      contractsMap[c[6]] = { numero_contrato: c[0], numero_catastro: c[1] };
    });
    const infraMap = {};
    infraParams.forEach(i => {
      infraMap[i[0]] = { zona: i[4], distrito: i[5], latitud: i[14], longitud: i[15] };
    });

    const medDistParams = [];
    const medErrParams = [];
    const now = new Date();

    for (const row of medParams) {
      const medId = row[0];
      const estado = row[3];
      const tipoId = row[4];
      const mapped = contractsMap[medId];
      if (mapped) {
        const loc = infraMap[mapped.numero_catastro];
        if (loc) {
          medDistParams.push([
            loc.distrito, medId, loc.zona, mapped.numero_contrato, mapped.numero_catastro,
            loc.latitud, loc.longitud, estado, tipoId
          ]);

          if (estado === 'Dañado' || estado === 'Mantenimiento') {
            const code = estado === 'Dañado' ? 'FALLA_HARDWARE' : 'MANTENIMIENTO';
            const desc = estado === 'Dañado'
              ? 'Falla crítica de comunicación de hardware con radiobase principal'
              : 'Revisión técnica programada por inconsistencia de lecturas';
            
            medErrParams.push([
              medId, now, tipoId, code, desc, 1, loc.distrito, loc.zona
            ]);
          }
        }
      }
    }
    const qMedDist = "INSERT INTO medidores_by_distrito (distrito, medidor_iot, zona, numero_contrato, numero_catastro, latitud, longitud, estado, tipo_medidor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";
    await executeConcurrent(qMedDist, medDistParams, 100);
    console.log(`Generated ${medDistParams.length} medidores_by_distrito entries.`);

    if (medErrParams.length > 0) {
      const qErr = "INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase, distrito, zona) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      await executeConcurrent(qErr, medErrParams, 100);
      console.log(`Generated ${medErrParams.length} error logs in errores_iot.`);
    }

    // Write to reports error summary table
    await client.execute(`
      INSERT INTO reporte_errores (key, total_danados, total_mantenimiento)
      VALUES ('summary', ?, ?)
    `, [cassandra.types.Long.fromNumber(totalDanados), cassandra.types.Long.fromNumber(totalMantenimiento)], { prepare: true });

    // Step 6: Lecturas (skipLines = 0)
    console.log("Importing and Processing Lecturas...");
    const rawLecturas = await parseCsv(files.lecturas, 0);
    
    // Sort and parse dates
    for (const r of rawLecturas) {
      if (!r.fechaHoraLectura) continue;
      const [datePart, timePart] = r.fechaHoraLectura.split(' ');
      const [m, d, y] = datePart.split('/');
      const [h, min] = timePart.split(':');
      const year = parseInt(y) + 2000;
      r.parsedDate = new Date(Date.UTC(year, parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min)));
      r.dateOnlyStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    const cleanRaw = rawLecturas.filter(r => r.parsedDate && !isNaN(r.parsedDate.getTime()));
    cleanRaw.sort((a, b) => a.parsedDate - b.parsedDate);

    // Deduplicate
    const seen = new Set();
    const validReadings = [];
    const duplicateReadings = [];
    
    for (const r of cleanRaw) {
      const key = `${r.medidor_iot}_${r.dateOnlyStr}`;
      if (seen.has(key)) {
        duplicateReadings.push(r);
      } else {
        seen.add(key);
        validReadings.push(r);
      }
    }
    console.log(`Deduplication: Valid = ${validReadings.length}, Duplicates = ${duplicateReadings.length}`);

    // Insert duplicates
    if (duplicateReadings.length > 0) {
      const qDup = "INSERT INTO lecturas_duplicadas_log (medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo) VALUES (?, ?, ?, ?, ?, 'Duplicado - Múltiples señales en el mismo día')";
      const dupParams = duplicateReadings.map(r => [
        r.medidor_iot, r.parsedDate, parseInt(r.lecturaAnterior), parseInt(r.LecturaActual), parseInt(r.radiobase)
      ]);
      await executeConcurrent(qDup, dupParams, 100);
    }

    // Filter negative anomalies
    const cleanReadings = [];
    const anomalies = [];
    for (const r of validReadings) {
      const current = parseInt(r.LecturaActual || '0');
      const previous = parseInt(r.lecturaAnterior || '0');
      if (current < previous) {
        anomalies.push(r);
      } else {
        cleanReadings.push(r);
      }
    }
    console.log(`Anomalies: Clean = ${cleanReadings.length}, Negative anomalies = ${anomalies.length}`);

    // Insert anomalies (including district and zone!)
    if (anomalies.length > 0) {
      const qErr = "INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase, distrito, zona) VALUES (?, ?, 1, 'LECTURA_NEGATIVA', ?, ?, ?, ?)";
      const errParams = anomalies.map(r => {
        const c = contractsMap[r.medidor_iot] || {};
        const loc = infraMap[c.numero_catastro] || {};
        return [
          r.medidor_iot, 
          r.parsedDate, 
          `Lectura actual (${r.LecturaActual}) menor a anterior (${r.lecturaAnterior})`, 
          parseInt(r.radiobase || '0'),
          loc.distrito || 0,
          loc.zona || 'Desconocido'
        ];
      });
      await executeConcurrent(qErr, errParams, 100);
    }

    // Ingest Enriched Readings
    const distHabsMap = {};
    distParams.forEach(d => {
      distHabsMap[d[0]] = d[7] || 1000;
    });

    const zoneAgg = {};
    const distAgg = {};
    let totalPaidFinancial = 0.0;
    let totalUnpaidFinancial = 0.0;
    const uniqueMorososSet = new Set();

    const paramsByMedidor = [];
    const paramsByZona = [];
    const paramsByDistrito = [];
    const paramsUnpaid = [];

    for (const r of cleanReadings) {
      const c = contractsMap[r.medidor_iot] || {};
      const numContrato = c.numero_contrato || 'Sin Contrato';
      const cat = c.categoria || 'Residencial';
      const sub = c.subcategoria || 'R1';
      
      const loc = infraMap[c.numero_catastro] || {};
      const zonaName = loc.zona || 'Desconocido';
      const distritoId = loc.distrito || 0;

      const current = parseInt(r.LecturaActual || '0');
      const previous = parseInt(r.lecturaAnterior || '0');
      const consumo = current - previous;

      // Price logic
      let price = defaultTariffs[sub] || defaultTariffs[`${cat}-${sub}`] || defaultTariffs[cat] || 2.50;
      const amount = consumo * price;

      let parsedFechaPago = null;
      if (r.fecha_pago) {
        const [datePart, timePart] = r.fecha_pago.split(' ');
        const [m, d, y] = datePart.split('/');
        const [h, min] = timePart.split(':');
        const year = parseInt(y) + 2000;
        parsedFechaPago = new Date(Date.UTC(year, parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min)));
      }
      const pagado = !!parsedFechaPago;

      paramsByMedidor.push([r.medidor_iot, r.parsedDate, previous, current, parseInt(r.radiobase), parsedFechaPago, consumo, amount, pagado]);
      paramsByZona.push([zonaName, r.parsedDate, r.medidor_iot, previous, current, consumo, amount, pagado]);
      paramsByDistrito.push([distritoId, r.parsedDate, r.medidor_iot, previous, current, consumo, amount, pagado]);

      if (!pagado) {
        paramsUnpaid.push([numContrato, r.parsedDate, r.medidor_iot, previous, current, consumo, amount]);
        totalUnpaidFinancial += amount;
        uniqueMorososSet.add(numContrato);
      } else {
        totalPaidFinancial += amount;
      }

      // Zone aggregate
      if (!zoneAgg[zonaName]) zoneAgg[zonaName] = { consumo: 0.0, facturacion: 0.0, count: 0 };
      zoneAgg[zonaName].consumo += consumo;
      zoneAgg[zonaName].facturacion += amount;
      zoneAgg[zonaName].count++;

      // Dist aggregate
      if (!distAgg[distritoId]) distAgg[distritoId] = { consumo: 0.0, facturacion: 0.0, count: 0 };
      distAgg[distritoId].consumo += consumo;
      distAgg[distritoId].facturacion += amount;
      distAgg[distritoId].count++;
    }

    console.log("Writing enriched readings to Cassandra...");
    await executeConcurrent("INSERT INTO lecturas_by_medidor (medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, fecha_pago, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", paramsByMedidor, 100);
    await executeConcurrent("INSERT INTO lecturas_by_zona (zona, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", paramsByZona, 100);
    await executeConcurrent("INSERT INTO lecturas_by_distrito (distrito, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", paramsByDistrito, 100);
    
    if (paramsUnpaid.length > 0) {
      await executeConcurrent("INSERT INTO lecturas_unpaid_by_contrato (numero_contrato, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado) VALUES (?, ?, ?, ?, ?, ?, ?)", paramsUnpaid, 100);
    }

    // Save Aggregates
    console.log("Saving pre-aggregated report summaries...");
    const qRepZona = "INSERT INTO reporte_consumo_zona (zona, consumo_total, facturacion_total, lecturas_count) VALUES (?, ?, ?, ?)";
    const repZonaParams = Object.entries(zoneAgg).map(([zName, info]) => [
      zName, info.consumo, info.facturacion, cassandra.types.Long.fromNumber(info.count)
    ]);
    await executeConcurrent(qRepZona, repZonaParams, 50);

    const subAlcaldiasMap = {};
    distParams.forEach(d => {
      subAlcaldiasMap[d[0]] = d[3];
    });

    const qRepDist = "INSERT INTO reporte_consumo_distrito (distrito, sub_alcaldia, consumo_total, facturacion_total, lecturas_count, habitantes, per_capita) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const repDistParams = Object.entries(distAgg).map(([dIdStr, info]) => {
      const dId = parseInt(dIdStr);
      const habs = distHabsMap[dId] || 1000;
      return [
        dId, subAlcaldiasMap[dId] || 'Desconocido', info.consumo, info.facturacion,
        cassandra.types.Long.fromNumber(info.count), habs, parseFloat((info.consumo / habs).toFixed(6))
      ];
    });
    await executeConcurrent(qRepDist, repDistParams, 50);

    await client.execute("INSERT INTO reporte_financiero (key, ingresos_recaudados, deuda_total, total_clientes_morosos) VALUES ('global', ?, ?, ?)", [
      totalPaidFinancial, totalUnpaidFinancial, cassandra.types.Long.fromNumber(uniqueMorososSet.size)
    ], { prepare: true });

    await client.execute("UPDATE reporte_errores SET total_anomalias = ? WHERE key = 'summary'", [
      cassandra.types.Long.fromNumber(anomalies.length)
    ], { prepare: true });

    console.log(`Re-ingestion finished successfully in ${((Date.now() - overallStart) / 1000).toFixed(2)} seconds!`);
    
  } catch (err) {
    console.error("Critical Re-ingestion failed:", err);
  } finally {
    await client.shutdown();
  }
}

run();
