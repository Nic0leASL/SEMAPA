# Plataforma Big Data Distribuida para SEMAPA Cochabamba

Este repositorio contiene la implementación completa del backend para la plataforma de facturación e Internet de las Cosas (IoT) de SEMAPA Cochabamba. La solución está diseñada de forma nativa para operar sobre un clúster distribuido de **Apache Cassandra** y **FastAPI**, implementando un esquema de **particionamiento horizontal real** con un factor de replicación 1 ($RF=1$).

---

## 📚 Fundamentos Académicos de Apache Cassandra

Para defender este proyecto académicamente, es fundamental comprender cómo almacena y distribuye los datos Apache Cassandra en sus componentes internos:

```
[ Cliente API ] 
      │
      ▼  (Escribe Registro)
 ┌────┼────────────────────────────────────────────────────────┐
 │    ▼ (Escritura Secuencial Rápida)                          │
 │  [ CommitLog ] (Persistencia en Disco para Recuperación)    │
 │    │                                                        │
 │    ▼ (Escritura en Memoria)                                 │
 │  [ MemTable ]  (Búfer RAM Activo)                           │
 │    │                                                        │
 │    ▼ (Flush cuando se llena la MemTable / Umbral)           │
 │  [ SSTable ]   (Archivos de Solo Lectura Ordenados)         │
 │                                                             │
 │  [ Compaction ] (Combina SSTables, elimina duplicados/tombstones) │
 └─────────────────────────────────────────────────────────────┘
```

### 1. Arquitectura de Escritura de Cassandra
Cassandra es extremadamente rápida en la escritura debido a que su flujo evita las búsquedas aleatorias en disco:
*   **CommitLog:** Toda operación de escritura entrante se registra primero de manera secuencial en un archivo de bitácora llamado `CommitLog` (en disco). Esto garantiza la durabilidad de los datos en caso de una pérdida repentina de energía en el nodo.
*   **MemTable:** Simultáneamente, el dato se escribe en una estructura de datos en memoria (RAM) llamada `MemTable`. Las lecturas y escrituras activas acceden directamente a esta estructura.
*   **SSTables (Sorted String Tables):** Cuando la `MemTable` se llena (por tamaño o tiempo), se realiza un volcado (*Flush*) al disco, creando una `SSTable`. Las `SSTables` son archivos inmutables (de solo lectura) donde los datos se almacenan ordenados por su partición y clave de agrupamiento.
*   **Compaction (Compactación):** Dado que las `SSTables` son inmutables, las actualizaciones o eliminaciones crean nuevos registros con marcas de tiempo más recientes (o marcadores de borrado llamados *Tombstones*). El proceso de compactación lee periódicamente múltiples `SSTables` en segundo plano, combina las filas correspondientes para mantener únicamente el registro más nuevo, elimina los *Tombstones* y escribe una nueva `SSTable` unificada, liberando espacio en disco.

### 2. Particionamiento Horizontal y Sharding en Cassandra
*   **Partition Key (Clave de Partición):** Determina en qué nodo físico del clúster se almacenará una fila de datos. Cassandra aplica una función hash (**Murmur3Partitioner**) a la clave de partición. El hash resultante es un número entero entre $-2^{63}$ y $2^{63}-1$.
*   **Token Ring (Anillo de Tokens):** El clúster distribuye este rango numérico completo equitativamente entre los nodos activos. Por ejemplo, en un clúster de 2 nodos:
    *   `Nodo 1` administra el rango de tokens de $-2^{63}$ a $0$.
    *   `Nodo 2` administra el rango de tokens de $1$ a $2^{63}-1$.
*   **Replication Factor = 1 (RF=1):** Con un factor de replicación de 1, cada partición de datos se almacena **exactamente en un único nodo físico**. No existe redundancia ni alta disponibilidad de datos.
    *   *Demostración de Sharding Real:* Si el `Nodo 1` se desconecta, todas las peticiones cuyas claves de partición tengan un token menor o igual a 0 fallarán inmediatamente (Timeout/Unavailable). Sin embargo, cualquier petición al `Nodo 2` (token mayor a 0) se resolverá exitosamente. Esto demuestra de forma académica que el clúster almacena datos divididos horizontalmente.

---

## 🛠️ Simulación del Clúster (Entorno Local en 1 PC)

Para desarrollo, evaluación y pruebas rápidas, proveemos un entorno simulado compuesto por 2 nodos Cassandra y 2 APIs usando una red interna de Docker.

### Requisitos
*   Docker Desktop instalado.

### Instrucciones de Inicio

1.  **Levantar el Clúster:**
    Desde la carpeta `backend`, ejecuta:
    ```bash
    docker compose up -d
    ```
    *Nota: Esto iniciará `cassandra-node1`, esperará a que pase el chequeo de salud y luego levantará `cassandra-node2`, `backend-api-1` y `backend-api-2`.*

2.  **Verificar el Estado del Clúster Cassandra:**
    Corre el siguiente comando para validar que ambos nodos se hayan unido al anillo y estén en estado `UN` (Up Normal):
    ```bash
    docker exec -it cassandra-node1 nodetool status
    ```
    Deberías ver una salida similar a esta:
    ```text
    Status=Up/Down
    |/ State=Normal/Leaving/Joining/Moving
    --  Address     Load       Tokens  Owns (effective)  Host ID                               Rack
    UN  172.20.0.2  235.45 KiB 16      50.0%             a5b82c2d-9481-4202-b2d9-11c572b9ef08  rack1
    UN  172.20.0.3  215.11 KiB 16      50.0%             f82e8da2-0941-482a-a921-99ee3c441aa2  rack1
    ```
    *Nota: `Owns = 50.0%` indica que el particionamiento horizontal ha dividido el anillo exactamente a la mitad entre ambos nodos.*

---

## 🚀 Script de Carga Inicial (Seeding)

Para facilitar la preparación de la defensa académica, el backend incluye un endpoint y comandos automáticos para pre-poblar los datos masivos de SEMAPA (100k contratos, 80k viviendas, 120k medidores y 300k lecturas) directamente desde la carpeta `datos/` de la raíz del proyecto.

### Pasos para realizar la carga mediante la API de Ingesta

Puedes ejecutar peticiones POST secuenciales a los endpoints de carga (por ejemplo usando Postman, cURL o scripts). 
El orden correcto de las llamadas es **crítico** debido a las dependencias de datos:

1.  **Cargar Catastro Urbano (Infraestructura):**
    ```bash
    curl -X POST "http://localhost:8000/upload/infraestructura" -F "file=@../datos/03 Practica 5 Recursos infraestructuras_cochabamba.csv"
    ```
2.  **Cargar Estructura Geográfica (Distritos):**
    ```bash
    curl -X POST "http://localhost:8000/upload/distritos" -F "file=@../datos/03 Practica 5 Recursos - Distritos.csv"
    ```
3.  **Cargar Contratos de Agua:**
    ```bash
    curl -X POST "http://localhost:8000/upload/contratos" -F "file=@../datos/03 Practica 5 Recursos contratos_agua.csv"
    ```
4.  **Cargar Medidores IoT:**
    ```bash
    curl -X POST "http://localhost:8000/upload/medidores" -F "file=@../datos/03 Practica 5 Recursos medidores_iot.csv"
    ```
5.  **Cargar Lecturas IoT (Con deduplicación y cálculo de tarifas):**
    ```bash
    curl -X POST "http://localhost:8000/upload/lecturas" -F "file=@../datos/03 Practica 5 Recursos lecturas_iot.csv"
    ```

El backend procesará las lecturas haciendo uso de **Pandas**, limpiando las señales repetidas en el mismo día (conservando la primera) y volcando las duplicadas al log `lecturas_duplicadas_log`. También calculará en paralelo el consumo y los costos mensuales en base a las tarifas registradas.

---

## 🌐 Configuración Distribuida Física Real (Multi-PC vía Tailscale)

Para configurar la arquitectura física real distribuida en tres computadoras independientes usando VPN Tailscale:

```
    [ PC 1 ] (Tailscale: 100.1.1.1)
    ┌───────────────────────────────┐
    │  - Cassandra Nodo 1 (Seed)    │
    │  - FastAPI API Principal      │
    └──────────────┬────────────────┘
                   │  (Tailscale Tunnel)
                   ▼
    [ PC 2 ] (Tailscale: 100.2.2.2)
    ┌───────────────────────────────┐
    │  - Cassandra Nodo 2           │
    │  - FastAPI API Secundario     │
    └───────────────────────────────┘
```

### Configuración en PC 1 (Cassandra Nodo 1 - Seed + API Principal)
1.  Instala Docker Desktop y Tailscale en la máquina. Conéctala a tu red de Tailscale y copia la IP asignada (ejemplo: `100.1.1.1`).
2.  Prepara un archivo `docker-compose-pc1.yml` con la siguiente configuración para Cassandra (usando la IP de Tailscale de PC 1):
    ```yaml
    services:
      cassandra-pc1:
        image: cassandra:4.1
        ports:
          - "9042:9042"
        environment:
          - CASSANDRA_CLUSTER_NAME=SemapaCluster
          - CASSANDRA_LISTEN_ADDRESS=0.0.0.0            # Escucha en todas las interfaces
          - CASSANDRA_BROADCAST_ADDRESS=100.1.1.1        # Su IP de Tailscale
          - CASSANDRA_RPC_ADDRESS=0.0.0.0
          - CASSANDRA_BROADCAST_RPC_ADDRESS=100.1.1.1    # Su IP de Tailscale
          - CASSANDRA_ENDPOINT_SNITCH=SimpleSnitch
          - CASSANDRA_DC=dc1
          - CASSANDRA_RACK=rack1
          - CASSANDRA_NUM_TOKENS=16
    ```
3.  Levanta la API Principal apuntando a su contenedor local:
    *   Variable de entorno: `CASSANDRA_CONTACT_POINTS=100.1.1.1`

### Configuración en PC 2 (Cassandra Nodo 2 + API Secundario)
1.  Instala Docker Desktop y Tailscale. Conéctala a la misma red y copia su IP (ejemplo: `100.2.2.2`).
2.  Prepara un archivo `docker-compose-pc2.yml` para el Nodo 2 de Cassandra (apuntando al Seed de PC 1):
    ```yaml
    services:
      cassandra-pc2:
        image: cassandra:4.1
        ports:
          - "9042:9042"
        environment:
          - CASSANDRA_CLUSTER_NAME=SemapaCluster
          - CASSANDRA_SEEDS=100.1.1.1                    # IP Tailscale de PC 1 (Seed)
          - CASSANDRA_LISTEN_ADDRESS=0.0.0.0
          - CASSANDRA_BROADCAST_ADDRESS=100.2.2.2        # Su IP de Tailscale
          - CASSANDRA_RPC_ADDRESS=0.0.0.0
          - CASSANDRA_BROADCAST_RPC_ADDRESS=100.2.2.2    # Su IP de Tailscale
          - CASSANDRA_ENDPOINT_SNITCH=SimpleSnitch
          - CASSANDRA_DC=dc1
          - CASSANDRA_RACK=rack1
          - CASSANDRA_NUM_TOKENS=16
    ```
3.  Levanta la API Secundaria en PC 2:
    *   Variable de entorno: `CASSANDRA_CONTACT_POINTS=100.2.2.2`

4.  **Validación del Clúster Remoto:**
    En la consola de cualquiera de las computadoras, ejecuta `nodetool status` dentro del contenedor Cassandra y verifica que se listen ambas IPs de Tailscale (`100.1.1.1` y `100.2.2.2`) en estado unificado `UN`.

---

## 🧪 Demostración del Particionamiento Horizontal (Defensa Académica)

Para demostrar en vivo frente al tribunal que la base de datos está realmente fragmentada y no duplicada:

1.  **Paso 1: Localizar la partición de un medidor:**
    Identifica a qué nodo físico pertenece el historial de lecturas de un medidor de prueba (`7D:16:0E:17:7E:AA`):
    ```bash
    docker exec -it cassandra-node1 nodetool getendpoints semapa lecturas_by_medidor "7D:16:0E:17:7E:AA"
    ```
    Cassandra te responderá con la dirección IP del nodo que almacena físicamente ese medidor (ejemplo: `172.20.0.3` correspondiente al `Nodo 2`).

2.  **Paso 2: Consultar la API (Ambos Nodos Activos):**
    Haz una petición para consultar los consumos de ese contrato en el Totem de un ciudadano:
    `GET http://localhost:8000/totem/consumo/CT-00000001`
    La consulta retornará los datos de forma normal ya que ambos nodos están en línea.

3.  **Paso 3: Detener el Nodo que contiene la partición:**
    Apaga el contenedor del Nodo 2:
    ```bash
    docker compose stop cassandra-node2
    ```
    Valida el estado del clúster (`nodetool status`). Verás que el Nodo 2 aparece como desconectado (`DN` - Down Normal).

4.  **Paso 4: Repetir la Consulta (Fallo Focalizado):**
    Realiza la misma petición `GET http://localhost:8000/totem/consumo/CT-00000001`. 
    La API responderá con un error (Timeout/NoHostAvailable), confirmando que **los datos que residían en ese nodo se han vuelto inaccesibles** debido a que no hay replicación ($RF=1$).

5.  **Paso 5: Probar una Partición en el Nodo Activo (Éxito Focalizado):**
    Busca otro medidor que resida en el Nodo 1 y realiza la consulta de consumo para su respectivo contrato.
    ¡La petición se resolverá exitosamente! Esto demuestra de forma irrefutable el **sharding horizontal** y que el nodo sobreviviente sigue operando normalmente.

---

## 📋 Catálogo de APIs Disponibles

### Ingesta Masiva (ETL)
*   `POST /upload/distritos`: Sube el archivo CSV de Zonas y Distritos Cochabamba.
*   `POST /upload/infraestructura`: Sube el padrón catastral de propiedades.
*   `POST /upload/contratos`: Ingesta el padrón de contratos de agua de SEMAPA.
*   `POST /upload/medidores`: Carga los estados y tipos de medidores IoT.
*   `POST /upload/lecturas`: Carga las lecturas mensuales, ejecuta la deduplicación diaria y pre-calcula cobros.

### Cuadros de Mando (Dashboards)
*   `GET /dashboard/presidente`: Estadísticas de consumo por distrito, mapas de calor agregados y estrés hídrico.
*   `GET /dashboard/administrador`: Control de fallas IoT, estado de medidores y últimas alarmas.
*   `GET /dashboard/finanzas`: Morosidad, deudas, cobros efectivos y proyecciones de ingresos.

### Totem de Atención al Ciudadano
*   `GET /totem/deuda/{ci}`: Busca deudas vigentes de un ciudadano a través de su carnet de identidad.
*   `GET /totem/consumo/{contrato}`: Obtiene el historial de consumos de los últimos meses de un contrato.
*   `GET /totem/preaviso/{contrato}`: Genera el preaviso digital de cobranza. Retorna enlaces de descarga en PDF para ticketera térmica (55mm) o media carta, y plantillas de notificación.

### Aplicación Móvil de Lectura
*   `POST /movil/lectura`: Registra una lectura manual ingresada en campo por un técnico.
*   `POST /movil/gps`: Actualiza la geolocalización de un catastro.
*   `POST /movil/observacion`: Registra fallas técnicas o daños observados en un medidor.
