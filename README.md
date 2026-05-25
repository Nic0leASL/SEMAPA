# SEMAPA - Plataforma Big Data Distribuida (Cassandra + Docker + Tailscale)

Este proyecto está diseñado de forma nativa para operar sobre un clúster distribuido horizontalmente de **Apache Cassandra 4.1** y **Node.js (Express)**, implementando un esquema de **particionamiento horizontal real** con un factor de replicación de 1 ($RF=1$).

---

## 1. Estructura del Proyecto

El repositorio está organizado en módulos independientes para separar el frontend, la lógica del backend, el esquema de base de datos y los datos origen para la ingesta:

```text
SEMAPA/
├── Backend/
│   ├── backend/               # Directorio principal del servidor Node.js
│   │   ├── uploads/           # Carpeta para archivos subidos y preavisos PDF generados
│   │   ├── Dockerfile         # Configuración del contenedor Docker para Node.js
│   │   ├── package.json       # Dependencias (Express, cassandra-driver, pdfkit, qrcode, etc.)
│   │   ├── server.js          # Archivo principal (Servidor Express y lógica de endpoints/ETL)
│   │   ├── PdfService.js      # Servicio generador de preavisos PDF (Formato térmico y media carta)
│   │   └── schema.cql         # Esquema de base de datos Cassandra (tablas denormalizadas)
│   └── datos/                 # Carpeta con los archivos CSV oficiales para la ingesta ETL
│       ├── Distritos.csv
│       ├── contratos_agua.csv
│       ├── infraestructuras_cochabamba.csv
│       ├── medidores_iot.csv
│       └── lecturas_iot.csv
├── Dasboard/                  # Frontend de la plataforma (Vite + React)
│   ├── src/                   # Componentes, vistas y lógica del mapa/gráficas
│   ├── public/                # Recursos estáticos públicos
│   ├── package.json           # Dependencias y scripts del frontend React
│   ├── index.html             # Punto de entrada HTML5
│   └── vite.config.js         # Configuración de empaquetado de Vite
├── docker-compose.primary.yml # Orquestación para PC 1 (Cassandra Node 1 + Backend + Nginx Prod)
├── docker-compose.secondary.yml # Orquestación para PC 2 (Cassandra Node 2)
└── README.md                  # Documentación general del proyecto (esta guía)
```

---

## 2. Cómo Correr el Proyecto

Puedes operar y probar el sistema utilizando dos metodologías de ejecución según tus necesidades:

### Opción A: Modo Desarrollo (Ejecución Local Rápida - Recomendado para cambios en vivo)

Este modo te permite ejecutar el frontend, el backend y la base de datos de manera independiente con recarga en vivo (Hot Reloading).

#### Paso 1: Levantar la Base de Datos (Docker)
Inicia únicamente el contenedor de Cassandra en segundo plano:
```bash
docker compose -f docker-compose.primary.yml up -d cassandra-node1
```
*Nota: Espera unos 20-30 segundos a que la base de datos esté lista para recibir conexiones.*

#### Paso 2: Ejecutar el Backend (Node.js)
Abre una terminal en la carpeta del backend, instala dependencias e inicia el servidor:
```bash
cd ./Backend/backend
npm install
npm start
```
*El servidor backend iniciará en el puerto `8000`. Detectará automáticamente la base de datos, creará el Keyspace `semapa` e inicializará el esquema CQL si no existe.*

#### Paso 3: Ejecutar el Frontend Dashboard (React + Vite)
Abre otra terminal en la carpeta del Dashboard, instala dependencias e inicia el servidor de Vite:
```bash
cd ./Dasboard
npm install
npm run dev
```
*El frontend estará disponible en `http://localhost:5173`. La API Url en la interfaz del mapa/dashboard puede ser configurada dinámicamente desde la barra superior apuntando a `http://localhost:8000`.*

---

### Opción B: Modo Producción / Despliegue Completo en Docker (Recomendado para Demos)

En este modo todo se ejecuta dentro de contenedores aislados. No necesitas iniciar terminales independientes:

1. **Compilar y Levantar todo el Stack:**
   ```bash
   docker compose -f docker-compose.primary.yml up -d --build
   ```
2. **Acceder a los Servicios:**
   * **Frontend Dashboard (Nginx):** [http://localhost:3000](http://localhost:3000)
   * **Backend API (Node.js):** [http://localhost:8000](http://localhost:8000)
   * **Cassandra Node 1:** Expuerto en el puerto nativo `9042`

---

## 3. Ingesta y Carga de Datos (ETL)

Una vez que el Frontend y el Backend estén corriendo, debes cargar los datos históricos de SEMAPA para popular la base de datos distribuida:

1. Abre el navegador en el Dashboard (en `http://localhost:3000` o `http://localhost:5173`).
2. Haz clic en la sección de **"Ingesta ETL"** del menú de navegación.
3. Carga los archivos CSV de la carpeta `/Backend/datos/` **estrictamente en el siguiente orden** debido a las relaciones de enriquecimiento de datos:
   
   1. **Distritos (`Distritos.csv`):** Define subalcaldías, cantidad de habitantes y demografía del clúster.
   2. **Contratos (`contratos_agua.csv`):** Define los titulares, medidores asociados y categorías.
   3. **Infraestructuras (`infraestructuras_cochabamba.csv`):** Define las viviendas, sus direcciones y coordenadas geográficas.
   4. **Medidores (`medidores_iot.csv`):** Define el estado (Operativo, Mantenimiento, Dañado) de los medidores IoT.
   5. **Lecturas (`lecturas_iot.csv`):** Procesa los 300,000 registros de consumo.

### Procesamiento Interno del Motor ETL en Node.js:
* **Deduplicación Cronológica:** Si se detectan múltiples lecturas para un mismo medidor en un mismo día, se almacena solo el primer registro y las réplicas redundantes se registran en `lecturas_duplicadas_log`.
* **Anomalías Negativas:** Si la lectura actual es menor que la anterior, se registra la señal como una anomalía en `errores_iot` y se descarta del cálculo de facturación.
* **Pre-agregación:** El backend genera de forma paralela resúmenes de consumo por zonas y distritos (`reporte_consumo_zona`, `reporte_consumo_distrito`) permitiendo al dashboard consultar métricas en milisegundos.

---

## 4. Despliegue Distribuido con Tailscale (2 Computadoras)

### 1. Arquitectura del Clúster
```text
PC 1 (PRINCIPAL - Mani)             PC 2 (SECUNDARIA)
├── Cassandra Nodo 1 (Seed)         └── Cassandra Nodo 2
├── Backend API (Node.js Express)
└── Frontend Dashboard (Nginx)
```

### 2. Configuración de Red Mesh (Tailscale)
Cassandra requiere comunicación TCP bidireccional directa en los puertos `7000` (Gossip) y `9042` (CQL Client). Al instalar Tailscale en ambas PCs, estas obtendrán IPs virtuales dedicadas (ej. `100.71.121.5` para PC 1 y `100.114.64.8` para PC 2), permitiendo la interconexión transparente sin abrir puertos en el router físico.

Para obtener tu IP ejecuta en consola:
```bash
tailscale ip -4
```

### 3. Configuración en la PC Principal (PC 1: `100.71.121.5`)
El archivo `docker-compose.primary.yml` levanta el nodo Seed, el backend y el dashboard:
* **CASSANDRA_SEEDS:** `100.71.121.5`
* **CASSANDRA_BROADCAST_ADDRESS:** `100.71.121.5`

### 4. Configuración en la PC Secundaria (PC 2: `100.114.64.8`)
El archivo `docker-compose.secondary.yml` levanta únicamente el nodo 2 de Cassandra:
* **CASSANDRA_SEEDS:** `100.71.121.5` (Apunta a PC 1)
* **CASSANDRA_BROADCAST_ADDRESS:** `100.114.64.8` (Su propia IP de Tailscale)

---

## 5. Verificación del Anillo Distribuido

Para comprobar que ambos nodos se hayan descubierto exitosamente y formado el anillo lógico, ejecuta en la PC Principal:
```bash
docker exec -it cassandra-node1 nodetool status
```

Debe mostrar a ambos nodos en estado **Up Normal (`UN`)**:
```text
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack
UN  100.71.121.5  354.21 KiB 16      50.0%             8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
UN  100.114.64.8  324.95 KiB 16      50.0%             fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1
```

---

## 6. Defensa Académica: Simulación de Caída de un Nodo (Sharding Real)

Para demostrar en vivo que la base de datos está realmente fragmentada horizontalmente sin replicación redundante ($RF=1$):

1. **Apagar Cassandra en PC 2:**
   ```bash
   docker stop cassandra-node2
   ```
2. **Verificar Estado del Clúster en PC 1:**
   `docker exec -it cassandra-node1 nodetool status` mostrará al Nodo 2 como **`DN`** (Down Normal).
3. **Efecto de Sharding (Pérdida Parcial de Datos):**
   * Al consultar un medidor o contrato almacenado en el **Nodo 1**, el dashboard cargará la información inmediatamente.
   * Al consultar datos cuyo hash pertenezca al rango de tokens del **Nodo 2** (apagado), el backend arrojará un error de `Timeout / NoHostAvailable`.
   * *Esto demuestra de manera fehaciente al tribunal que los datos se dividen y no están duplicados redundantemente.*
4. **Restaurar:** Vuelve a encender el contenedor en la PC Secundaria con `docker start cassandra-node2` para reintegrar el clúster.