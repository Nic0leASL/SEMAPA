# SEMAPA — Guía de Integración con el Cluster
> Para el team lead: todos los `🔌 API HOOK` están marcados en el código.  
> Busca esa cadena en cualquier archivo para ir directo al punto de cambio.

---

## Módulo 1 — App Móvil de Inspección (`InspectionForm.jsx`)

**Responsable de campo. Corre en navegador móvil (Android/iOS).**

### Endpoint requerido
```
POST /api/v1/inspections
Content-Type: application/json
Authorization: Bearer <JWT>
```

### Body que ya genera el componente
```json
{
  "id": "<UUID>",
  "contractId": "654123",
  "manualReading": 34.5,
  "coordinates": { "latitude": -17.3935, "longitude": -66.1570 },
  "photoBase64": "data:image/jpeg;base64,...",
  "timestamp": "2026-05-25T14:30:00.000Z",
  "inspectorId": "TECH-001",
  "syncStatus": "pending"
}
```

### Qué reemplazar en el código (líneas exactas)
| Archivo | Línea | Qué hacer |
|---------|-------|-----------|
| `InspectionForm.jsx` | ~270 | Reemplazar bloque `localStorage` por `axios.post('/api/v1/inspections', newRecord)` |
| `InspectionForm.jsx` | ~18  | `INSPECTOR_ID_MOCK` → leer del contexto JWT |
| Toast en `~128`      | —    | Cambiar texto de "localStorage" a "sincronizado" |

### Cassandra — tabla sugerida
```cql
CREATE TABLE semapa.inspections (
  id          UUID PRIMARY KEY,
  contract_id TEXT,
  reading     FLOAT,
  lat         DOUBLE,
  lng         DOUBLE,
  photo_url   TEXT,          -- guardar en S3/MinIO; no guardar base64 en Cassandra
  inspector_id TEXT,
  sync_status TEXT,
  created_at  TIMESTAMP
);
```

---

## Módulo 2 — Tótem de Autoservicio (`CitizenKiosk.jsx`)

**Pantalla táctil kiosk en oficina SEMAPA.**

### Endpoints requeridos

| Pantalla | Método | Endpoint |
|----------|--------|----------|
| Consulta deuda | GET | `/api/v1/accounts/:contractId` |
| Historial consumo | GET | `/api/v1/accounts/:contractId/consumption?months=3` |
| QR de pago | GET | `/api/v1/payment/qr/:contractId` |
| Reporte de fuga | POST | `/api/v1/reports` |

### Respuesta esperada de `/api/v1/accounts/:contractId`
```json
{
  "name": "Juan Mamani Quispe",
  "debt": 154.00,
  "address": "Av. América Nº 345, Cbba."
}
```

### Respuesta esperada de `/api/v1/accounts/:contractId/consumption`
```json
[
  { "month": "Febrero", "m3": 18 },
  { "month": "Marzo",   "m3": 31 },
  { "month": "Abril",   "m3": 52 }
]
```

### Body de `/api/v1/reports` (POST)
```json
{
  "id": "<UUID>",
  "category": "acera",
  "location": "Oficina Central SEMAPA — Av. Uyuni",
  "timestamp": "2026-05-25T14:30:00.000Z",
  "status": "pending"
}
```

### Cassandra — tabla sugerida
```cql
CREATE TABLE semapa.reports (
  id        UUID PRIMARY KEY,
  category  TEXT,
  location  TEXT,
  status    TEXT,
  created_at TIMESTAMP
);
```

---

## Variables de entorno necesarias (`.env`)
```env
VITE_API_BASE_URL=http://<IP-DEL-CLUSTER>:<PUERTO>
VITE_KIOSK_LOCATION=Oficina Central SEMAPA — Av. Uyuni
```

En el código, reemplazar las URLs hardcodeadas por:
```js
const API = import.meta.env.VITE_API_BASE_URL;
await axios.post(`${API}/api/v1/inspections`, newRecord);
```

---

## Cómo correr en local
```bash
npm install
npm run dev -- --host
# App móvil → http://<IP-RED>:5173  (abrir desde celular, misma WiFi)
# Tótem     → http://localhost:5173  (abrir en pantalla táctil del kiosk)
```

## Archivos relevantes
```
InspectionForm.jsx   ← App móvil técnicos de campo
CitizenKiosk.jsx     ← Tótem autoservicio ciudadano
src/WaterMapDashboard.jsx     ← Mapa GIS
src/SemapaAnalyticsPlatform.jsx ← Dashboards analíticos
```
