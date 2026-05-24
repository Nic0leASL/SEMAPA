import os
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from cassandra.concurrent import execute_concurrent_with_args
from app.cassandra.connection import CassandraConnection

logger = logging.getLogger("ETLService")

class ETLService:
    @staticmethod
    def get_session():
        return CassandraConnection.get_session()

    @classmethod
    def insert_chunks(cls, session, prepared_stmt, params, chunk_size=10000, concurrency=150):
        """Helper to insert records in chunks using concurrency to prevent overloading Cassandra."""
        total = len(params)
        logger.info(f"Inserting {total} records in chunks of {chunk_size}...")
        for i in range(0, total, chunk_size):
            chunk = params[i:i+chunk_size]
            try:
                execute_concurrent_with_args(session, prepared_stmt, chunk, concurrency=concurrency)
            except Exception as e:
                logger.error(f"Error executing concurrent insert chunk starting at {i}: {e}")

    @classmethod
    def load_tarifas_default(cls):
        """Pre-populates default tariffs if the table is empty."""
        session = cls.get_session()
        # Check if empty
        rows = list(session.execute("SELECT COUNT(*) FROM tarifas"))
        if rows and rows[0].count > 0:
            logger.info("Tarifas table already populated.")
            return

        default_tariffs = {
            "Residencial-R1": 2.00,
            "Residencial-R2": 2.50,
            "Residencial-R3": 3.50,
            "Residencial-R4": 5.00,
            "Comercial-C": 8.00,
            "Comercial-CE": 9.50,
            "Industrial-I": 12.00,
            "Preferencial-P": 3.00,
            "Social-S": 1.50,
            # Fallbacks in case subcategory only or category only is parsed
            "R1": 2.00, "R2": 2.50, "R3": 3.50, "R4": 5.00,
            "C": 8.00, "CE": 9.50, "I": 12.00, "P": 3.00, "S": 1.50,
            "Residencial": 2.50, "Comercial": 8.00, "Industrial": 12.00,
            "Preferencial": 3.00, "Social": 1.50
        }
        
        logger.info("Seeding default tariffs...")
        stmt = session.prepare("INSERT INTO tarifas (categoria, precio_m3) VALUES (?, ?)")
        params = [(k, float(v)) for k, v in default_tariffs.items()]
        cls.insert_chunks(session, stmt, params, chunk_size=100, concurrency=10)

    @classmethod
    def import_distritos(cls, filepath: str):
        session = cls.get_session()
        logger.info(f"Importing Distritos from {filepath}")
        
        # skiprows=1 because the first row is metadata total percentages
        df = pd.read_csv(filepath, skiprows=1, encoding='latin1')
        
        # Clean column names
        df.columns = [
            'sub_alcaldia', 'distrito', 'sub_distrito', 'zona', 'gateway', 
            'altitude', 'codigo', 'habitantes', 'r1', 'r2', 'r3', 'r4', 
            'c', 'ce', 'i', 'p', 's', 'total'
        ]
        
        # Excel ffill for merged cells
        df['sub_alcaldia'] = df['sub_alcaldia'].ffill()
        df['distrito'] = df['distrito'].ffill()
        df['habitantes'] = df['habitantes'].ffill()
        
        # Drop the final totals row if it exists
        df = df[df['sub_distrito'].notna() & df['zona'].notna()]
        
        # Cast types
        df['distrito'] = df['distrito'].astype(int)
        df['sub_distrito'] = df['sub_distrito'].astype(int)
        df['habitantes'] = df['habitantes'].astype(int)
        df['codigo'] = df['codigo'].fillna(0).astype(int)
        df['altitude'] = df['altitude'].fillna(0.0).astype(float)
        
        for cat in ['r1', 'r2', 'r3', 'r4', 'c', 'ce', 'i', 'p', 's', 'total']:
            df[cat] = df[cat].fillna(0).astype(int)
            
        df['zona'] = df['zona'].str.strip()
        df['sub_alcaldia'] = df['sub_alcaldia'].str.strip()
        df['gateway'] = df['gateway'].fillna("Desconocido").str.strip()

        # Insert into distritos table
        stmt = session.prepare("""
            INSERT INTO distritos (
                distrito, sub_distrito, zona, sub_alcaldia, gateway, altitude, codigo, habitantes,
                r1, r2, r3, r4, c, ce, i, p, s, total
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        params = []
        for _, row in df.iterrows():
            params.append((
                int(row['distrito']), int(row['sub_distrito']), str(row['zona']),
                str(row['sub_alcaldia']), str(row['gateway']), float(row['altitude']),
                int(row['codigo']), int(row['habitantes']),
                int(row['r1']), int(row['r2']), int(row['r3']), int(row['r4']),
                int(row['c']), int(row['ce']), int(row['i']), int(row['p']),
                int(row['s']), int(row['total'])
            ))
            
        cls.insert_chunks(session, stmt, params, chunk_size=200, concurrency=50)
        return len(df)

    @classmethod
    def import_contratos(cls, filepath: str):
        session = cls.get_session()
        logger.info(f"Importing Contratos from {filepath}")
        df = pd.read_csv(filepath, encoding='latin1')
        
        # Clean fields
        df['numero_contrato'] = df['numero_contrato'].str.strip()
        df['numero_catastro'] = df['numero_catastro'].str.strip()
        df['titular_contrato'] = df['titular_contrato'].str.strip()
        df['ci_titular'] = df['ci_titular'].str.strip()
        df['categoria'] = df['categoria'].str.strip()
        df['subcategoria'] = df['subcategoria'].fillna("").str.strip()
        df['medidor_iot'] = df['medidor_iot'].str.strip()
        df['fecha_contrato'] = df['fecha_contrato'].str.strip()
        df['estado_contrato'] = df['estado_contrato'].str.strip()
        df['diametro_conexion'] = df['diametro_conexion'].str.strip()
        df['tipo_servicio'] = df['tipo_servicio'].str.strip()

        # Prep inserts
        stmt_contratos = session.prepare("""
            INSERT INTO contratos (
                numero_contrato, numero_catastro, titular_contrato, ci_titular, categoria,
                subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        stmt_by_ci = session.prepare("""
            INSERT INTO contratos_by_ci (
                ci_titular, numero_contrato, numero_catastro, titular_contrato, categoria,
                subcategoria, medidor_iot, fecha_contrato, estado_contrato, diametro_conexion, tipo_servicio
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        params_contratos = []
        params_by_ci = []
        
        for _, row in df.iterrows():
            tpl = (
                str(row['numero_contrato']), str(row['numero_catastro']), str(row['titular_contrato']),
                str(row['ci_titular']), str(row['categoria']), str(row['subcategoria']),
                str(row['medidor_iot']), str(row['fecha_contrato']), str(row['estado_contrato']),
                str(row['diametro_conexion']), str(row['tipo_servicio'])
            )
            params_contratos.append(tpl)
            
            # For ci lookup: (ci_titular, numero_contrato, ...)
            tpl_by_ci = (
                str(row['ci_titular']), str(row['numero_contrato']), str(row['numero_catastro']),
                str(row['titular_contrato']), str(row['categoria']), str(row['subcategoria']),
                str(row['medidor_iot']), str(row['fecha_contrato']), str(row['estado_contrato']),
                str(row['diametro_conexion']), str(row['tipo_servicio'])
            )
            params_by_ci.append(tpl_by_ci)

        logger.info("Writing to 'contratos'...")
        cls.insert_chunks(session, stmt_contratos, params_contratos, chunk_size=5000, concurrency=100)
        
        logger.info("Writing to 'contratos_by_ci'...")
        cls.insert_chunks(session, stmt_by_ci, params_by_ci, chunk_size=5000, concurrency=100)
        
        return len(df)

    @classmethod
    def import_infraestructura(cls, filepath: str):
        session = cls.get_session()
        logger.info(f"Importing Infraestructura from {filepath}")
        df = pd.read_csv(filepath, encoding='latin1')
        
        # Clean fields
        df['numero_catastro'] = df['numero_catastro'].str.strip()
        df['propietario'] = df['propietario'].str.strip()
        df['ci'] = df['ci'].str.strip()
        df['direccion'] = df['direccion'].str.strip()
        df['zona'] = df['zona'].str.strip()
        df['uso_suelo'] = df['uso_suelo'].str.strip()
        df['matricula_ddrr'] = df['matricula_ddrr'].fillna("").str.strip()
        
        df['distrito'] = df['distrito'].fillna(0).astype(int)
        df['manzano'] = df['manzano'].fillna(0).astype(int)
        df['lote'] = df['lote'].fillna(0).astype(int)
        df['superficie_terreno'] = df['superficie_terreno'].fillna(0).astype(int)
        df['area_construida'] = df['area_construida'].fillna(0).astype(int)
        df['valor_catastral'] = df['valor_catastral'].fillna(0).astype(int)
        df['impuesto_anual'] = df['impuesto_anual'].fillna(0.0).astype(float)
        df['latitud'] = df['latitud'].fillna(0.0).astype(float)
        df['longitud'] = df['longitud'].fillna(0.0).astype(float)

        stmt = session.prepare("""
            INSERT INTO infraestructuras (
                numero_catastro, propietario, ci, direccion, zona, distrito, manzano, lote,
                superficie_terreno, area_construida, uso_suelo, matricula_ddrr, valor_catastral,
                impuesto_anual, latitud, longitud
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)

        params = []
        for _, row in df.iterrows():
            params.append((
                str(row['numero_catastro']), str(row['propietario']), str(row['ci']), str(row['direccion']),
                str(row['zona']), int(row['distrito']), int(row['manzano']), int(row['lote']),
                int(row['superficie_terreno']), int(row['area_construida']), str(row['uso_suelo']),
                str(row['matricula_ddrr']), int(row['valor_catastral']), float(row['impuesto_anual']),
                float(row['latitud']), float(row['longitud'])
            ))

        cls.insert_chunks(session, stmt, params, chunk_size=5000, concurrency=100)
        return len(df)

    @classmethod
    def import_medidores(cls, filepath: str):
        session = cls.get_session()
        logger.info(f"Importing Medidores from {filepath}")
        df_med = pd.read_csv(filepath, encoding='latin1')
        
        # Clean fields
        df_med['medidor_iot'] = df_med['medidor_iot'].str.strip()
        df_med['fecha_instalacion'] = df_med['fecha_instalacion'].str.strip()
        df_med['fecha_desinstalacion'] = df_med['fecha_desinstalacion'].astype(str).replace('nan', None)
        df_med['estado'] = df_med['estado'].str.strip()
        df_med['tipo_medidor_id'] = df_med['tipo_medidor_id'].fillna(0).astype(int)

        # 1. Write to main medidores table
        stmt_med = session.prepare("""
            INSERT INTO medidores (
                medidor_iot, fecha_instalacion, fecha_desinstalacion, estado, tipo_medidor_id
            ) VALUES (?, ?, ?, ?, ?)
        """)
        
        params_med = []
        for _, row in df_med.iterrows():
            params_med.append((
                str(row['medidor_iot']), str(row['fecha_instalacion']), 
                row['fecha_desinstalacion'], str(row['estado']), int(row['tipo_medidor_id'])
            ))
            
        logger.info("Writing to 'medidores'...")
        cls.insert_chunks(session, stmt_med, params_med, chunk_size=5000, concurrency=100)

        # 2. Write to medidores_by_distrito
        # To do this in bulk, we load current contratos and infraestructuras from Cassandra to join in memory
        logger.info("Loading contracts and infrastructure mappings to build 'medidores_by_distrito'...")
        try:
            contracts_rows = list(session.execute("SELECT medidor_iot, numero_contrato, numero_catastro FROM contratos"))
            infra_rows = list(session.execute("SELECT numero_catastro, zona, distrito, latitud, longitud FROM infraestructuras"))
            
            if contracts_rows and infra_rows:
                df_c = pd.DataFrame(contracts_rows)
                df_i = pd.DataFrame(infra_rows)
                
                # Merge
                df_map = pd.merge(df_c, df_i, on='numero_catastro', how='inner')
                df_joined = pd.merge(df_med, df_map, on='medidor_iot', how='inner')
                
                logger.info(f"Joined {len(df_joined)} medidores with district locations.")
                
                stmt_dist = session.prepare("""
                    INSERT INTO medidores_by_distrito (
                        distrito, medidor_iot, zona, numero_contrato, numero_catastro,
                        latitud, longitud, estado, tipo_medidor_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """)
                
                params_dist = []
                for _, row in df_joined.iterrows():
                    params_dist.append((
                        int(row['distrito']), str(row['medidor_iot']), str(row['zona']),
                        str(row['numero_contrato']), str(row['numero_catastro']),
                        float(row['latitud']), float(row['longitud']), str(row['estado']),
                        int(row['tipo_medidor_id'])
                    ))
                
                logger.info("Writing to 'medidores_by_distrito'...")
                cls.insert_chunks(session, stmt_dist, params_dist, chunk_size=5000, concurrency=100)
            else:
                logger.warning("Contracts or Infrastructure tables are empty. Skipping 'medidores_by_distrito' generation.")
        except Exception as join_err:
            logger.error(f"Failed to generate 'medidores_by_distrito': {join_err}")

        # Compute pre-aggregated reporting for states
        logger.info("Pre-aggregating medidores states report...")
        try:
            counts = df_med['estado'].value_counts()
            total_danados = int(counts.get('Dañado', 0))
            total_mantenimiento = int(counts.get('Mantenimiento', 0))
            
            # Anomalias check is done during reading imports, we will set that separately.
            stmt_report = session.prepare("""
                INSERT INTO reporte_errores (key, total_danados, total_mantenimiento)
                VALUES ('summary', ?, ?)
            """)
            session.execute(stmt_report, (total_danados, total_mantenimiento))
        except Exception as r_err:
            logger.error(f"Error computing reporting for medidores: {r_err}")

        return len(df_med)

    @classmethod
    def import_lecturas(cls, filepath: str):
        session = cls.get_session()
        logger.info(f"Importing Lecturas from {filepath}")
        
        # Load data
        df = pd.read_csv(filepath, encoding='latin1')
        
        # Clean numeric fields and fill NaNs with 0 to prevent type conversion errors
        df['lecturaAnterior'] = pd.to_numeric(df['lecturaAnterior'], errors='coerce').fillna(0).astype(int)
        df['LecturaActual'] = pd.to_numeric(df['LecturaActual'], errors='coerce').fillna(0).astype(int)
        df['radiobase'] = pd.to_numeric(df['radiobase'], errors='coerce').fillna(0).astype(int)
        
        # 1. Parse dates and sort
        logger.info("Parsing dates and sorting for deduplication...")
        df['parsed_date'] = pd.to_datetime(df['fechaHoraLectura'], format='%m/%d/%y %H:%M')
        df = df.sort_values(by='parsed_date')
        
        # Extract date string for grouping: 'YYYY-MM-DD'
        df['date_only'] = df['parsed_date'].dt.date
        
        # 2. Identify duplicates based on (medidor_iot, date_only)
        # Keep first, others are duplicates
        is_duplicate = df.duplicated(subset=['medidor_iot', 'date_only'], keep='first')
        
        df_valid = df[~is_duplicate].copy()
        df_dups = df[is_duplicate].copy()
        
        logger.info(f"Deduplication complete. Valid rows: {len(df_valid)}, Duplicates: {len(df_dups)}")

        # 3. Log duplicates to Cassandra
        if len(df_dups) > 0:
            logger.info("Logging duplicates to 'lecturas_duplicadas_log'...")
            stmt_dup = session.prepare("""
                INSERT INTO lecturas_duplicadas_log (
                    medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo
                ) VALUES (?, ?, ?, ?, ?, 'Duplicado - Múltiples señales en el mismo día')
            """)
            # Sample duplicate insertions or take a limit if too large, but concurrent chunks can handle all.
            # We convert datetime to timestamp (miliseconds)
            dup_params = []
            for _, row in df_dups.iterrows():
                dup_params.append((
                    str(row['medidor_iot']), row['parsed_date'],
                    int(row['lecturaAnterior']), int(row['LecturaActual']),
                    int(row['radiobase'])
                ))
            cls.insert_chunks(session, stmt_dup, dup_params, chunk_size=5000, concurrency=100)

        # 4. Process Valid Readings: detect negative anomalies (rollover/error)
        is_negative = df_valid['LecturaActual'] < df_valid['lecturaAnterior']
        df_anomalies = df_valid[is_negative].copy()
        df_clean = df_valid[~is_negative].copy()
        
        logger.info(f"Anomalies filtered. Clean readings: {len(df_clean)}, Negative consumption anomalies: {len(df_anomalies)}")

        # Load lookup tables from database for enrichment
        logger.info("Loading contracts and infrastructure data for denormalization...")
        contracts = list(session.execute("SELECT medidor_iot, numero_contrato, categoria, subcategoria, titular_contrato FROM contratos"))
        infras = list(session.execute("SELECT numero_catastro, zona, distrito FROM infraestructuras"))
        distritos_meta = list(session.execute("SELECT distrito, habitantes FROM distritos"))
        
        df_contracts = pd.DataFrame(contracts) if contracts else pd.DataFrame(columns=['medidor_iot', 'numero_contrato', 'categoria', 'subcategoria', 'titular_contrato'])
        df_infras = pd.DataFrame(infras) if infras else pd.DataFrame(columns=['numero_catastro', 'zona', 'distrito'])
        df_dist_meta = pd.DataFrame(distritos_meta).drop_duplicates(subset=['distrito']) if distritos_meta else pd.DataFrame(columns=['distrito', 'habitantes'])
        
        # Load tarifas
        tarifas_rows = list(session.execute("SELECT categoria, precio_m3 FROM tarifas"))
        tarifas_dict = {r.categoria: r.precio_m3 for r in tarifas_rows} if tarifas_rows else {}
        
        # Log negative anomalies to errores_iot
        if len(df_anomalies) > 0:
            logger.info("Logging anomalies to 'errores_iot'...")
            stmt_err = session.prepare("""
                INSERT INTO errores_iot (
                    medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase
                ) VALUES (?, ?, 0, 'LECTURA_NEGATIVA', ?, ?)
            """)
            err_params = []
            for _, row in df_anomalies.iterrows():
                desc = f"Lectura actual ({row['LecturaActual']}) menor a anterior ({row['lecturaAnterior']})"
                err_params.append((
                    str(row['medidor_iot']), row['parsed_date'], desc, int(row['radiobase'])
                ))
            cls.insert_chunks(session, stmt_err, err_params, chunk_size=2000, concurrency=50)

        # Build clean readings enrichments: join with Contracts & Infrastructure to get (zona, distrito, numero_contrato, categoria)
        df_merged = pd.merge(df_clean, df_contracts, on='medidor_iot', how='left')
        
        # Get numero_catastro from contracts to join infra
        contratos_catastro = list(session.execute("SELECT numero_contrato, numero_catastro FROM contratos"))
        df_cc = pd.DataFrame(contratos_catastro) if contratos_catastro else pd.DataFrame(columns=['numero_contrato', 'numero_catastro'])
        
        df_merged = pd.merge(df_merged, df_cc, on='numero_contrato', how='left')
        df_merged = pd.merge(df_merged, df_infras, on='numero_catastro', how='left')
        
        # Clean up missing classifications
        df_merged['zona'] = df_merged['zona'].fillna("Desconocido")
        df_merged['distrito'] = df_merged['distrito'].fillna(0).astype(int)
        df_merged['categoria'] = df_merged['categoria'].fillna("Residencial")
        df_merged['subcategoria'] = df_merged['subcategoria'].fillna("R1")
        df_merged['numero_contrato'] = df_merged['numero_contrato'].fillna("Sin Contrato")

        # 5. Compute consumption, look up tariffs, and compute amount
        logger.info("Computing consumption and tariff values...")
        df_merged['consumo'] = df_merged['LecturaActual'] - df_merged['lecturaAnterior']
        
        # Tariff lookup function
        def get_price(row):
            # Try subcategory first (e.g. R1, R2), then category (e.g. Residencial)
            sub = row['subcategoria']
            cat = row['categoria']
            if sub in tarifas_dict:
                return tarifas_dict[sub]
            # Try Category-Subcategory combined
            combined = f"{cat}-{sub}"
            if combined in tarifas_dict:
                return tarifas_dict[combined]
            if cat in tarifas_dict:
                return tarifas_dict[cat]
            return 2.50 # Default fallback price per m3

        df_merged['precio_m3'] = df_merged.apply(get_price, axis=1)
        df_merged['monto_facturado'] = df_merged['consumo'] * df_merged['precio_m3']
        
        # Payment details
        df_merged['pagado'] = df_merged['fecha_pago'].notna()
        df_merged['parsed_fecha_pago'] = pd.to_datetime(df_merged['fecha_pago'], format='%m/%d/%y %H:%M', errors='coerce')
        # Replace NaT with None
        df_merged['parsed_fecha_pago'] = df_merged['parsed_fecha_pago'].where(df_merged['parsed_fecha_pago'].notnull(), None)

        # 6. Insert into denormalized Cassandra tables:
        # a. lecturas_by_medidor:
        stmt_med = session.prepare("""
            INSERT INTO lecturas_by_medidor (
                medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase,
                fecha_pago, consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        params_med = []
        for _, row in df_merged.iterrows():
            params_med.append((
                str(row['medidor_iot']), row['parsed_date'], int(row['lecturaAnterior']),
                int(row['LecturaActual']), int(row['radiobase']), row['parsed_fecha_pago'],
                int(row['consumo']), float(row['monto_facturado']), bool(row['pagado'])
            ))
            
        logger.info("Writing to 'lecturas_by_medidor'...")
        cls.insert_chunks(session, stmt_med, params_med, chunk_size=5000, concurrency=100)

        # b. lecturas_by_zona:
        stmt_zona = session.prepare("""
            INSERT INTO lecturas_by_zona (
                zona, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual,
                consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        params_zona = []
        for _, row in df_merged.iterrows():
            params_zona.append((
                str(row['zona']), row['parsed_date'], str(row['medidor_iot']),
                int(row['lecturaAnterior']), int(row['LecturaActual']),
                int(row['consumo']), float(row['monto_facturado']), bool(row['pagado'])
            ))
            
        logger.info("Writing to 'lecturas_by_zona'...")
        cls.insert_chunks(session, stmt_zona, params_zona, chunk_size=5000, concurrency=100)

        # c. lecturas_by_distrito:
        stmt_dist = session.prepare("""
            INSERT INTO lecturas_by_distrito (
                distrito, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual,
                consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """)
        
        params_dist = []
        for _, row in df_merged.iterrows():
            params_dist.append((
                int(row['distrito']), row['parsed_date'], str(row['medidor_iot']),
                int(row['lecturaAnterior']), int(row['LecturaActual']),
                int(row['consumo']), float(row['monto_facturado']), bool(row['pagado'])
            ))
            
        logger.info("Writing to 'lecturas_by_distrito'...")
        cls.insert_chunks(session, stmt_dist, params_dist, chunk_size=5000, concurrency=100)

        # d. lecturas_unpaid_by_contrato (only unpaid):
        df_unpaid = df_merged[~df_merged['pagado']].copy()
        if len(df_unpaid) > 0:
            stmt_unpaid = session.prepare("""
                INSERT INTO lecturas_unpaid_by_contrato (
                    numero_contrato, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual,
                    consumo, monto_facturado
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """)
            params_unpaid = []
            for _, row in df_unpaid.iterrows():
                params_unpaid.append((
                    str(row['numero_contrato']), row['parsed_date'], str(row['medidor_iot']),
                    int(row['lecturaAnterior']), int(row['LecturaActual']),
                    int(row['consumo']), float(row['monto_facturado'])
                ))
            logger.info("Writing to 'lecturas_unpaid_by_contrato'...")
            cls.insert_chunks(session, stmt_unpaid, params_unpaid, chunk_size=5000, concurrency=100)

        # 7. Compute pre-aggregated dashboards stats and write report tables
        logger.info("Generating pre-aggregated report summaries...")
        
        # a. Consumo por zona
        agg_zona = df_merged.groupby('zona').agg(
            consumo_total=('consumo', 'sum'),
            facturacion_total=('monto_facturado', 'sum'),
            lecturas_count=('medidor_iot', 'count')
        ).reset_index()
        
        stmt_rep_zona = session.prepare("""
            INSERT INTO reporte_consumo_zona (zona, consumo_total, facturacion_total, lecturas_count)
            VALUES (?, ?, ?, ?)
        """)
        for _, row in agg_zona.iterrows():
            session.execute(stmt_rep_zona, (
                str(row['zona']), float(row['consumo_total']),
                float(row['facturacion_total']), int(row['lecturas_count'])
            ))

        # b. Consumo por distrito (enrich with subalcaldia & habitantes)
        # Fetch distritos names to align distrito -> subalcaldia
        dist_meta_list = list(session.execute("SELECT distrito, sub_alcaldia FROM distritos"))
        df_dist_meta_names = pd.DataFrame(dist_meta_list).drop_duplicates(subset=['distrito']) if dist_meta_list else pd.DataFrame(columns=['distrito', 'sub_alcaldia'])
        
        agg_dist = df_merged.groupby('distrito').agg(
            consumo_total=('consumo', 'sum'),
            facturacion_total=('monto_facturado', 'sum'),
            lecturas_count=('medidor_iot', 'count')
        ).reset_index()
        
        agg_dist = pd.merge(agg_dist, df_dist_meta_names, on='distrito', how='left')
        agg_dist = pd.merge(agg_dist, df_dist_meta, on='distrito', how='left')
        agg_dist['sub_alcaldia'] = agg_dist['sub_alcaldia'].fillna("Desconocido")
        agg_dist['habitantes'] = agg_dist['habitantes'].fillna(1000).astype(int) # Fallback if distritos not loaded
        agg_dist['per_capita'] = agg_dist['consumo_total'] / agg_dist['habitantes']
        
        stmt_rep_dist = session.prepare("""
            INSERT INTO reporte_consumo_distrito (distrito, sub_alcaldia, consumo_total, facturacion_total, lecturas_count, habitantes, per_capita)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """)
        for _, row in agg_dist.iterrows():
            session.execute(stmt_rep_dist, (
                int(row['distrito']), str(row['sub_alcaldia']), float(row['consumo_total']),
                float(row['facturacion_total']), int(row['lecturas_count']), int(row['habitantes']),
                float(row['per_capita'])
            ))

        # c. Financiero
        total_recaudado = df_merged[df_merged['pagado']]['monto_facturado'].sum()
        total_deuda = df_merged[~df_merged['pagado']]['monto_facturado'].sum()
        clientes_morosos = df_merged[~df_merged['pagado']]['numero_contrato'].nunique()
        
        stmt_rep_fin = session.prepare("""
            INSERT INTO reporte_financiero (key, ingresos_recaudados, deuda_total, total_clientes_morosos)
            VALUES ('global', ?, ?, ?)
        """)
        session.execute(stmt_rep_fin, (float(total_recaudado), float(total_deuda), int(clientes_morosos)))

        # d. Reporte de Errores anomalies increment
        try:
            total_anomalias = len(df_anomalies)
            # Update reporte_errores
            session.execute("""
                UPDATE reporte_errores SET total_anomalias = ? WHERE key = 'summary'
            """, (total_anomalias,))
        except Exception as e_err:
            logger.error(f"Error updating reporte_errores with anomalies: {e_err}")

        logger.info("Ingestion and aggregation pipeline complete.")
        return len(df_clean)
