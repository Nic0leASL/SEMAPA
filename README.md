# SEMAPA - Plataforma Big Data Distribuida (Cassandra + Docker + Tailscale)

Este proyecto está diseñado de forma nativa para operar sobre un clúster distribuido horizontalmente de **Apache Cassandra 4.1** y **FastAPI**, implementando un esquema de **particionamiento horizontal real** con un factor de replicación de 1 ($RF=1$).

Esta guía permite realizar un despliegue multi-máquina real utilizando la red virtual de **Tailscale** en menos de 10 minutos.

---

# DESPLIEGUE DISTRIBUIDO CON TAILSCALE

## 1. Arquitectura del Sistema

El despliegue distribuye los componentes del sistema en dos computadoras físicas independientes interconectadas de manera segura:

### Distribución por Computadora
```text
PC 1 (PRINCIPAL - Mani)             PC 2 (SECUNDARIA)
├── Cassandra Nodo 1 (Seed)         └── Cassandra Nodo 2
├── Backend API (FastAPI)
└── Frontend Dashboard (Nginx)
```

### Flujo de Datos y Conexiones
```text
      Frontend (Puerto 3000)
         │
         ▼ (Llamadas REST)
     Backend API (Puerto 8000)
         │
         ▼ (Driver CQL Nativo - Puerto 9042)
   ┌──────────────────────────────────────────────┐
   │              CLUSTER CASSANDRA               │
   │  (Gossip inter-nodo vía Puerto 7000)         │
   │                                              │
   │  ├── Nodo 1 (PC 1 Seed) : 100.71.121.5        │
   │  └── Nodo 2 (PC 2)      : 100.114.64.8       │
   └──────────────────────────────────────────────┘
```

---

## 2. ¿Qué es Tailscale y por qué lo usamos?

**Tailscale** es una herramienta de red de confianza cero (Zero Trust) basada en el protocolo **WireGuard®**.
- **Qué hace:** Crea una red de área local virtual segura (VPN mesh/malla) entre diferentes dispositivos físicos a través de Internet, sin necesidad de configurar firewalls complejos, routers o redirigir puertos (port forwarding).
- **Por qué se usa aquí:** Cassandra requiere comunicación TCP bidireccional directa entre todos sus nodos (en los puertos `7000` y `9042`). Al instalar Tailscale, ambos equipos obtendrán una IP virtual dedicada (dentro del rango `100.X.X.X`), permitiendo que el contenedor de Docker de la PC 1 se conecte directamente con el contenedor de la PC 2 como si estuviesen en el mismo switch físico.

---

## 3. Instalación y Configuración de Tailscale

Ambos compañeros deben seguir estos sencillos pasos:

1. **Instalar Tailscale:** Descarga e instala el cliente oficial para tu sistema operativo desde [https://tailscale.com/download](https://tailscale.com/download).
2. **Iniciar sesión:** Inicia sesión con la misma cuenta de proveedor de identidad (Gmail, GitHub, etc.) en ambos dispositivos para que queden vinculados en la misma red privada virtual.
3. **Verificar la conexión:** Una vez conectados, comprueba que puedes ver al otro equipo en la lista de dispositivos de Tailscale.
4. **Obtener tu IP de Tailscale:** Abre una consola y ejecuta el siguiente comando:
   ```bash
   tailscale ip -4
   ```
   *Nota: En esta guía asumimos que la IP de la PC 1 (Mani) es `100.71.121.5` y la IP de la PC 2 es `100.114.64.8`.*

---

## 4. Configuración de docker-compose.primary.yml (PC Principal)

En la **PC Principal (Mani: 100.71.121.5)**, el archivo `docker-compose.primary.yml` levanta el Nodo 1 (que actúa como Seed del clúster), la API del Backend y la interfaz del Dashboard.

```yaml
version: '3.8'

services:
  cassandra-node1:
    image: cassandra:4.1
    container_name: cassandra-node1
    ports:
      - "9042:9042"      # Puerto CQL nativo
      - "7000:7000"      # Puerto de comunicación/gossip inter-nodo (Crítico para Tailscale)
      - "7199:7199"      # Puerto JMX para nodetool status/ring
    environment:
      - CASSANDRA_CLUSTER_NAME=SEMAPA_CLUSTER
      - CASSANDRA_SEEDS=100.71.121.5                 # IP Tailscale de PC 1 (Seed)
      - CASSANDRA_BROADCAST_ADDRESS=100.71.121.5     # Anuncia esta IP de Tailscale a otros nodos
      - CASSANDRA_RPC_ADDRESS=0.0.0.0                # Escucha en todas las interfaces para conexiones de clientes
      - CASSANDRA_BROADCAST_RPC_ADDRESS=100.71.121.5 # Anuncia esta IP para que la API se conecte
      - CASSANDRA_ENDPOINT_SNITCH=SimpleSnitch
      - CASSANDRA_DC=dc1
      - CASSANDRA_RACK=rack1
      - CASSANDRA_NUM_TOKENS=16
    volumes:
      - cassandra_node1_data:/var/lib/cassandra
    healthcheck:
      test: ["CMD-SHELL", "cqlsh -e 'describe keyspaces' || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 10

  backend-api:
    build:
      context: ./Backend/backend
      dockerfile: Dockerfile
    container_name: backend-api
    ports:
      - "8000:8000"
    environment:
      - CASSANDRA_CONTACT_POINTS=100.71.121.5
      - CASSANDRA_PORT=9042
      - API_PORT=8000
      - NODE_NAME=API_Principal_Nodo1
    depends_on:
      cassandra-node1:
        condition: service_healthy
    volumes:
      - ./Backend/backend/uploads:/app/uploads
      - ./Backend/datos:/app/datos:ro

  frontend-dashboard:
    image: nginx:alpine
    container_name: frontend-dashboard
    ports:
      - "3000:80"
    volumes:
      - ./Dasboard:/usr/share/nginx/html:ro

volumes:
  cassandra_node1_data:
```

---

## 5. Configuración de docker-compose.secondary.yml (PC Secundaria)

En la **PC Secundaria (Compañero: 100.114.64.8)**, se clona el proyecto y se utiliza el archivo `docker-compose.secondary.yml` para levantar únicamente el Nodo 2 de Cassandra.

```yaml
version: '3.8'

services:
  cassandra-node2:
    image: cassandra:4.1
    container_name: cassandra-node2
    ports:
      - "9042:9042"      # Puerto CQL nativo
      - "7000:7000"      # Puerto de comunicación/gossip inter-nodo (Crítico para Tailscale)
      - "7199:7199"      # Puerto JMX para nodetool status/ring
    environment:
      - CASSANDRA_CLUSTER_NAME=SEMAPA_CLUSTER
      - CASSANDRA_SEEDS=100.71.121.5                 # IP Tailscale de PC 1 (Seed/Principal)
      - CASSANDRA_BROADCAST_ADDRESS=100.114.64.8     # Anuncia esta IP de Tailscale (PC Secundaria)
      - CASSANDRA_RPC_ADDRESS=0.0.0.0                # Escucha en todas las interfaces para conexiones
      - CASSANDRA_BROADCAST_RPC_ADDRESS=100.114.64.8 # Anuncia esta IP para que los clientes se conecten
      - CASSANDRA_ENDPOINT_SNITCH=SimpleSnitch
      - CASSANDRA_DC=dc1
      - CASSANDRA_RACK=rack1
      - CASSANDRA_NUM_TOKENS=16
    volumes:
      - cassandra_node2_data:/var/lib/cassandra

volumes:
  cassandra_node2_data:
```

---

## 6. Comandos Finales Simples de Arranque

### En la PC Principal (Mani)
Levanta todos los servicios principales del cluster en segundo plano:
```bash
docker compose -f docker-compose.primary.yml up -d
```

### En la PC Secundaria (Compañero)
Levanta el segundo nodo de Cassandra conectándose automáticamente al principal a través de Tailscale:
```bash
docker compose -f docker-compose.secondary.yml up -d
```

---

## 7. Verificación del Estado del Clúster

Para validar que ambos nodos se hayan descubierto mutuamente y formado el anillo distribuido, ejecuta en la terminal de la **PC Principal**:

```bash
docker exec -it cassandra-node1 nodetool status
```

Debe mostrar una salida con **ambos nodos en estado Up Normal (`UN`)**:

```text
Status=Up/Down
|/ State=Normal/Leaving/Joining/Moving
--  Address       Load       Tokens  Owns (effective)  Host ID                               Rack
UN  100.71.121.5  354.21 KiB 16      50.0%             8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
UN  100.114.64.8  324.95 KiB 16      50.0%             fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1
```

---

## 8. Verificación de la Distribución Horizontal

Para comprobar cómo se particionan los datos en el anillo de Cassandra, ejecuta:

```bash
docker exec -it cassandra-node1 nodetool ring
```

### Explicación del Anillo (Ring):
1. **Rango de Tokens:** Cassandra divide el anillo completo (de $-2^{63}$ a $2^{63}-1$) entre los nodos activos utilizando el particionador **Murmur3Partitioner**.
2. **Tokens Asignados:** Cada nodo posee una fracción del rango de tokens (en este caso, 50.0% efectivos cada uno con 16 vnodes).
3. **Distribución Real:** Si una fila es insertada, Cassandra aplica hash a su clave de partición. El resultado determinará de forma matemática e inequívoca si la fila se almacena físicamente en el Nodo 1 o en el Nodo 2.

---

## 9. Simulación de Caída de un Nodo (Sharding Real)

Para demostrar en vivo frente a un tribunal académico que la base de datos está realmente particionada horizontalmente y que **no existe duplicación redundante** ($RF=1$):

1. **Detener el Nodo 2:** En la **PC Secundaria**, apaga el contenedor de Cassandra:
   ```bash
   docker stop cassandra-node2
   ```
2. **Verificar Estado del Clúster:** En la **PC Principal**, ejecuta `docker exec -it cassandra-node1 nodetool status`. Verás al Nodo 2 en estado **`DN`** (Down Normal):
   ```text
   UN  100.71.121.5  354.21 KiB 16      100.0%            8b5d3c8d-3921-4b1c-99d9-11c67e72ff08  rack1
   DN  100.114.64.8  0.00 KiB   16      0.0%              fa2c8db2-2321-482a-a921-77ee8ca41cc2  rack1
   ```
3. **Efecto en el Sistema (Pérdida Parcial de Datos):**
   - Abre el **Frontend Dashboard** en la PC Principal (`http://localhost:3000`). Verás una alerta indicando que el clúster está operando con degradación.
   - Las consultas a datos almacenados en el **Nodo 1** (cuyos hashes caigan en sus rangos de token) se resolverán con éxito instantáneo.
   - Las consultas a datos cuyo propietario exclusivo era el **Nodo 2** fallarán arrojando un error de tipo `Timeout / NoHostAvailable`.
   *Esto demuestra empíricamente que cada nodo físico posee únicamente su propia sección de datos.*
4. **Restaurar el Servicio:** Vuelve a encender el contenedor en la **PC Secundaria**:
   ```bash
   docker start cassandra-node2
   ```
   En unos segundos, el clúster volverá a su estado normal `UN` integrado en ambas máquinas.

---

## 10. IMPORTANTE: Conclusiones para la Defensa Académica

Durante la defensa del proyecto, recalca las siguientes decisiones de diseño:
- **No es Replicación Completa:** Con $RF=1$, no hay redundancia. Esto contrasta con sistemas de Alta Disponibilidad convencional ($RF=3$ o similar), donde todos los nodos tienen copias de todo.
- **Particionamiento Automático:** Cassandra gestiona de forma autónoma a qué nodo va cada registro. La API se conecta al cluster y envía consultas de manera agnóstica; el protocolo localiza la partición de forma transparente al programador.
- **Escalabilidad Horizontal Pura:** Para agregar almacenamiento, basta con adherir una PC 3 al anillo de Tailscale y configurar su docker-compose. Cassandra redistribuirá los rangos de tokens de forma balanceada e inmediata.

---

## 11. Guía Rápida de Preparación (Demo de 10 Minutos)

1. Conecta ambas PCs a **Tailscale** y copia sus IPs correspondientes.
2. Clona el repositorio en ambas máquinas.
3. Asegúrate de configurar los docker-compose con las IPs reales (como se ilustra en los puntos 4 y 5).
4. Levanta el compose principal en PC 1, espera a que el healthcheck de Cassandra esté en verde.
5. Levanta el compose secundario en PC 2.
6. Abre el **Dashboard** (`http://localhost:3000`) en la PC Principal.
7. Ve a la pestaña **"Ingesta ETL"**. Carga secuencialmente los archivos CSV de la carpeta `/Backend/datos` para pre-poblar el clúster con los 300,000 registros en vivo.
8. Realiza consultas en vivo y finaliza demostrando la caída parcial del clúster con `docker stop cassandra-node2`.