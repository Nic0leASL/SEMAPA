# Implementation Plan: Distributed Big Data Backend for SEMAPA Cochabamba

This implementation plan describes the backend design and deployment strategy for the SEMAPA Big Data distributed platform using Apache Cassandra (2-node cluster with replication factor = 1 to demonstrate real horizontal partitioning) and FastAPI.

The design is tailored to the exact columns, formats, and data sizes found in the analyzed CSV files:
- `Distritos.csv`: 60 rows of lookup information with Excel-style merged cells.
- `contratos_agua.csv`: 100,001 rows of active water contracts.
- `infraestructuras_cochabamba.csv`: 80,001 rows of houses/properties.
- `medidores_iot.csv`: 120,001 rows of physical water meters.
- `lecturas_iot.csv`: 303,205 rows of IoT water consumption readings.

---

## User Review Required

> [!IMPORTANT]
> **Horizontal Partitioning (RF=1)**: 
> We are using `replication_factor=1` and a 2-node Cassandra cluster. This means each row will reside on only one node based on its partition key hash. If Node 1 goes down, queries for keys on Node 1 will fail, while Node 2 will function normally. This demonstrates horizontal partitioning.
> For local testing and grading, we will provide a **Single-Machine Docker Compose** setup (exposing Node 1 on port `9042` and Node 2 on `9043` in a single virtual network) alongside the **Multi-PC Tailscale setup** instructions.

> [!WARNING]
> **Data Encoding**:
> The input CSV files contain Spanish special characters (Ñ, accent marks). The ETL script will use `latin-1` or `cp1252` encoding to load the CSVs into Pandas and write them properly encoded into Cassandra.

---

## Open Questions

> [!NOTE]
> **Default Tariffs**: 
> Since there is no `tarifas.csv` file in the raw files, we will create a default tariffs table pre-populated with standard SEMAPA categories (R1, R2, R3, R4, C, CE, I, P, S) and pricing per $m^3$. An upload endpoint for `tarifas.csv` will still be supported.

---

## Proposed Changes

We will construct the backend inside a new folder named `backend` in the workspace root.

```
backend/
├── app/
│   ├── routes/
│   │   ├── etl.py
│   │   ├── dashboard.py
│   │   ├── queries.py
│   │   ├── mobile.py
│   │   ├── totem.py
│   │   └── base.py
│   ├── services/
│   │   ├── cassandra_service.py
│   │   ├── etl_service.py
│   │   ├── pdf_service.py
│   │   └── notification_service.py
│   ├── cassandra/
│   │   ├── connection.py
│   │   └── schema.cql
│   ├── models/
│   │   └── (optional database helper models)
│   ├── schemas/
│   │   └── requests.py (Pydantic models)
│   ├── utils/
│   │   └── helpers.py
│   └── main.py
├── datos/ (linked/copied from root datos/ for seeding)
├── uploads/
├── docker-compose.yml
├── requirements.txt
└── README.md
```

### Component: Cassandra Database Layer

We will define a `schema.cql` containing denormalized tables optimized for Cassandra's query-first design pattern. 

#### [NEW] [schema.cql](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/cassandra/schema.cql)
Create keyspace `semapa` and define tables:
- `contratos` (PK: `numero_contrato`): Primary lookup.
- `contratos_by_ci` (PK: `ci_titular`, CK: `numero_contrato`): Totem search by CI.
- `infraestructuras` (PK: `numero_catastro`): House metadata and GPS.
- `medidores` (PK: `medidor_iot`): Meter details and state.
- `medidores_by_distrito` (PK: `distrito`, CK: `medidor_iot`): Dashboard & Map queries.
- `lecturas_by_medidor` (PK: `medidor_iot`, CK: `fecha_hora_lectura` DESC): Totem and deduplication.
- `lecturas_by_zona` (PK: `zona`, CK: `fecha_hora_lectura` DESC, `medidor_iot`): Dashboard consumption.
- `lecturas_by_distrito` (PK: `distrito`, CK: `fecha_hora_lectura` DESC, `medidor_iot`): Dashboard consumption.
- `lecturas_unpaid_by_contrato` (PK: `numero_contrato`, CK: `fecha_hora_lectura` DESC): Totem debt.
- `tarifas` (PK: `categoria`): Pricing per m3.
- `distritos` (PK: `distrito`, CK: `sub_distrito`, `zona`): Population and category counts.
- `errores_iot` (PK: `medidor_iot`, CK: `fecha_hora_error` DESC): IoT errors.
- `lecturas_duplicadas_log` (PK: `medidor_iot`, CK: `fecha_hora_lectura` DESC): Duplicate logs.
- **Aggregates Tables**:
  - `reporte_consumo_zona` (PK: `zona`): Columns: `consumo_total`, `facturacion_total`, `lecturas_count`.
  - `reporte_consumo_distrito` (PK: `distrito`): Columns: `consumo_total`, `facturacion_total`, `lecturas_count`, `habitantes`, `per_capita`.
  - `reporte_financiero` (PK: `key`): Summary of total revenue, collected, debt, and morosos count.
  - `reporte_errores` (PK: `modelo_id` / `estado`): Counts of failures.

#### [NEW] [connection.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/cassandra/connection.py)
A module to establish and cache the Cassandra `Cluster` and `Session` connections. It will connect to the contact points configured in environment variables (supporting multi-node setup). It will handle automated keyspace and table creation on startup.

---

### Component: ETL & Data Processing Layer

#### [NEW] [etl_service.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/services/etl_service.py)
Handles file parsing, cleaning, and high-speed parallel insertion into Cassandra:
- **Deduplication**: Read `lecturas_iot.csv`. Identify duplicates based on `(medidor_iot, fechaHoraLectura_date)`. Sort by timestamp. Keep the first reading of the day. Save rejected records to `lecturas_duplicadas_log`.
- **Validation**:
  - Check `LecturaActual >= lecturaAnterior`. If not, flag as anomaly and insert into `errores_iot` (e.g. meter rollback error).
  - Calculate `consumo` ($m^3$) and lookup tariff to compute `monto_facturado`.
  - Check `fecha_pago` to mark as paid/unpaid.
- **Pre-aggregation**: Calculate summary statistics (e.g. consumption per zone, district per-capita, financial totals) in Pandas and insert them into aggregate tables for instant dashboard queries.
- **Parallel Loading**: Use the Cassandra Python Driver's asynchronous `execute_async` interface with a bounded Semaphore to execute high-speed inserts (up to 300,000 readings in ~1-2 minutes).

#### [NEW] [etl.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/routes/etl.py)
Endpoints `POST /upload/contratos`, `/upload/infraestructura`, `/upload/medidores`, `/upload/lecturas`, `/upload/tarifas` that accept uploaded CSV files and invoke `etl_service`.

---

### Component: FastAPI Router & Business Logic

#### [NEW] [dashboard.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/routes/dashboard.py)
Endpoints tailored for each user role:
- `GET /dashboard/presidente`: Fetch from pre-aggregated tables (`reporte_consumo_zona`, `reporte_consumo_distrito` showing per-capita consumption, heatmaps, total statistics).
- `GET /dashboard/administrador`: Meter states count (`Operativo`, `Dañado`, etc.), error logs, distribution values.
- `GET /dashboard/finanzas`: Morosos counts, total debt, total billing, projected revenue.

#### [NEW] [queries.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/routes/queries.py)
Endpoints for specific data queries:
- `/consumo/distrito`, `/consumo/zona`, `/consumo/percapita`
- `/medidores/activos`, `/medidores/inactivos`
- `/errores/modelo`
- `/facturacion`, `/morosos`, `/consumo-excesivo`
- `/zonas-criticas` (high water stress or high consumption)
- `/lecturas-duplicadas` (returns logs of filtered duplicates)
- `/mapa/medidores`, `/mapa/vivienda/{id}`

#### [NEW] [mobile.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/routes/mobile.py)
Endpoints for mobile devices:
- `POST /movil/lectura`: Insert manual meter reading.
- `POST /movil/gps`: Update coordinates for a contract.
- `POST /movil/observacion`: Register observations (damages, leaks, meter status).

#### [NEW] [totem.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/routes/totem.py)
Citizen Totem endpoints:
- `GET /totem/deuda/{ci}`: Lookup total unpaid amount by CI.
- `GET /totem/consumo/{contrato}`: Return consumption history.
- `GET /totem/preaviso/{contrato}`: Generate PDF invoice and return download link.

---

### Component: PDF Generation & Notifications

#### [NEW] [pdf_service.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/services/pdf_service.py)
Generates high-quality PDF files using **ReportLab**:
- **55mm Thermal Roll PDF**: Designed for field ticketing. Compact width, stacked layout, simple QR code, customer name, contract, consumption, debt, and billing details.
- **Half Letter (Media Carta) PDF**: Designed for standard printing. Dual-column details, consumption history chart/table, QR code, payment details.
- **QR Code generation**: Embeds a vector-based QR containing invoice details.

#### [NEW] [notification_service.py](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/app/services/notification_service.py)
Creates and renders communication templates:
- **Email Template**: Beautiful responsive HTML email including client info and linking the PDF bill.
- **WhatsApp Template**: Rich text message with emojis and a PDF link.
- **SMS Template**: Short text message with essential billing info.

---

### Component: Infrastructure & Deployment

#### [NEW] [docker-compose.yml](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/docker-compose.yml)
Defines services for:
- `cassandra-node1`: Main node (seed).
- `cassandra-node2`: Second node joining the cluster.
- `backend-api-1`: FastAPI backend connecting to Node 1.
- `backend-api-2`: FastAPI backend connecting to Node 2.
Exposes correct ports (`9042` and `9043` for Cassandra nodes) and implements basic networking so they form a single cluster.

#### [NEW] [requirements.txt](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/requirements.txt)
Dependencies: `fastapi`, `uvicorn`, `cassandra-driver`, `pandas`, `pydantic`, `reportlab`, `qrcode`, `python-multipart`, `jinja2`.

#### [NEW] [README.md](file:///c:/Users/manuc/Universidad/Sistemas%20distribuidos/Cassandra/Proyecto/backend/README.md)
Comprehensive documentation covering:
- **Tailscale Setup**: How to configure Tailscale on PC 1 and PC 2, expose docker ports, and bind Cassandra's `broadcast_address` to the Tailscale IPs.
- **Verification Commands**: Using `nodetool status` and testing endpoints.
- **Cassandra Internals**: Detailed academic explanation of MemTables, SSTables, CommitLogs, compaction, partitioning, and token hashing.

---

## Verification Plan

### Automated & Manual Verification
1. **Cluster Setup**:
   - Run `docker compose up -d` to start the cluster.
   - Run `docker exec -it backend-cassandra-node1-1 nodetool status` to confirm Node 1 and Node 2 form a single cluster with status `UN` (Up Normal).
2. **ETL Import & Deduplication Test**:
   - Call `POST /upload/infraestructura`, `POST /upload/medidores`, `POST /upload/contratos`, and `POST /upload/lecturas` with the real CSV data.
   - Validate that ~300k readings are deduplicated, cleaned, and loaded successfully.
   - Verify that the `GET /lecturas-duplicadas` endpoint returns the logs of duplicates.
3. **Horizontal Partitioning Demo**:
   - Query a particular contract/meter location. Determine which node holds its partition key token using `nodetool getendpoints semapa lecturas_by_medidor <medidor_iot>`.
   - Turn off one of the Cassandra nodes (`docker compose stop cassandra-node2`).
   - Query a meter residing on Node 1 (succeeds).
   - Query a meter residing on Node 2 (fails/timeouts).
   - Confirm Node 1 continues to run normally, demonstrating real horizontal partitioning without replication.
4. **PDF Generation**:
   - Call `GET /totem/preaviso/{contrato}`. Download both 55mm and Half Letter PDFs, verifying the layout, typography, and QR code representation.
