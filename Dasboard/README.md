# 💧 SEMAPA Dashboard - Sistema de Monitoreo Inteligente

Este proyecto es una plataforma interactiva de monitoreo y análisis de datos en tiempo real para SEMAPA. Está diseñado para ofrecer vistas personalizadas dependiendo del rol del usuario (Alcaldía, Gerencia, Clientes) y se apoya en una arquitectura de base de datos distribuida (Apache Cassandra) para el manejo masivo de medidores IoT y datos catastrales.

## 🌟 Características Principales

### 1. Vistas Basadas en Roles (RBAC)
El dashboard se adapta teóricamente a diferentes tipos de usuarios para mostrar solo la información relevante:
*   **🏢 Dashboard Alcaldía (Presidente):** 
    *   Enfoque 100% operativo y geográfico.
    *   Muestra el consumo global de la ciudad, estado de los medidores IoT (Operativos, Dañados, en Mantenimiento), y un top de las zonas con mayor consumo.
    *   **No** incluye métricas financieras (recaudación, deudas) por requerimiento específico.
*   **📊 Dashboard Gerencia (Administrador):** 
    *   Enfoque técnico y financiero.
    *   Muestra ingresos, deudas pendientes, pagos digitales, eficiencia de cobranza y alertas del sistema.
*   **👤 Dashboard Cliente (Usuario final):**
    *   Vista detallada del consumo histórico de una vivienda específica, monto facturado y estado de pagos.

### 2. Mapa Interactivo de Alta Resolución (`SemapaMap`)
El núcleo geográfico de la aplicación, construido sobre Leaflet, ofrece:
*   **Renderizado de Infraestructuras y Medidores IoT:** Muestra viviendas y medidores con colores indicativos de su estado.
*   **Sincronización de Base de Datos:** Los puntos geográficos son extraídos en tiempo real desde la base de datos (Cassandra).
*   **Popups Dinámicos:** Al hacer clic en un medidor, se consulta en vivo el contrato asociado, el nombre del titular, número de cuenta y el historial de consumo de los últimos 6 meses.
*   **Modo Mapa de Calor (Heatmap):** Permite visualizar la concentración de consumo por distrito y subalcaldías.
*   **Centrado Inteligente:** Al cambiar el filtro a "Distrito 2" o "Subalcaldía Tunari", la cámara del mapa viaja automáticamente hacia esa ubicación.

### 3. Buscador Global Inteligente
*   Permite buscar texto libre (ej. "Avenida América", "Juan Pérez", "CT-12345").
*   La consulta va al backend, busca coincidencias en `contratos`, `medidores` y direcciones de `infraestructuras`.
*   El mapa filtra visualmente apagando los puntos irrelevantes y resalta exactamente las viviendas o medidores que coinciden con la búsqueda.

### 4. Tolerancia a Fallos y Modo Híbrido (Mock / Real)
*   **Ping de Conexión:** El frontend verifica constantemente si el Backend y la base de datos Cassandra están vivos.
*   **Modo "Tiempo Real":** Si el backend responde, toda la data fluye desde Cassandra.
*   **Modo "Mock" (Simulación):** Si el backend se cae o un nodo de Cassandra deja de responder, el sistema cambia automáticamente a datos falsos pre-cargados (`mockData.js`) o muestra advertencias de datos parciales, garantizando que la aplicación web nunca colapse o muestre pantallas blancas.

## 🛠️ Stack Tecnológico

*   **Frontend:** React (Vite), JavaScript, Vanilla CSS (Glassmorphism design), React-Router-Dom.
*   **Mapas:** React-Leaflet (OpenStreetMap/CARTO).
*   **Backend:** Python (FastAPI).
*   **Base de Datos:** Apache Cassandra (Clúster Distribuido).

## 🚀 Cómo ejecutar el proyecto

1.  Asegúrate de que el backend (FastAPI) esté corriendo en el puerto `:8000`.
2.  Navega a la carpeta del dashboard: `cd Dashboard`
3.  Instala las dependencias (si es la primera vez): `npm install`
4.  Levanta el servidor de desarrollo: `npm run dev`
5.  Accede a `http://localhost:5173` en tu navegador.
