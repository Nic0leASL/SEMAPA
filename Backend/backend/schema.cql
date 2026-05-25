-- Create Keyspace with Replication Factor = 1 for Horizontal sharding (No full replication)
CREATE KEYSPACE IF NOT EXISTS semapa
WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1};

USE semapa;

-- 1. Contratos primary lookup table
CREATE TABLE IF NOT EXISTS contratos (
    numero_contrato text,
    numero_catastro text,
    titular_contrato text,
    ci_titular text,
    categoria text,
    subcategoria text,
    medidor_iot text,
    fecha_contrato text,
    estado_contrato text,
    diametro_conexion text,
    tipo_servicio text,
    PRIMARY KEY (numero_contrato)
);

-- 2. Contratos lookup by Citizen ID (CI)
CREATE TABLE IF NOT EXISTS contratos_by_ci (
    ci_titular text,
    numero_contrato text,
    numero_catastro text,
    titular_contrato text,
    categoria text,
    subcategoria text,
    medidor_iot text,
    fecha_contrato text,
    estado_contrato text,
    diametro_conexion text,
    tipo_servicio text,
    PRIMARY KEY (ci_titular, numero_contrato)
);

-- 3. Infraestructuras lookup by catastro
CREATE TABLE IF NOT EXISTS infraestructuras (
    numero_catastro text,
    propietario text,
    ci text,
    direccion text,
    zona text,
    distrito int,
    manzano int,
    lote int,
    superficie_terreno int,
    area_construida int,
    uso_suelo text,
    matricula_ddrr text,
    valor_catastral int,
    impuesto_anual double,
    latitud double,
    longitud double,
    PRIMARY KEY (numero_catastro)
);

-- 4. Medidores main table
CREATE TABLE IF NOT EXISTS medidores (
    medidor_iot text,
    fecha_instalacion text,
    fecha_desinstalacion text,
    estado text,
    tipo_medidor_id int,
    PRIMARY KEY (medidor_iot)
);

-- 5. Medidores by distrito for map views
CREATE TABLE IF NOT EXISTS medidores_by_distrito (
    distrito int,
    medidor_iot text,
    zona text,
    numero_contrato text,
    numero_catastro text,
    latitud double,
    longitud double,
    estado text,
    tipo_medidor_id int,
    PRIMARY KEY (distrito, medidor_iot)
);

-- 6. Lecturas by medidor (history)
CREATE TABLE IF NOT EXISTS lecturas_by_medidor (
    medidor_iot text,
    fecha_hora_lectura timestamp,
    lectura_anterior int,
    lectura_actual int,
    radiobase int,
    fecha_pago timestamp,
    consumo int,
    monto_facturado double,
    pagado boolean,
    PRIMARY KEY (medidor_iot, fecha_hora_lectura)
) WITH CLUSTERING ORDER BY (fecha_hora_lectura DESC);

-- 7. Lecturas by zona for Dashboard Presidente/Admin
CREATE TABLE IF NOT EXISTS lecturas_by_zona (
    zona text,
    fecha_hora_lectura timestamp,
    medidor_iot text,
    lectura_anterior int,
    lectura_actual int,
    consumo int,
    monto_facturado double,
    pagado boolean,
    PRIMARY KEY (zona, fecha_hora_lectura, medidor_iot)
) WITH CLUSTERING ORDER BY (fecha_hora_lectura DESC, medidor_iot ASC);

-- 8. Lecturas by distrito for Dashboard Presidente/Admin
CREATE TABLE IF NOT EXISTS lecturas_by_distrito (
    distrito int,
    fecha_hora_lectura timestamp,
    medidor_iot text,
    lectura_anterior int,
    lectura_actual int,
    consumo int,
    monto_facturado double,
    pagado boolean,
    PRIMARY KEY (distrito, fecha_hora_lectura, medidor_iot)
) WITH CLUSTERING ORDER BY (fecha_hora_lectura DESC, medidor_iot ASC);

-- 9. Unpaid bills lookup for Totem Deuda
CREATE TABLE IF NOT EXISTS lecturas_unpaid_by_contrato (
    numero_contrato text,
    fecha_hora_lectura timestamp,
    medidor_iot text,
    lectura_anterior int,
    lectura_actual int,
    consumo int,
    monto_facturado double,
    PRIMARY KEY (numero_contrato, fecha_hora_lectura)
) WITH CLUSTERING ORDER BY (fecha_hora_lectura DESC);

-- 10. Tarifas details table
CREATE TABLE IF NOT EXISTS tarifas (
    categoria text,
    precio_m3 double,
    PRIMARY KEY (categoria)
);

-- 11. Distritos lookup and demographic data
CREATE TABLE IF NOT EXISTS distritos (
    distrito int,
    sub_distrito int,
    zona text,
    sub_alcaldia text,
    gateway text,
    altitude double,
    codigo int,
    habitantes int,
    r1 int,
    r2 int,
    r3 int,
    r4 int,
    c int,
    ce int,
    i int,
    p int,
    s int,
    total int,
    PRIMARY KEY (distrito, sub_distrito, zona)
);

-- 12. IoT meter errors logs
CREATE TABLE IF NOT EXISTS errores_iot (
    medidor_iot text,
    fecha_hora_error timestamp,
    tipo_medidor_id int,
    codigo_error text,
    descripcion text,
    radiobase int,
    distrito int,
    zona text,
    PRIMARY KEY (medidor_iot, fecha_hora_error)
) WITH CLUSTERING ORDER BY (fecha_hora_error DESC);

-- 13. Deduplication duplicate signals logs
CREATE TABLE IF NOT EXISTS lecturas_duplicadas_log (
    medidor_iot text,
    fecha_hora_lectura timestamp,
    lectura_anterior int,
    lectura_actual int,
    radiobase int,
    motivo text,
    PRIMARY KEY (medidor_iot, fecha_hora_lectura)
) WITH CLUSTERING ORDER BY (fecha_hora_lectura DESC);

-- 14. Report aggregate tables populated during ETL run
CREATE TABLE IF NOT EXISTS reporte_consumo_zona (
    zona text,
    consumo_total double,
    facturacion_total double,
    lecturas_count bigint,
    PRIMARY KEY (zona)
);

CREATE TABLE IF NOT EXISTS reporte_consumo_distrito (
    distrito int,
    sub_alcaldia text,
    consumo_total double,
    facturacion_total double,
    lecturas_count bigint,
    habitantes int,
    per_capita double,
    PRIMARY KEY (distrito)
);

CREATE TABLE IF NOT EXISTS reporte_financiero (
    key text,
    ingresos_recaudados double,
    deuda_total double,
    total_clientes_morosos bigint,
    PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS reporte_errores (
    key text,
    total_danados bigint,
    total_mantenimiento bigint,
    total_anomalias bigint,
    PRIMARY KEY (key)
);
