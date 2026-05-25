import express from 'express';
import cors from 'cors';
import multer from 'multer';
import cassandra from 'cassandra-driver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import csv from 'csv-parser';
import http from 'http';
import dns from 'dns';
import PdfService from './PdfService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust UTF-8 decoder helper to clean double-encoded strings
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

const app = express();
app.use(cors());
app.use(express.json());

// Set up file upload destination using Multer
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
const upload = multer({ dest: UPLOAD_DIR });

// Static files routing for generated PDFs
app.use('/static/uploads', express.static(UPLOAD_DIR));

// Environment Variables
const nodeName = process.env.NODE_NAME || 'API_Principal_Nodo1';
const contactPointsStr = process.env.CASSANDRA_CONTACT_POINTS || '127.0.0.1';
const contactPoints = contactPointsStr.split(',').map(ip => ip.trim());
const cassandraPort = parseInt(process.env.CASSANDRA_PORT || '9042');
const username = process.env.CASSANDRA_USER || null;
const password = process.env.CASSANDRA_PASSWORD || null;
const apiPort = parseInt(process.env.API_PORT || '8000');

// Cassandra Driver client setup
const authProvider = username && password 
  ? new cassandra.auth.PlainTextAuthProvider(username, password)
  : null;

let client = null;
let dbConnected = false;

// Initialize Cassandra schema from schema.cql
async function initSchema(session) {
  console.log("Initializing Cassandra schema...");
  const cqlPath = path.join(__dirname, 'schema.cql');
  if (!fs.existsSync(cqlPath)) {
    console.error(`CQL schema file not found at ${cqlPath}`);
    return;
  }

  try {
    const cqlContent = fs.readFileSync(cqlPath, 'utf8');
    const statements = [];
    let currentStatement = [];

    for (const line of cqlContent.split('\n')) {
      const stripped = line.trim();
      if (!stripped || stripped.startsWith('--')) {
        continue;
      }
      currentStatement.push(line);
      if (stripped.endsWith(';')) {
        statements.push(currentStatement.join('\n'));
        currentStatement = [];
      }
    }

    console.log(`Executing ${statements.length} schema statements...`);
    for (const stmt of statements) {
      try {
        await session.execute(stmt);
      } catch (err) {
        if (!err.message.includes('already exists')) {
          console.warn(`Non-critical statement warning: ${err.message}`);
        }
      }
    }
    console.log("Cassandra schema initialized.");
  } catch (err) {
    console.error(`Schema initialization failed: ${err.message}`);
    throw err;
  }
}

// Connect to Cassandra with retry logic
async function connectCassandra() {
  console.log(`Connecting to Cassandra at ${contactPoints.join(', ')}:${cassandraPort}...`);
  const localClient = new cassandra.Client({
    contactPoints: contactPoints,
    localDataCenter: 'datacenter1',
    keyspace: 'semapa',
    authProvider: authProvider,
    protocolOptions: { port: cassandraPort },
    socketOptions: { connectTimeout: 10000 }
  });

  // Temporarily connect without keyspace to bootstrap schema if keyspace semapa doesn't exist
  const bootstrapClient = new cassandra.Client({
    contactPoints: contactPoints,
    localDataCenter: 'datacenter1',
    authProvider: authProvider,
    protocolOptions: { port: cassandraPort },
    socketOptions: { connectTimeout: 10000 }
  });

  try {
    await bootstrapClient.connect();
    console.log("Cassandra bootstrap client connected successfully.");
    await initSchema(bootstrapClient);
    await bootstrapClient.shutdown();

    // Now connect standard client to Semapa
    await localClient.connect();
    client = localClient;
    dbConnected = true;
    console.log("Cassandra client connected to semapa keyspace successfully.");
    
    // Auto-seed/migrate errores_iot if it is empty!
    try {
      await autoSeedErroresIot();
    } catch (e) {
      console.warn(`Failed to auto-seed errores_iot: ${e.message}`);
    }
  } catch (err) {
    console.error(`Cassandra connection failed: ${err.message}. Retrying in 5 seconds...`);
    dbConnected = false;
    setTimeout(connectCassandra, 5000);
  }
}

connectCassandra();

// Helper to execute concurrent inserts to Cassandra to prevent client buffer overflow
async function executeConcurrent(query, paramsArray, concurrency = 100) {
  if (!client) throw new Error("Database not connected");
  
  // Prepare query first
  const queryOptions = { prepare: true };
  let index = 0;
  const promises = [];
  
  async function worker() {
    while (index < paramsArray.length) {
      const params = paramsArray[index++];
      try {
        await client.execute(query, params, queryOptions);
      } catch (err) {
        console.error(`Insert failed at item ${index}: ${err.message}`);
      }
    }
  }
  
  for (let i = 0; i < Math.min(concurrency, paramsArray.length); i++) {
    promises.push(worker());
  }
  
  await Promise.all(promises);
}

// Safe execution helper
async function safeQuery(query, params = [], defaultValue = []) {
  if (!client || !dbConnected) return defaultValue;
  try {
    const res = await client.execute(query, params, { prepare: true });
    return res.rows;
  } catch (err) {
    console.warn(`Query failed: ${query} - Error: ${err.message}`);
    return defaultValue;
  }
}

// Parse CSV utility helper
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

// Seed default tariffs if empty
async function seedTarifasDefault() {
  if (!client) return;
  const rows = await safeQuery("SELECT COUNT(*) FROM tarifas");
  const count = rows.length > 0 ? (rows[0].count ? parseInt(rows[0].count.toString()) : 0) : 0;
  if (count > 0) {
    console.log("Tarifas already seeded.");
    return;
  }

  const defaultTariffs = {
    "Residencial-R1": 2.00,
    "Residencial-R2": 2.50,
    "Residencial-R3": 3.50,
    "Residencial-R4": 5.00,
    "Comercial-C": 8.00,
    "Comercial-CE": 9.50,
    "Industrial-I": 12.00,
    "Preferencial-P": 3.00,
    "Social-S": 1.50,
    "R1": 2.00, "R2": 2.50, "R3": 3.50, "R4": 5.00,
    "C": 8.00, "CE": 9.50, "I": 12.00, "P": 3.00, "S": 1.50,
    "Residencial": 2.50, "Comercial": 8.00, "Industrial": 12.00,
    "Preferencial": 3.00, "Social": 1.50
  };

  console.log("Seeding default tariffs...");
  const query = "INSERT INTO tarifas (categoria, precio_m3) VALUES (?, ?)";
  const params = Object.entries(defaultTariffs).map(([k, v]) => [k, parseFloat(v)]);
  await executeConcurrent(query, params, 10);
}

async function autoSeedErroresIot() {
  if (!client || !dbConnected) return;
  try {
    const countRows = await safeQuery("SELECT COUNT(*) FROM errores_iot");
    const count = countRows.length > 0 ? (countRows[0].count ? parseInt(countRows[0].count.toString()) : 0) : 0;
    if (count > 0) {
      console.log(`errores_iot already has ${count} records. No seeding needed.`);
      return;
    }
    
    console.log("errores_iot table is empty. Generating logs from Dañado/Mantenimiento meters in Cassandra...");
    const medRows = await safeQuery("SELECT distrito, medidor_iot, zona, estado, tipo_medidor_id FROM medidores_by_distrito");
    
    const paramsErr = [];
    const now = new Date();
    
    medRows.forEach(r => {
      if (r.estado === 'Dañado' || r.estado === 'Mantenimiento') {
        const code = r.estado === 'Dañado' ? 'FALLA_HARDWARE' : 'MANTENIMIENTO';
        const desc = r.estado === 'Dañado'
          ? 'Falla crítica de comunicación de hardware con radiobase principal'
          : 'Revisión técnica programada por inconsistencia de lecturas';
        
        // Spread dates over the last 15 days
        const randomDaysAgo = Math.floor(Math.random() * 15);
        const date = new Date(now.getTime() - randomDaysAgo * 24 * 60 * 60 * 1000);
        
        paramsErr.push([
          r.medidor_iot,
          date,
          r.tipo_medidor_id || 1,
          code,
          desc,
          Math.floor(Math.random() * 5) + 1, // radiobase
          r.distrito,
          r.zona || 'Desconocido'
        ]);
      }
    });
    
    if (paramsErr.length > 0) {
      console.log(`Inserting ${paramsErr.length} generated errors into errores_iot...`);
      const query = `
        INSERT INTO errores_iot (
          medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase, distrito, zona
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await executeConcurrent(query, paramsErr, 100);
      
      const totalDanados = paramsErr.filter(p => p[3] === 'FALLA_HARDWARE').length;
      const totalMantenimiento = paramsErr.filter(p => p[3] === 'MANTENIMIENTO').length;
      
      await safeQuery(`
        INSERT INTO reporte_errores (key, total_danados, total_mantenimiento)
        VALUES ('summary', ?, ?)
      `, [
        cassandra.types.Long.fromNumber(totalDanados),
        cassandra.types.Long.fromNumber(totalMantenimiento)
      ]);
      
      console.log("errores_iot auto-seeding completed.");
    }
  } catch (err) {
    console.error(`Auto-seed of errores_iot failed: ${err.message}`);
  }
}

/* ==========================================
   ETL INGESTION ENDPOINTS
   ========================================== */

app.post('/upload/distritos', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", detail: "No file uploaded" });
  const start = Date.now();
  try {
    const headers = [
      'sub_alcaldia', 'distrito', 'sub_distrito', 'zona', 'gateway', 
      'altitude', 'codigo', 'habitantes', 'r1', 'r2', 'r3', 'r4', 
      'c', 'ce', 'i', 'p', 's', 'total'
    ];
    // Skip 2 lines: line 1 (metadata percentages) and line 2 (original CSV header)
    const distritosData = await parseCsv(req.file.path, 2, headers);
    
    let lastSubAlcaldia = '';
    let lastDistrito = 0;
    let lastHabitantes = 0;
    
    const params = [];
    for (const row of distritosData) {
      if (!row.sub_distrito || !row.zona) continue; // skip total/summary rows
      
      const sub_alcaldia = decodeUtf8((row.sub_alcaldia || lastSubAlcaldia).trim());
      const distrito = parseInt(row.distrito || lastDistrito);
      const habitantes = parseInt(row.habitantes || lastHabitantes);
      
      lastSubAlcaldia = sub_alcaldia;
      lastDistrito = distrito;
      lastHabitantes = habitantes;
      
      params.push([
        distrito,
        parseInt(row.sub_distrito || '0'),
        decodeUtf8(row.zona.trim()),
        sub_alcaldia,
        decodeUtf8((row.gateway || 'Desconocido').trim()),
        parseFloat(row.altitude || '0.0'),
        parseInt(row.codigo || '0'),
        habitantes,
        parseInt(row.r1 || '0'),
        parseInt(row.r2 || '0'),
        parseInt(row.r3 || '0'),
        parseInt(row.r4 || '0'),
        parseInt(row.c || '0'),
        parseInt(row.ce || '0'),
        parseInt(row.i || '0'),
        parseInt(row.p || '0'),
        parseInt(row.s || '0'),
        parseInt(row.total || '0')
      ]);
    }

    const query = `
      INSERT INTO distritos (
        distrito, sub_distrito, zona, sub_alcaldia, gateway, altitude, codigo, habitantes,
        r1, r2, r3, r4, c, ce, i, p, s, total
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await executeConcurrent(query, params, 50);
    fs.unlinkSync(req.file.path);
    
    res.json({
      status: "success",
      message: `Successfully imported ${params.length} district records.`,
      records_inserted: params.length,
      elapsed_seconds: parseFloat(((Date.now() - start) / 1000).toFixed(2))
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: "error", detail: `Import failed: ${err.message}` });
  }
});

app.post('/upload/contratos', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", detail: "No file uploaded" });
  const start = Date.now();
  try {
    const rawContratos = await parseCsv(req.file.path, 0);
    
    const paramsContratos = [];
    const paramsByCi = [];
    
    for (const row of rawContratos) {
      const numContrato = (row.numero_contrato || '').trim();
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

      if (!numContrato) continue;

      paramsContratos.push([numContrato, numCatastro, titular, ci, cat, sub, medId, fecha, estado, diam, tipo]);
      paramsByCi.push([ci, numContrato, numCatastro, titular, cat, sub, medId, fecha, estado, diam, tipo]);
    }

    const queryContratos = `
      INSERT INTO contratos (
        numero_contrato, numero_catastro, titular_contrato, ci_titular, categoria,
        subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const queryByCi = `
      INSERT INTO contratos_by_ci (
        ci_titular, numero_contrato, numero_catastro, titular_contrato, categoria,
        subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await executeConcurrent(queryContratos, paramsContratos, 100);
    await executeConcurrent(queryByCi, paramsByCi, 100);
    
    fs.unlinkSync(req.file.path);
    res.json({
      status: "success",
      message: `Successfully imported ${paramsContratos.length} contracts.`,
      records_inserted: paramsContratos.length,
      elapsed_seconds: parseFloat(((Date.now() - start) / 1000).toFixed(2))
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: "error", detail: `Import failed: ${err.message}` });
  }
});

app.post('/upload/infraestructura', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", detail: "No file uploaded" });
  const start = Date.now();
  try {
    const rawInfra = await parseCsv(req.file.path, 0);
    
    const params = [];
    for (const row of rawInfra) {
      const catastro = (row.numero_catastro || '').trim();
      if (!catastro) continue;

      params.push([
        catastro,
        decodeUtf8((row.propietario || '').trim()),
        (row.ci || '').trim(),
        decodeUtf8((row.direccion || '').trim()),
        decodeUtf8((row.zona || '').trim()),
        parseInt(row.distrito || '0'),
        parseInt(row.manzano || '0'),
        parseInt(row.lote || '0'),
        parseInt(row.superficie_terreno || '0'),
        parseInt(row.area_construida || '0'),
        decodeUtf8((row.uso_suelo || '').trim()),
        (row.matricula_ddrr || '').trim(),
        parseInt(row.valor_catastral || '0'),
        parseFloat(row.impuesto_anual || '0.0'),
        parseFloat(row.latitud || '0.0'),
        parseFloat(row.longitud || '0.0')
      ]);
    }

    const query = `
      INSERT INTO infraestructuras (
        numero_catastro, propietario, ci, direccion, zona, distrito, manzano, lote,
        superficie_terreno, area_construida, uso_suelo, matricula_ddrr, valor_catastral,
        impuesto_anual, latitud, longitud
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await executeConcurrent(query, params, 100);
    fs.unlinkSync(req.file.path);
    
    res.json({
      status: "success",
      message: `Successfully imported ${params.length} infrastructure sites.`,
      records_inserted: params.length,
      elapsed_seconds: parseFloat(((Date.now() - start) / 1000).toFixed(2))
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: "error", detail: `Import failed: ${err.message}` });
  }
});

app.post('/upload/medidores', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", detail: "No file uploaded" });
  const start = Date.now();
  try {
    const rawMedidores = await parseCsv(req.file.path, 0);
    
    const paramsMed = [];
    let totalDanados = 0;
    let totalMantenimiento = 0;

    for (const row of rawMedidores) {
      const medId = (row.medidor_iot || '').trim();
      if (!medId) continue;
      
      const estado = decodeUtf8((row.estado || '').trim());
      if (estado === 'Dañado') totalDanados++;
      if (estado === 'Mantenimiento') totalMantenimiento++;

      paramsMed.push([
        medId,
        (row.fecha_instalacion || '').trim(),
        row.fecha_desinstalacion ? row.fecha_desinstalacion.trim() : null,
        estado,
        parseInt(row.tipo_medidor_id || '0')
      ]);
    }

    const queryMed = `
      INSERT INTO medidores (
        medidor_iot, fecha_instalacion, fecha_desinstalacion, estado, tipo_medidor_id
      ) VALUES (?, ?, ?, ?, ?)
    `;
    await executeConcurrent(queryMed, paramsMed, 100);

    // Build medidores_by_distrito by fetching contracts and infrastructure from Cassandra
    console.log("Loading contracts and infrastructure mappings to build medidores_by_distrito...");
    const contracts = await safeQuery("SELECT medidor_iot, numero_contrato, numero_catastro FROM contratos");
    const infras = await safeQuery("SELECT numero_catastro, zona, distrito, latitud, longitud FROM infraestructuras");
    
    if (contracts.length > 0 && infras.length > 0) {
      const contractsMap = {};
      contracts.forEach(c => {
        contractsMap[c.medidor_iot] = { numero_contrato: c.numero_contrato, numero_catastro: c.numero_catastro };
      });

      const infraMap = {};
      infras.forEach(i => {
        infraMap[i.numero_catastro] = { zona: i.zona, distrito: i.distrito, latitud: i.latitud, longitud: i.longitud };
      });

      const paramsDist = [];
      const paramsErr = [];
      const now = new Date();

      for (const row of paramsMed) {
        const medId = row[0];
        const estado = row[3];
        const tipoId = row[4];
        
        const mapped = contractsMap[medId];
        if (mapped) {
          const loc = infraMap[mapped.numero_catastro];
          if (loc) {
            paramsDist.push([
              loc.distrito,
              medId,
              loc.zona,
              mapped.numero_contrato,
              mapped.numero_catastro,
              loc.latitud,
              loc.longitud,
              estado,
              tipoId
            ]);

            if (estado === 'Dañado' || estado === 'Mantenimiento') {
              const code = estado === 'Dañado' ? 'FALLA_HARDWARE' : 'MANTENIMIENTO';
              const desc = estado === 'Dañado'
                ? 'Falla crítica de comunicación de hardware con radiobase principal'
                : 'Revisión técnica programada por inconsistencia de lecturas';
              paramsErr.push([
                medId,
                now,
                tipoId,
                code,
                desc,
                1,
                loc.distrito,
                loc.zona
              ]);
            }
          }
        }
      }

      if (paramsDist.length > 0) {
        const queryDist = `
          INSERT INTO medidores_by_distrito (
            distrito, medidor_iot, zona, numero_contrato, numero_catastro,
            latitud, longitud, estado, tipo_medidor_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await executeConcurrent(queryDist, paramsDist, 100);
        console.log(`Generated ${paramsDist.length} medidores_by_distrito entries.`);
      }

      if (paramsErr.length > 0) {
        const queryErr = `
          INSERT INTO errores_iot (
            medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase, distrito, zona
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await executeConcurrent(queryErr, paramsErr, 100);
        console.log(`Generated ${paramsErr.length} errors in errores_iot.`);
      }
    }

    // Write to reports error summary table
    await safeQuery(`
      INSERT INTO reporte_errores (key, total_danados, total_mantenimiento)
      VALUES ('summary', ?, ?)
    `, [cassandra.types.Long.fromNumber(totalDanados), cassandra.types.Long.fromNumber(totalMantenimiento)]);

    fs.unlinkSync(req.file.path);
    res.json({
      status: "success",
      message: `Successfully imported ${paramsMed.length} water meters.`,
      records_inserted: paramsMed.length,
      elapsed_seconds: parseFloat(((Date.now() - start) / 1000).toFixed(2))
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: "error", detail: `Import failed: ${err.message}` });
  }
});

app.post('/upload/lecturas', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ status: "error", detail: "No file uploaded" });
  const start = Date.now();
  try {
    await seedTarifasDefault();
    
    const rawLecturas = await parseCsv(req.file.path, 0);
    
    // Step 1: Parse and sort chronologically
    console.log("Parsing dates and sorting chronologically for deduplication...");
    for (const r of rawLecturas) {
      if (!r.fechaHoraLectura) continue;
      // Date format standard MM/DD/YY HH:MM
      const [datePart, timePart] = r.fechaHoraLectura.split(' ');
      const [m, d, y] = datePart.split('/');
      const [h, min] = timePart.split(':');
      const year = parseInt(y) + 2000;
      r.parsedDate = new Date(Date.UTC(year, parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min)));
      r.dateOnlyStr = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    // Filter valid objects
    const cleanRaw = rawLecturas.filter(r => r.parsedDate && !isNaN(r.parsedDate.getTime()));
    cleanRaw.sort((a, b) => a.parsedDate - b.parsedDate);

    // Step 2: Deduplication by day per meter
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

    console.log(`Deduplication finished. Valid: ${validReadings.length}, Duplicates: ${duplicateReadings.length}`);

    // Log duplicates to Cassandra
    if (duplicateReadings.length > 0) {
      const queryDup = `
        INSERT INTO lecturas_duplicadas_log (
          medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo
        ) VALUES (?, ?, ?, ?, ?, 'Duplicado - Múltiples señales en el mismo día')
      `;
      const paramsDups = duplicateReadings.map(r => [
        r.medidor_iot, r.parsedDate, parseInt(r.lecturaAnterior), parseInt(r.LecturaActual), parseInt(r.radiobase)
      ]);
      await executeConcurrent(queryDup, paramsDups, 100);
    }

    // Step 3: Load Cassandra lookup tables for data denormalization and error resolution
    console.log("Loading Cassandra lookup tables for data denormalization...");
    const contractsList = await safeQuery("SELECT medidor_iot, numero_contrato, categoria, subcategoria, titular_contrato, numero_catastro FROM contratos");
    const infraList = await safeQuery("SELECT numero_catastro, zona, distrito FROM infraestructuras");
    const distList = await safeQuery("SELECT distrito, habitantes FROM distritos");
    const tarifas = await safeQuery("SELECT categoria, precio_m3 FROM tarifas");

    const contractsMap = {};
    contractsList.forEach(c => {
      contractsMap[c.medidor_iot] = c;
    });

    const infraMap = {};
    infraList.forEach(i => {
      infraMap[i.numero_catastro] = { zona: i.zona, distrito: i.distrito };
    });

    const distInhabitantsMap = {};
    distList.forEach(d => {
      distInhabitantsMap[d.distrito] = d.habitantes || 1000;
    });

    const tarifasMap = {};
    tarifas.forEach(t => {
      tarifasMap[t.categoria] = t.precio_m3;
    });

    // Step 4: Differentiate negative anomalies
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

    console.log(`Anomalies filtered. Clean: ${cleanReadings.length}, Negative anomalies: ${anomalies.length}`);

    // Log negative anomalies to errores_iot (including district and zone!)
    if (anomalies.length > 0) {
      const queryErr = `
        INSERT INTO errores_iot (
          medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase, distrito, zona
        ) VALUES (?, ?, 1, 'LECTURA_NEGATIVA', ?, ?, ?, ?)
      `;
      const paramsErr = anomalies.map(r => {
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
      await executeConcurrent(queryErr, paramsErr, 100);
    }

    // Seed variables for aggregates
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
      const titular = c.titular_contrato || 'Cliente';
      
      const loc = infraMap[c.numero_catastro] || {};
      const zona = loc.zona || 'Desconocido';
      const distrito = loc.distrito || 0;

      const current = parseInt(r.LecturaActual || '0');
      const previous = parseInt(r.lecturaAnterior || '0');
      const consumo = current - previous;

      // Price mapping
      let price = tarifasMap[sub];
      if (price === undefined) price = tarifasMap[`${cat}-${sub}`];
      if (price === undefined) price = tarifasMap[cat];
      if (price === undefined) price = 2.50; // fallback

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
      paramsByZona.push([zona, r.parsedDate, r.medidor_iot, previous, current, consumo, amount, pagado]);
      paramsByDistrito.push([distrito, r.parsedDate, r.medidor_iot, previous, current, consumo, amount, pagado]);

      if (!pagado) {
        paramsUnpaid.push([numContrato, r.parsedDate, r.medidor_iot, previous, current, consumo, amount]);
        totalUnpaidFinancial += amount;
        uniqueMorososSet.add(numContrato);
      } else {
        totalPaidFinancial += amount;
      }

      // Add to zone aggregates
      if (!zoneAgg[zona]) zoneAgg[zona] = { consumo: 0.0, facturacion: 0.0, count: 0 };
      zoneAgg[zona].consumo += consumo;
      zoneAgg[zona].facturacion += amount;
      zoneAgg[zona].count++;

      // Add to district aggregates
      if (!distAgg[distrito]) distAgg[distrito] = { consumo: 0.0, facturacion: 0.0, count: 0 };
      distAgg[distrito].consumo += consumo;
      distAgg[distrito].facturacion += amount;
      distAgg[distrito].count++;
    }

    console.log("Writing enriched readings to Cassandra denormalized tables...");
    await executeConcurrent("INSERT INTO lecturas_by_medidor (medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, fecha_pago, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", paramsByMedidor, 100);
    await executeConcurrent("INSERT INTO lecturas_by_zona (zona, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", paramsByZona, 100);
    await executeConcurrent("INSERT INTO lecturas_by_distrito (distrito, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", paramsByDistrito, 100);
    
    if (paramsUnpaid.length > 0) {
      await executeConcurrent("INSERT INTO lecturas_unpaid_by_contrato (numero_contrato, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado) VALUES (?, ?, ?, ?, ?, ?, ?)", paramsUnpaid, 100);
    }

    // Step 5: Save reporting aggregates
    console.log("Saving pre-aggregated report summaries...");
    // Zone Aggregates
    const queryRepZona = "INSERT INTO reporte_consumo_zona (zona, consumo_total, facturacion_total, lecturas_count) VALUES (?, ?, ?, ?)";
    const paramsRepZona = Object.entries(zoneAgg).map(([zName, info]) => [
      zName, info.consumo, info.facturacion, cassandra.types.Long.fromNumber(info.count)
    ]);
    await executeConcurrent(queryRepZona, paramsRepZona, 50);

    // District Aggregates
    // Fetch district names
    const districtsMeta = await safeQuery("SELECT distrito, sub_alcaldia FROM distritos");
    const subAlcaldiasMap = {};
    districtsMeta.forEach(d => {
      subAlcaldiasMap[d.distrito] = d.sub_alcaldia;
    });

    const queryRepDist = "INSERT INTO reporte_consumo_distrito (distrito, sub_alcaldia, consumo_total, facturacion_total, lecturas_count, habitantes, per_capita) VALUES (?, ?, ?, ?, ?, ?, ?)";
    const paramsRepDist = Object.entries(distAgg).map(([dIdStr, info]) => {
      const dId = parseInt(dIdStr);
      const habs = distInhabitantsMap[dId] || 1000;
      return [
        dId,
        subAlcaldiasMap[dId] || 'Desconocido',
        info.consumo,
        info.facturacion,
        cassandra.types.Long.fromNumber(info.count),
        habs,
        parseFloat((info.consumo / habs).toFixed(6))
      ];
    });
    await executeConcurrent(queryRepDist, paramsRepDist, 50);

    // Financial Global Summary
    await safeQuery("INSERT INTO reporte_financiero (key, ingresos_recaudados, deuda_total, total_clientes_morosos) VALUES ('global', ?, ?, ?)", [
      totalPaidFinancial, totalUnpaidFinancial, cassandra.types.Long.fromNumber(uniqueMorososSet.size)
    ]);

    // Error anomalies count update
    await safeQuery("UPDATE reporte_errores SET total_anomalias = ? WHERE key = 'summary'", [cassandra.types.Long.fromNumber(anomalies.length)]);

    fs.unlinkSync(req.file.path);
    res.json({
      status: "success",
      message: `Successfully imported and deduplicated ${cleanReadings.length} readings.`,
      records_inserted: cleanReadings.length,
      elapsed_seconds: parseFloat(((Date.now() - start) / 1000).toFixed(2))
    });
  } catch (err) {
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ status: "error", detail: `Import failed: ${err.message}` });
  }
});

app.post('/upload/tarifas', async (req, res) => {
  try {
    await seedTarifasDefault();
    res.json({ status: "success", message: "Tariffs loaded/seeded successfully." });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

/* ==========================================
   DASHBOARD STATS ENDPOINTS
   ========================================== */

app.get('/dashboard/presidente', async (req, res) => {
  try {
    const finRows = await safeQuery("SELECT ingresos_recaudados, deuda_total, total_clientes_morosos FROM reporte_financiero WHERE key = 'global'");
    const totalRecaudado = finRows.length > 0 ? finRows[0].ingresos_recaudados : 0.0;
    const totalDeuda = finRows.length > 0 ? finRows[0].deuda_total : 0.0;
    const morososCount = finRows.length > 0 ? (finRows[0].total_clientes_morosos ? parseInt(finRows[0].total_clientes_morosos.toString()) : 0) : 0;
    
    const zonaRows = await safeQuery("SELECT zona, consumo_total, facturacion_total, lecturas_count FROM reporte_consumo_zona");
    const totalConsumo = zonaRows.reduce((sum, z) => sum + z.consumo_total, 0);
    const totalFacturacion = zonaRows.reduce((sum, z) => sum + z.facturacion_total, 0);
    const totalLecturas = zonaRows.reduce((sum, z) => sum + (z.lecturas_count ? parseInt(z.lecturas_count.toString()) : 0), 0);

    const topZonas = zonaRows
      .filter(z => z.zona !== 'Desconocido' && z.zona !== 'desconocido')
      .map(z => ({
        zona: z.zona,
        consumo: parseFloat(z.consumo_total.toFixed(2)),
        facturacion: parseFloat(z.facturacion_total.toFixed(2))
      })).sort((a, b) => b.consumo - a.consumo).slice(0, 10);

    const distRows = await safeQuery("SELECT distrito, sub_alcaldia, consumo_total, habitantes, per_capita FROM reporte_consumo_distrito");
    
    const districtCoords = {
      1: [-17.355, -66.155], 2: [-17.360, -66.160], 3: [-17.375, -66.145], 
      4: [-17.380, -66.150], 5: [-17.390, -66.165], 6: [-17.400, -66.170],
      7: [-17.410, -66.160], 8: [-17.420, -66.150], 9: [-17.430, -66.140],
      10: [-17.370, -66.180], 11: [-17.385, -66.175], 12: [-17.395, -66.185],
      13: [-17.440, -66.155], 14: [-17.450, -66.165], 15: [-17.460, -66.175]
    };

    const consumoDistrito = [];
    const mapaCalor = [];
    const estresHidrico = [];

    distRows.forEach(d => {
      const distId = d.distrito;
      const coords = districtCoords[distId] || [-17.38, -66.16];
      
      consumoDistrito.push({
        distrito: distId,
        sub_alcaldia: d.sub_alcaldia,
        consumo: parseFloat(d.consumo_total.toFixed(2)),
        habitantes: d.habitantes
      });

      mapaCalor.push({
        distrito: distId,
        latitud: coords[0],
        longitud: coords[1],
        intensidad_consumo: parseFloat(d.consumo_total.toFixed(2))
      });

      let stressLevel = "Bajo";
      if (d.per_capita > 0.15) stressLevel = "Crítico";
      else if (d.per_capita > 0.08) stressLevel = "Moderado";

      estresHidrico.push({
        distrito: distId,
        sub_alcaldia: d.sub_alcaldia,
        consumo_per_capita_m3: parseFloat(d.per_capita.toFixed(4)),
        stress_level: stressLevel
      });
    });

    res.json({
      statistics: {
        total_consumo_m3: parseFloat(totalConsumo.toFixed(2)),
        total_facturacion_bs: parseFloat(totalFacturacion.toFixed(2)),
        total_recaudado_bs: parseFloat(totalRecaudado.toFixed(2)),
        total_deuda_bs: parseFloat(totalDeuda.toFixed(2)),
        clientes_morosos_count: morososCount,
        total_lecturas_procesadas: totalLecturas
      },
      top_zonas_consumo: topZonas,
      consumo_por_distrito: consumoDistrito.sort((a, b) => b.consumo - a.consumo),
      mapa_calor: mapaCalor,
      estres_hidrico: estresHidrico.sort((a, b) => b.consumo_per_capita_m3 - a.consumo_per_capita_m3)
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/dashboard/administrador', async (req, res) => {
  try {
    const medRows = await safeQuery("SELECT total_danados, total_mantenimiento, total_anomalias FROM reporte_errores WHERE key = 'summary'");
    const totalDanados = medRows.length > 0 ? (medRows[0].total_danados ? parseInt(medRows[0].total_danados.toString()) : 0) : 0;
    const totalMantenimiento = medRows.length > 0 ? (medRows[0].total_mantenimiento ? parseInt(medRows[0].total_mantenimiento.toString()) : 0) : 0;
    const totalAnomalias = medRows.length > 0 ? (medRows[0].total_anomalias ? parseInt(medRows[0].total_anomalias.toString()) : 0) : 0;

    const activeMeters = 66460 + 4864 + 15959;
    const inactiveMeters = totalDanados + totalMantenimiento;

    const errorRows = await safeQuery("SELECT medidor_iot, fecha_hora_error, codigo_error, descripcion, radiobase, distrito, zona FROM errores_iot LIMIT 20");
    const erroresIot = [];
    const zonasConFallas = {};

    errorRows.forEach(err => {
      erroresIot.push({
        medidor_iot: err.medidor_iot,
        fecha_hora_error: err.fecha_hora_error ? err.fecha_hora_error.toISOString() : null,
        codigo_error: err.codigo_error,
        descripcion: err.descripcion,
        radiobase: err.radiobase,
        distrito: err.distrito,
        zona: err.zona
      });
      if (err.zona) {
        zonasConFallas[err.zona] = (zonasConFallas[err.zona] || 0) + 1;
      }
    });

    const zonasConFallasList = Object.entries(zonasConFallas).map(([k, v]) => ({
      zona: k,
      cantidad_errores: v
    })).sort((a, b) => b.cantidad_errores - a.cantidad_errores);

    const recentReadingsRows = await safeQuery("SELECT medidor_iot, fecha_hora_lectura, lectura_actual, consumo, pagado FROM lecturas_by_zona WHERE zona = 'ALALAY NORTE' LIMIT 30");
    const recentReadings = recentReadingsRows.map(r => ({
      medidor_iot: r.medidor_iot,
      fecha_hora_lectura: r.fecha_hora_lectura ? r.fecha_hora_lectura.toISOString() : null,
      lectura_actual: r.lectura_actual,
      consumo: r.consumo,
      pagado: r.pagado
    }));

    const zonaRows = await safeQuery("SELECT zona, consumo_total FROM reporte_consumo_zona");
    const totalConsumo = zonaRows.reduce((sum, z) => sum + z.consumo_total, 0) || 1.0;
    const distribucionAgua = zonaRows
      .filter(z => z.zona !== 'Desconocido' && z.zona !== 'desconocido')
      .map(z => ({
        zona: z.zona,
        consumo_m3: parseFloat(z.consumo_total.toFixed(2)),
        porcentaje: parseFloat(((z.consumo_total / totalConsumo) * 100).toFixed(2))
      })).sort((a, b) => b.consumo_m3 - a.consumo_m3).slice(0, 10);

    res.json({
      meters_status: {
        activos: activeMeters,
        inactivos: inactiveMeters,
        danados: totalDanados,
        mantenimiento: totalMantenimiento,
        total_anomalias_lectura: totalAnomalias
      },
      zonas_con_fallas: zonasConFallasList,
      errores_iot_recientes: erroresIot,
      lecturas_recientes_alalay_norte: recentReadings,
      distribucion_agua_zonas_top: distribucionAgua
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/dashboard/finanzas', async (req, res) => {
  try {
    const finRows = await safeQuery("SELECT ingresos_recaudados, deuda_total, total_clientes_morosos FROM reporte_financiero WHERE key = 'global'");
    const totalRecaudado = finRows.length > 0 ? finRows[0].ingresos_recaudados : 0.0;
    const totalDeuda = finRows.length > 0 ? finRows[0].deuda_total : 0.0;
    const morososCount = finRows.length > 0 ? (finRows[0].total_clientes_morosos ? parseInt(finRows[0].total_clientes_morosos.toString()) : 0) : 0;

    const totalFacturado = totalRecaudado + totalDeuda;
    const cobranzaRatio = totalFacturado > 0 ? parseFloat(((totalRecaudado / totalFacturado) * 100).toFixed(2)) : 0.0;

    const contratosCount = await safeQuery("SELECT COUNT(*) FROM contratos");
    const numContratos = contratosCount.length > 0 ? (contratosCount[0].count ? parseInt(contratosCount[0].count.toString()) : 0) : 0;
    const proyeccionIngresos = numContratos * 15 * 3.50;

    const excesivoReadings = [];
    const sampleRows = await safeQuery("SELECT medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado FROM lecturas_by_zona WHERE zona = 'ALALAY NORTE' LIMIT 200");
    
    for (const r of sampleRows) {
      if (r.consumo > 40) {
        const contratoInfo = await safeQuery(`SELECT numero_contrato, titular_contrato FROM contratos WHERE medidor_iot = '${r.medidor_iot}' ALLOW FILTERING`);
        const contratoNum = contratoInfo.length > 0 ? contratoInfo[0].numero_contrato : "CT-Desconocido";
        const titular = contratoInfo.length > 0 ? contratoInfo[0].titular_contrato : "Desconocido";

        excesivoReadings.push({
          numero_contrato: contratoNum,
          titular: titular,
          medidor_iot: r.medidor_iot,
          fecha: r.fecha_hora_lectura ? r.fecha_hora_lectura.toISOString() : null,
          consumo_m3: r.consumo,
          monto_facturado_bs: parseFloat(r.monto_facturado.toFixed(2))
        });
      }
    }

    const unpaidSample = await safeQuery("SELECT numero_contrato, fecha_hora_lectura, medidor_iot, consumo, monto_facturado FROM lecturas_unpaid_by_contrato LIMIT 30");
    const contratosConDeuda = [];

    for (const u of unpaidSample) {
      const contratoDetails = await safeQuery(`SELECT titular_contrato, ci_titular, categoria FROM contratos WHERE numero_contrato = '${u.numero_contrato}'`);
      const titular = contratoDetails.length > 0 ? contratoDetails[0].titular_contrato : "Cliente SEMAPA";
      const ci = contratoDetails.length > 0 ? contratoDetails[0].ci_titular : "N/A";
      const categoria = contratoDetails.length > 0 ? contratoDetails[0].categoria : "Residencial";

      contratosConDeuda.push({
        numero_contrato: u.numero_contrato,
        titular: titular,
        ci_titular: ci,
        categoria: categoria,
        ultimo_periodo_deuda: u.fecha_hora_lectura ? u.fecha_hora_lectura.toISOString() : null,
        monto_deuda_bs: parseFloat(u.monto_facturado.toFixed(2))
      });
    }

    res.json({
      financial_summary: {
        total_facturado_bs: parseFloat(totalFacturado.toFixed(2)),
        ingresos_recaudados_bs: parseFloat(totalRecaudado.toFixed(2)),
        deuda_pendiente_bs: parseFloat(totalDeuda.toFixed(2)),
        efectividad_cobro_porcentaje: cobranzaRatio,
        clientes_morosos_total: morososCount,
        ingresos_proyectados_proximo_mes_bs: parseFloat(proyeccionIngresos.toFixed(2))
      },
      consumo_excesivo: excesivoReadings.slice(0, 20),
      contratos_con_deuda_recientes: contratosConDeuda
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/dashboard/cluster-status', async (req, res) => {
  try {
    if (!client || !dbConnected) {
      throw new Error("Cassandra disconnected");
    }
    const hostsInfo = [];
    const allHosts = client.getState().getConnectedHosts();
    
    allHosts.forEach(host => {
      hostsInfo.append({
        address: host.address,
        is_up: host.isUp(),
        datacenter: host.datacenter,
        rack: host.rack
      });
    });

    const lines = [
      "Status=Up/Down",
      "|/ State=Normal/Leaving/Joining/Moving",
      "--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack"
    ];

    allHosts.forEach(host => {
      const status = host.isUp() ? "U" : "D";
      const state = "N";
      const address = host.address.padEnd(14);
      const load = "350.00 KiB".padEnd(10);
      const tokens = "16".padEnd(7);
      const owns = "50.0%".padEnd(17);
      const hostId = (host.hostId ? host.hostId.toString() : 'unknown-uuid-0000-0000').padEnd(36);
      const rack = (host.rack || 'rack1');
      lines.push(`${status}${state}  ${address}  ${load} ${tokens} ${owns} ${hostId}  ${rack}`);
    });

    res.json({
      database_connected: true,
      hosts: hostsInfo,
      nodetool_status: lines.join('\n')
    });
  } catch (err) {
    // Default fallback simulated data matching the PCs when database is disconnected/offline
    res.json({
      database_connected: false,
      hosts: [
        { address: "100.114.64.8", is_up: false, datacenter: "dc1", rack: "rack1" },
        { address: "100.71.121.5", is_up: false, datacenter: "dc1", rack: "rack1" }
      ],
      nodetool_status: `Status=Up/Down\n|/ State=Normal/Leaving/Joining/Moving\n--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack\nDN  100.114.64.8  354.21 KiB 16      50.0%             8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1\nDN  100.71.121.5  324.95 KiB 16      50.0%             fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1\n\nCassandra desconectado: ${err.message}`
    });
  }
});

/* ==========================================
   TOTEM ENDPOINTS
   ========================================== */

app.get('/totem/deuda/:ci', async (req, res) => {
  try {
    const ci = req.params.ci;
    const contractsRows = await safeQuery(`SELECT numero_contrato, titular_contrato, medidor_iot, categoria, subcategoria FROM contratos_by_ci WHERE ci_titular = '${ci}'`);
    if (contractsRows.length === 0) {
      return res.json({
        ci_titular: ci,
        has_debt: false,
        total_debt_bs: 0.0,
        contracts: []
      });
    }

    const contractsList = [];
    let grandTotalDebt = 0.0;
    const titularName = contractsRows[0].titular_contrato;

    for (const c of contractsRows) {
      const cNum = c.numero_contrato;
      const unpaidBills = await safeQuery(`SELECT monto_facturado, fecha_hora_lectura FROM lecturas_unpaid_by_contrato WHERE numero_contrato = '${cNum}'`);
      const cDebt = unpaidBills.reduce((sum, b) => sum + b.monto_facturado, 0.0);
      grandTotalDebt += cDebt;

      contractsList.push({
        numero_contrato: cNum,
        medidor_iot: c.medidor_iot,
        categoria: c.categoria,
        subcategoria: c.subcategoria,
        deuda_contrato_bs: parseFloat(cDebt.toFixed(2)),
        meses_impagos: unpaidBills.length
      });
    }

    res.json({
      ci_titular: ci,
      titular_contrato: titularName,
      has_debt: grandTotalDebt > 0,
      total_debt_bs: parseFloat(grandTotalDebt.toFixed(2)),
      contracts: contractsList
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/totem/consumo/:contrato', async (req, res) => {
  try {
    const contrato = req.params.contrato;
    const cRow = await safeQuery(`SELECT titular_contrato, medidor_iot, categoria, subcategoria FROM contratos WHERE numero_contrato = '${contrato}'`);
    if (cRow.length === 0) {
      return res.status(404).json({ status: "error", detail: `Contract '${contrato}' not found.` });
    }
    const c = cRow[0];
    const historyRows = await safeQuery(`SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado FROM lecturas_by_medidor WHERE medidor_iot = '${c.medidor_iot}' LIMIT 12`);
    
    const historyList = historyRows.map(h => ({
      fecha_hora_lectura: h.fecha_hora_lectura ? h.fecha_hora_lectura.toISOString() : null,
      lectura_anterior: h.lectura_anterior,
      lectura_actual: h.lectura_actual,
      consumo_m3: h.consumo,
      monto_facturado_bs: parseFloat(h.monto_facturado.toFixed(2)),
      pagado: h.pagado
    }));

    res.json({
      numero_contrato: contrato,
      titular_contrato: c.titular_contrato,
      medidor_iot: c.medidor_iot,
      categoria: c.categoria,
      subcategoria: c.subcategoria,
      historial_consumos: historyList
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/totem/preaviso/:contrato', async (req, res) => {
  try {
    const contrato = req.params.contrato;
    const cRow = await safeQuery(`SELECT titular_contrato, ci_titular, medidor_iot, categoria, subcategoria FROM contratos WHERE numero_contrato = '${contrato}'`);
    if (cRow.length === 0) {
      return res.status(404).json({ status: "error", detail: `Contract '${contrato}' not found.` });
    }
    const c = cRow[0];
    const unpaid = await safeQuery(`SELECT fecha_hora_lectura, consumo, monto_facturado FROM lecturas_unpaid_by_contrato WHERE numero_contrato = '${contrato}'`);
    
    const totalDebt = unpaid.reduce((sum, b) => sum + b.monto_facturado, 0.0);
    const latestConsumption = unpaid.length > 0 ? unpaid[0].consumo : 0;
    const latestAmount = unpaid.length > 0 ? unpaid[0].monto_facturado : 0.0;
    const latestDate = unpaid.length > 0 ? unpaid[0].fecha_hora_lectura : new Date();

    // Generate PDFs using PDF Kit service
    const thermalFilename = await PdfService.generatePreavisoPdf(contrato, 'thermal', client);
    const halfLetterFilename = await PdfService.generatePreavisoPdf(contrato, 'half_letter', client);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}/`;

    const thermalUrl = `${baseUrl}static/uploads/${thermalFilename}`;
    const halfLetterUrl = `${baseUrl}static/uploads/${halfLetterFilename}`;

    const formattedDate = latestDate.toLocaleDateString();

    const notifications = [
      {
        channel: "SMS",
        template: `SEMAPA Aviso: Estimado(a) ${c.titular_contrato}, su consumo de agua este mes fue ${latestConsumption}m3. Deuda total exigible: Bs. ${totalDebt.toFixed(2)}. Pague antes del corte. Ver PDF: ${halfLetterUrl}`
      },
      {
        channel: "WhatsApp",
        template: `Estimado(a) *${c.titular_contrato}*,\n\nLe comunicamos que su preaviso del contrato *${contrato}* está disponible:\n\n• *Consumo del período:* ${latestConsumption} m³\n• *Monto del mes:* Bs. ${latestAmount.toFixed(2)}\n• *Deuda total acumulada:* Bs. *${totalDebt.toFixed(2)}*\n• *Fecha lectura:* ${formattedDate}\n\nDescargue su recibo digital en PDF aquí: ${halfLetterUrl}\n\n_Evite cobros por reconexión y cortes del servicio realizando su pago a tiempo._`
      },
      {
        channel: "Email",
        template: `Asunto: SEMAPA - Preaviso de Cobranza Contrato ${contrato}\n\nEstimado(a) ${c.titular_contrato},\n\nAdjuntamos el detalle de su consumo y deuda pendiente de agua potable y alcantarillado:\n\nNro. Contrato: ${contrato}\nMedidor IoT: ${c.medidor_iot}\nConsumo Facturado: ${latestConsumption} m³\nMonto Período: Bs. ${latestAmount.toFixed(2)}\nDeuda Total Exigible: Bs. ${totalDebt.toFixed(2)}\n\nPuede descargar el documento PDF oficial en el siguiente enlace: ${halfLetterUrl}\n\nAtentamente,\nSEMAPA Cochabamba`
      }
    ];

    res.json({
      numero_contrato: contrato,
      titular_contrato: c.titular_contrato,
      ci_titular: c.ci_titular,
      medidor_iot: c.medidor_iot,
      categoria: c.categoria,
      subcategoria: c.subcategoria,
      ultimo_consumo_m3: latestConsumption,
      monto_ultimo_mes_bs: parseFloat(latestAmount.toFixed(2)),
      deuda_total_bs: parseFloat(totalDebt.toFixed(2)),
      fecha_lectura: latestDate ? latestDate.toISOString() : null,
      pdf_descarga_roll_55mm: thermalUrl,
      pdf_descarga_media_carta: halfLetterUrl,
      notificaciones: notifications
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

/* ==========================================
   MOBILE APP ENDPOINTS
   ========================================== */

app.post('/movil/lectura', async (req, res) => {
  try {
    const { medidor_iot, lectura_actual, lectura_anterior, radiobase, fecha_hora_lectura } = req.body;
    let lecAnt = lectura_anterior;
    if (lecAnt === undefined || lecAnt === null) {
      const prevRow = await safeQuery(`SELECT lectura_actual FROM lecturas_by_medidor WHERE medidor_iot = '${medidor_iot}' LIMIT 1`);
      lecAnt = prevRow.length > 0 ? prevRow[0].lectura_actual : 0;
    }

    const consumo = lectura_actual - lecAnt;
    const parsedDate = new Date(fecha_hora_lectura || Date.now());

    if (consumo < 0) {
      await safeQuery(`
        INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase)
        VALUES (?, ?, 1, 'LECTURA_NEGATIVA', ?, ?)
      `, [
        medidor_iot, parsedDate, 
        `Manual reading anomaly: current (${lectura_actual}) < previous (${lecAnt})`, 
        parseInt(radiobase || '0')
      ]);
      await safeQuery("UPDATE reporte_errores SET total_anomalias = total_anomalias + 1 WHERE key = 'summary'");
      return res.status(400).json({ status: "error", detail: "Lectura actual no puede ser menor a la lectura anterior." });
    }

    const contractRow = await safeQuery(`SELECT numero_contrato, categoria, subcategoria FROM contratos WHERE medidor_iot = '${medidor_iot}' ALLOW FILTERING`);
    const numContrato = contractRow.length > 0 ? contractRow[0].numero_contrato : "Sin Contrato";
    const cat = contractRow.length > 0 ? contractRow[0].categoria : "Residencial";
    const sub = contractRow.length > 0 ? contractRow[0].subcategoria : "R1";

    const tarifas = await safeQuery("SELECT categoria, precio_m3 FROM tarifas");
    const tarifasMap = {};
    tarifas.forEach(t => { tarifasMap[t.categoria] = t.precio_m3; });

    let price = tarifasMap[sub];
    if (price === undefined) price = tarifasMap[`${cat}-${sub}`];
    if (price === undefined) price = tarifasMap[cat];
    if (price === undefined) price = 2.50; // fallback

    const amount = consumo * price;

    // Fetch details for denormalization
    let zona = "Desconocido";
    let distrito = 0;
    if (contractRow.length > 0) {
      const catRow = await safeQuery(`SELECT numero_catastro FROM contratos WHERE numero_contrato = '${numContrato}'`);
      if (catRow.length > 0) {
        const infraRow = await safeQuery(`SELECT zona, distrito FROM infraestructuras WHERE numero_catastro = '${catRow[0].numero_catastro}'`);
        if (infraRow.length > 0) {
          zona = infraRow[0].zona;
          distrito = infraRow[0].distrito;
        }
      }
    }

    // Insert to all 4 tables
    const q1 = "INSERT INTO lecturas_by_medidor (medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, fecha_pago, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, null, ?, ?, false)";
    await safeQuery(q1, [medidor_iot, parsedDate, lecAnt, lectura_actual, parseInt(radiobase || '0'), consumo, amount]);

    const q2 = "INSERT INTO lecturas_by_zona (zona, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, false)";
    await safeQuery(q2, [zona, parsedDate, medidor_iot, lecAnt, lectura_actual, consumo, amount]);

    const q3 = "INSERT INTO lecturas_by_distrito (distrito, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado) VALUES (?, ?, ?, ?, ?, ?, ?, false)";
    await safeQuery(q3, [distrito, parsedDate, medidor_iot, lecAnt, lectura_actual, consumo, amount]);

    const q4 = "INSERT INTO lecturas_unpaid_by_contrato (numero_contrato, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado) VALUES (?, ?, ?, ?, ?, ?, ?)";
    await safeQuery(q4, [numContrato, parsedDate, medidor_iot, lecAnt, lectura_actual, consumo, amount]);

    res.json({
      status: "success",
      message: "Manual reading uploaded and billed.",
      details: {
        medidor_iot: medidor_iot,
        numero_contrato: numContrato,
        consumo_m3: consumo,
        monto_facturado_bs: parseFloat(amount.toFixed(2)),
        pagado: false
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.post('/movil/gps', async (req, res) => {
  try {
    const { numero_catastro, latitud, longitud } = req.body;
    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);

    await safeQuery("UPDATE infraestructuras SET latitud = ?, longitud = ? WHERE numero_catastro = ?", [lat, lng, numero_catastro]);
    
    const infraRow = await safeQuery(`SELECT distrito FROM infraestructuras WHERE numero_catastro = '${numero_catastro}'`);
    if (infraRow.length > 0) {
      const dist = infraRow[0].distrito;
      const contractRows = await safeQuery(`SELECT medidor_iot FROM contratos WHERE numero_catastro = '${numero_catastro}' ALLOW FILTERING`);
      for (const cr of contractRows) {
        await safeQuery("UPDATE medidores_by_distrito SET latitud = ?, longitud = ? WHERE distrito = ? AND medidor_iot = ?", [lat, lng, dist, cr.medidor_iot]);
      }
    }

    res.json({ status: "success", message: `GPS coordinates updated for property ${numero_catastro}.` });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.post('/movil/observacion', async (req, res) => {
  try {
    const { medidor_iot, estado, observacion } = req.body;

    await safeQuery("UPDATE medidores SET estado = ? WHERE medidor_iot = ?", [estado, medidor_iot]);
    
    const now = new Date();
    await safeQuery("INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion) VALUES (?, ?, 1, ?, ?)", [
      medidor_iot, now, estado.toUpperCase(), observacion
    ]);

    const contracts = await safeQuery(`SELECT numero_contrato FROM contratos WHERE medidor_iot = '${medidor_iot}' ALLOW FILTERING`);
    if (contracts.length > 0) {
      const numContrato = contracts[0].numero_contrato;
      const catRow = await safeQuery(`SELECT numero_catastro FROM contratos WHERE numero_contrato = '${numContrato}'`);
      if (catRow.length > 0) {
        const infraRow = await safeQuery(`SELECT distrito FROM infraestructuras WHERE numero_catastro = '${catRow[0].numero_catastro}'`);
        if (infraRow.length > 0) {
          const dist = infraRow[0].distrito;
          await safeQuery(`UPDATE medidores_by_distrito SET estado = '${estado}' WHERE distrito = ${dist} AND medidor_iot = '${medidor_iot}'`);
        }
      }
    }

    if (estado.toLowerCase() === 'dañado') {
      await safeQuery("UPDATE reporte_errores SET total_danados = total_danados + 1 WHERE key = 'summary' ALLOW FILTERING");
    } else if (estado.toLowerCase() === 'mantenimiento') {
      await safeQuery("UPDATE reporte_errores SET total_mantenimiento = total_mantenimiento + 1 WHERE key = 'summary' ALLOW FILTERING");
    }

    res.json({ status: "success", message: `Meter ${medidor_iot} state updated to '${estado}'.` });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

/* ==========================================
   GENERAL QUERY ENDPOINTS
   ========================================== */

app.get('/consumo/distrito', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT distrito, sub_alcaldia, consumo_total, facturacion_total, lecturas_count FROM reporte_consumo_distrito");
    const results = rows.map(r => ({
      distrito: r.distrito,
      sub_alcaldia: r.sub_alcaldia,
      consumo_total_m3: parseFloat(r.consumo_total.toFixed(2)),
      facturacion_total_bs: parseFloat(r.facturacion_total.toFixed(2)),
      cantidad_lecturas: r.lecturas_count ? parseInt(r.lecturas_count.toString()) : 0
    })).sort((a, b) => a.distrito - b.distrito);
    res.json(results);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/consumo/zona', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT zona, consumo_total, facturacion_total, lecturas_count FROM reporte_consumo_zona");
    const results = rows
      .filter(r => r.zona !== 'Desconocido' && r.zona !== 'desconocido')
      .map(r => ({
        zona: r.zona,
        consumo_total_m3: parseFloat(r.consumo_total.toFixed(2)),
        facturacion_total_bs: parseFloat(r.facturacion_total.toFixed(2)),
        cantidad_lecturas: r.lecturas_count ? parseInt(r.lecturas_count.toString()) : 0
      })).sort((a, b) => b.consumo_total_m3 - a.consumo_total_m3);
    res.json(results);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/consumo/percapita', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT distrito, sub_alcaldia, consumo_total, habitantes, per_capita FROM reporte_consumo_distrito");
    const results = rows.map(r => ({
      distrito: r.distrito,
      sub_alcaldia: r.sub_alcaldia,
      habitantes: r.habitantes,
      consumo_total_m3: parseFloat(r.consumo_total.toFixed(2)),
      per_capita_m3: parseFloat(r.per_capita.toFixed(4))
    })).sort((a, b) => b.per_capita_m3 - a.per_capita_m3);
    res.json(results);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/medidores/activos', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT medidor_iot, estado, tipo_medidor_id FROM medidores LIMIT 100");
    const totalActivos = 66460 + 4864 + 15959;
    res.json({
      total_count_aprox: totalActivos,
      sample_active_meters: rows.filter(r => ['Operativo', 'Nuevo', 'Reacondicionado'].includes(r.estado)).map(r => ({
        medidor_iot: r.medidor_iot,
        estado: r.estado,
        tipo_medidor_id: r.tipo_medidor_id
      }))
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/medidores/inactivos', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT medidor_iot, estado, tipo_medidor_id FROM medidores LIMIT 100");
    const repRows = await safeQuery("SELECT total_danados, total_mantenimiento FROM reporte_errores WHERE key = 'summary'");
    const totalDanados = repRows.length > 0 ? (repRows[0].total_danados ? parseInt(repRows[0].total_danados.toString()) : 14871) : 14871;
    const totalMantenimiento = repRows.length > 0 ? (repRows[0].total_mantenimiento ? parseInt(repRows[0].total_mantenimiento.toString()) : 17846) : 17846;
    res.json({
      total_inactivos_aprox: totalDanados + totalMantenimiento,
      total_danados_aprox: totalDanados,
      total_mantenimiento_aprox: totalMantenimiento,
      sample_inactive_meters: rows.filter(r => ['Dañado', 'Mantenimiento'].includes(r.estado)).map(r => ({
        medidor_iot: r.medidor_iot,
        estado: r.estado,
        tipo_medidor_id: r.tipo_medidor_id
      }))
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/errores/modelo', async (req, res) => {
  try {
    const errorRows = await safeQuery("SELECT medidor_iot, tipo_medidor_id, codigo_error FROM errores_iot LIMIT 500");
    const counts = {};
    errorRows.forEach(r => {
      const model = r.tipo_medidor_id || 1;
      counts[model] = (counts[model] || 0) + 1;
    });

    const modelNames = {
      1: "Standard Mecánico",
      2: "Ultrasonido IoT",
      3: "Electromagnético Industrial",
      4: "LoRaWAN Smart",
      5: "NB-IoT Smart"
    };

    res.json({
      errores_por_modelo: Object.entries(counts).map(([k, v]) => ({
        modelo_id: parseInt(k),
        nombre_modelo: modelNames[k] || `Modelo ${k}`,
        cantidad_errores: v
      }))
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/facturacion', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT ingresos_recaudados, deuda_total, total_clientes_morosos FROM reporte_financiero WHERE key = 'global'");
    if (rows.length === 0) {
      return res.json({ ingresos_recaudados_bs: 0.0, deuda_total_bs: 0.0, total_clientes_morosos: 0 });
    }
    const r = rows[0];
    const total = r.ingresos_recaudados + r.deuda_total;
    const cobroEficiencia = total > 0 ? (r.ingresos_recaudados / total * 100) : 0.0;
    res.json({
      total_facturado_bs: parseFloat(total.toFixed(2)),
      ingresos_recaudados_bs: parseFloat(r.ingresos_recaudados.toFixed(2)),
      deuda_pendiente_bs: parseFloat(r.deuda_total.toFixed(2)),
      eficiencia_cobro_porcentaje: parseFloat(cobroEficiencia.toFixed(2)),
      total_clientes_morosos: r.total_clientes_morosos ? parseInt(r.total_clientes_morosos.toString()) : 0
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/morosos', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT numero_contrato, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_unpaid_by_contrato LIMIT 100");
    const morososList = [];
    for (const r of rows) {
      const details = await safeQuery(`SELECT titular_contrato, ci_titular, medidor_iot, categoria FROM contratos WHERE numero_contrato = '${r.numero_contrato}'`);
      const titular = details.length > 0 ? details[0].titular_contrato : "Cliente";
      const ci = details.length > 0 ? details[0].ci_titular : "N/A";
      const cat = details.length > 0 ? details[0].categoria : "Residencial";

      morososList.push({
        numero_contrato: r.numero_contrato,
        titular: titular,
        ci_titular: ci,
        categoria: cat,
        medidor_iot: r.medidor_iot,
        fecha_lectura_impaga: r.fecha_hora_lectura ? r.fecha_hora_lectura.toISOString() : null,
        monto_deuda_bs: parseFloat(r.monto_facturado.toFixed(2))
      });
    }
    res.json(morososList);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/consumo-excesivo', async (req, res) => {
  try {
    const excesivo = [];
    for (let d = 1; d <= 15; d++) {
      const rows = await safeQuery(`SELECT medidor_iot, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_by_distrito WHERE distrito = ${d} LIMIT 50`);
      rows.forEach(r => {
        if (r.consumo > 40) {
          excesivo.push({
            distrito: d,
            medidor_iot: r.medidor_iot,
            fecha: r.fecha_hora_lectura ? r.fecha_hora_lectura.toISOString() : null,
            consumo_m3: r.consumo,
            monto_facturado_bs: parseFloat(r.monto_facturado.toFixed(2))
          });
        }
      });
    }
    res.json(excesivo.sort((a, b) => b.consumo_m3 - a.consumo_m3).slice(0, 50));
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/zonas-criticas', async (req, res) => {
  try {
    const zonaRows = await safeQuery("SELECT zona, consumo_total, facturacion_total FROM reporte_consumo_zona");
    const zonasCriticas = zonaRows
      .filter(z => z.zona !== 'Desconocido' && z.zona !== 'desconocido')
      .map(z => ({
        zona: z.zona,
        consumo_total_m3: parseFloat(z.consumo_total.toFixed(2)),
        riesgo_estres_hidrico: z.consumo_total > 50000 ? "Alto" : "Moderado"
      })).sort((a, b) => b.consumo_total_m3 - a.consumo_total_m3).slice(0, 10);
    res.json(zonasCriticas);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/lecturas-duplicadas', async (req, res) => {
  try {
    const rows = await safeQuery("SELECT medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo FROM lecturas_duplicadas_log LIMIT 100");
    const results = rows.map(r => ({
      medidor_iot: r.medidor_iot,
      fecha_hora_lectura: r.fecha_hora_lectura ? r.fecha_hora_lectura.toISOString() : null,
      lectura_anterior: r.lectura_anterior,
      lectura_actual: r.lectura_actual,
      radiobase: r.radiobase,
      motivo: r.motivo
    }));
    res.json(results);
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/mapa/medidores', async (req, res) => {
  const medidoresMapa = [];
  try {
    for (let d = 1; d <= 15; d++) {
      const rows = await safeQuery(`SELECT medidor_iot, zona, numero_contrato, numero_catastro, latitud, longitud, estado FROM medidores_by_distrito WHERE distrito = ${d}`);
      rows.forEach(r => {
        medidoresMapa.push({
          distrito: d,
          medidor_iot: r.medidor_iot,
          zona: r.zona,
          numero_contrato: r.numero_contrato,
          numero_catastro: r.numero_catastro,
          latitud: r.latitud,
          longitud: r.longitud,
          estado: r.estado
        });
      });
    }
    res.json(medidoresMapa);
  } catch (err) {
    console.error(`Error querying medidores_by_distrito: ${err.message}`);
    res.json(medidoresMapa);
  }
});

app.get('/mapa/vivienda/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await safeQuery(`SELECT numero_catastro, propietario, direccion, zona, distrito, latitud, longitud, valor_catastral FROM infraestructuras WHERE numero_catastro = '${id}'`);
    if (rows.length === 0) {
      return res.status(404).json({ status: "error", detail: `Catastro ID '${id}' not found.` });
    }
    const r = rows[0];
    
    const contractRows = await safeQuery(`SELECT numero_contrato, titular_contrato, ci_titular, categoria, subcategoria, medidor_iot FROM contratos WHERE numero_catastro = '${id}' ALLOW FILTERING`);
    let clientInfo = null;
    
    if (contractRows.length > 0) {
      const cr = contractRows[0];
      const historyRows = await safeQuery(`SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado FROM lecturas_by_medidor WHERE medidor_iot = '${cr.medidor_iot}' LIMIT 6`);
      
      const historyList = historyRows.map(h => ({
        fecha: h.fecha_hora_lectura ? h.fecha_hora_lectura.toISOString() : null,
        lectura_anterior: h.lectura_anterior,
        lectura_actual: h.lectura_actual,
        consumo_m3: h.consumo,
        monto_facturado_bs: parseFloat(h.monto_facturado.toFixed(2)),
        pagado: h.pagado
      }));

      clientInfo = {
        numero_contrato: cr.numero_contrato,
        titular: cr.titular_contrato,
        ci_titular: cr.ci_titular,
        categoria: cr.categoria,
        subcategoria: cr.subcategoria,
        medidor_iot: cr.medidor_iot,
        historial: historyList
      };
    }

    res.json({
      numero_catastro: r.numero_catastro,
      propietario: r.propietario,
      direccion: r.direccion,
      zona: r.zona,
      distrito: r.distrito,
      latitud: r.latitud,
      longitud: r.longitud,
      valor_catastral: r.valor_catastral,
      client: clientInfo
    });
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/buscar', async (req, res) => {
  const q = req.query.q || '';
  const results = { contratos: [], infraestructuras: [], medidores: [] };
  if (!q) return res.json(results);

  const qLower = q.toLowerCase();
  
  try {
    // 1. Search in contracts
    if (/^\d+$/.test(q) || q.toUpperCase().startsWith("CT") || q.toUpperCase().startsWith("MED")) {
      const cRows = await safeQuery(`SELECT numero_contrato, titular_contrato, ci_titular, medidor_iot, categoria, numero_catastro FROM contratos WHERE numero_contrato = '${q}' ALLOW FILTERING`);
      const mRows = cRows.length > 0 ? cRows : await safeQuery(`SELECT numero_contrato, titular_contrato, ci_titular, medidor_iot, categoria, numero_catastro FROM contratos WHERE medidor_iot = '${q}' ALLOW FILTERING`);
      mRows.forEach(r => {
        results.contratos.push({
          numero_contrato: r.numero_contrato,
          titular_contrato: r.titular_contrato,
          ci_titular: r.ci_titular,
          medidor_iot: r.medidor_iot,
          categoria: r.categoria,
          numero_catastro: r.numero_catastro
        });
      });
    } else {
      const cRows = await safeQuery("SELECT numero_contrato, titular_contrato, ci_titular, medidor_iot, categoria, numero_catastro FROM contratos LIMIT 500");
      cRows.forEach(r => {
        if (r.titular_contrato && r.titular_contrato.toLowerCase().includes(qLower)) {
          results.contratos.push({
            numero_contrato: r.numero_contrato,
            titular_contrato: r.titular_contrato,
            ci_titular: r.ci_titular,
            medidor_iot: r.medidor_iot,
            categoria: r.categoria,
            numero_catastro: r.numero_catastro
          });
        }
      });
    }
  } catch (err) {
    console.error(`Search contracts error: ${err.message}`);
  }

  try {
    // 2. Search in infraestructuras
    if (q.toUpperCase().startsWith("CAT-") || (q.length >= 4 && /^\d+$/.test(q.replace(/-/g, '')))) {
      const infRows = await safeQuery(`SELECT numero_catastro, direccion, latitud, longitud, zona, distrito FROM infraestructuras WHERE numero_catastro = '${q}' ALLOW FILTERING`);
      infRows.forEach(r => {
        results.infraestructuras.push({
          numero_catastro: r.numero_catastro,
          direccion: r.direccion,
          latitud: r.latitud,
          longitud: r.longitud,
          zona: r.zona,
          distrito: r.distrito
        });
      });
    } else {
      const infRows = await safeQuery("SELECT numero_catastro, direccion, latitud, longitud, zona, distrito FROM infraestructuras LIMIT 500");
      infRows.forEach(r => {
        if (r.direccion && r.direccion.toLowerCase().includes(qLower)) {
          results.infraestructuras.push({
            numero_catastro: r.numero_catastro,
            direccion: r.direccion,
            latitud: r.latitud,
            longitud: r.longitud,
            zona: r.zona,
            distrito: r.distrito
          });
        }
      });
    }
  } catch (err) {
    console.error(`Search infraestructuras error: ${err.message}`);
  }

  res.json(results);
});

// CSV paths for local fallback
const CSV_PATH = path.join(__dirname, '..', 'datos', '03 Practica 5 Recursos infraestructuras_cochabamba.csv');
const CSV_COORD_PATH = path.join(__dirname, '..', 'datos', 'infraestructuras_coordenadas.csv');

app.get('/mapa/infraestructuras', async (req, res) => {
  const distrito = req.query.distrito ? parseInt(req.query.distrito) : null;
  const buscar = req.query.buscar || null;
  const limit = parseInt(req.query.limit || '500');

  // Try reading local CSV if it exists
  try {
    const pathToUse = fs.existsSync(CSV_COORD_PATH) ? CSV_COORD_PATH : CSV_PATH;
    if (fs.existsSync(pathToUse)) {
      const rawData = await parseCsv(pathToUse, 1);
      let filtered = rawData;
      
      if (buscar) {
        const bLower = buscar.toLowerCase();
        filtered = filtered.filter(row => row.direccion && row.direccion.toLowerCase().includes(bLower));
      }
      if (distrito !== null) {
        filtered = filtered.filter(row => parseInt(row.distrito) === distrito);
      }
      
      const limited = filtered.slice(0, limit);
      return res.json(limited.map(row => ({
        numero_catastro: String(row.numero_catastro),
        direccion: String(row.direccion),
        latitud: parseFloat(row.latitud || '0.0'),
        longitud: parseFloat(row.longitud || '0.0')
      })));
    }
  } catch (csvErr) {
    console.warn(`CSV read failed: ${csvErr.message}. Falling back to database scan.`);
  }

  try {
    let query = "SELECT numero_catastro, direccion, latitud, longitud FROM infraestructuras LIMIT 2000";
    if (distrito !== null) {
      query = `SELECT numero_catastro, direccion, latitud, longitud FROM infraestructuras WHERE distrito = ${distrito} LIMIT 2000 ALLOW FILTERING`;
    }

    const rows = await safeQuery(query);
    let results = rows.map(r => ({
      numero_catastro: r.numero_catastro,
      direccion: r.direccion,
      latitud: r.latitud,
      longitud: r.longitud
    }));

    if (buscar) {
      const bLower = buscar.toLowerCase();
      results = results.filter(r => r.direccion && r.direccion.toLowerCase().includes(bLower));
    }

    res.json(results.slice(0, limit));
  } catch (err) {
    res.status(500).json({ status: "error", detail: err.message });
  }
});

app.get('/weather-comparison', async (req, res) => {
  const consumptionData = {
    "2026-02-28": 2250187.0,
    "2026-03-31": 2228679.0,
    "2026-04-30": 2207534.0
  };

  const weatherData = {
    "2026-02-28": 25.5,
    "2026-03-31": 26.8,
    "2026-04-30": 27.2
  };

  let apiSourced = false;
  try {
    const url = "http://archive-api.open-meteo.com/v1/archive?latitude=-17.3935&longitude=-66.1570&start_date=2026-02-28&end_date=2026-04-30&daily=temperature_2m_max&timezone=auto";
    const weatherRes = await new Promise((resolve, reject) => {
      http.get(url, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => resolve(JSON.parse(data)));
      }).on('error', err => reject(err));
    });

    const daily = weatherRes.daily || {};
    const times = daily.time || [];
    const temps = daily.temperature_2m_max || [];
    
    times.forEach((t, idx) => {
      if (consumptionData[t] !== undefined && temps[idx] !== null) {
        weatherData[t] = temps[idx];
      }
    });
    apiSourced = true;
  } catch (err) {
    console.warn(`Failed to fetch weather from Open-Meteo API: ${err.message}. Using fallbacks.`);
  }

  const comparison = Object.entries(consumptionData).map(([date, cons]) => ({
    fecha: date,
    consumo_total_m3: cons,
    temperatura_max_c: weatherData[date],
    ubicacion: "Cochabamba, Bolivia"
  })).sort((a, b) => a.fecha.localeCompare(b.fecha));

  res.json({
    api_sourced: apiSourced,
    data: comparison
  });
});

app.get('/dollar-price', async (req, res) => {
  let officialRate = 6.96;
  let apiSourced = false;
  try {
    const url = "http://open.er-api.com/v6/latest/USD";
    const exchangeRes = await new Promise((resolve, reject) => {
      http.get(url, (response) => {
        let data = '';
        response.on('data', chunk => { data += chunk; });
        response.on('end', () => resolve(JSON.parse(data)));
      }).on('error', err => reject(err));
    });

    const rates = exchangeRes.rates || {};
    if (rates.BOB) {
      officialRate = parseFloat(parseFloat(rates.BOB).toFixed(2));
      apiSourced = true;
    }
  } catch (err) {
    console.warn(`Failed to fetch exchange rates: ${err.message}. Using fallback 6.96.`);
  }

  res.json({
    api_sourced: apiSourced,
    base_currency: "USD",
    target_currency: "BOB",
    official_rate: officialRate,
    parallel_rate: 11.50,
    timestamp: new Date().toISOString()
  });
});

app.get('/', async (req, res) => {
  res.json({
    status: "online",
    service: "SEMAPA Big Data Backend (Node.js)",
    node_assigned: nodeName,
    database_connected: dbConnected,
    connection_details: {
      contact_points: contactPoints,
      port: cassandraPort
    }
  });
});

// Start Express Server
app.listen(apiPort, '0.0.0.0', () => {
  console.log(`Node.js SEMAPA Backend Server running at http://0.0.0.0:${apiPort}/`);
});
