import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException
from app.cassandra.connection import CassandraConnection
from app.schemas.requests import MovilLecturaRequest, MovilGPSRequest, MovilObservacionRequest

logger = logging.getLogger("MobileRoute")
router = APIRouter(prefix="/movil", tags=["Mobile Devices"])

def get_session():
    return CassandraConnection.get_session()

@router.post("/lectura")
async def register_manual_lectura(req: MovilLecturaRequest):
    session = get_session()
    try:
        med_id = req.medidor_iot
        lec_act = req.lectura_actual
        lec_ant = req.lectura_anterior
        
        # 1. Fetch previous reading if not provided
        if lec_ant is None:
            prev_row = list(session.execute(f"SELECT lectura_actual FROM lecturas_by_medidor WHERE medidor_iot = '{med_id}' LIMIT 1"))
            lec_ant = prev_row[0].lectura_actual if prev_row else 0
            
        consumo = lec_act - lec_ant
        
        # 2. Check for negative consumption anomalies
        if consumo < 0:
            stmt_err = session.prepare("""
                INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion, radiobase)
                VALUES (?, ?, ?, 'LECTURA_NEGATIVA', ?, ?)
            """)
            session.execute(stmt_err, (
                med_id, req.fecha_hora_lectura, 1, 
                f"Manual reading anomaly: current ({lec_act}) < previous ({lec_ant})", req.radiobase
            ))
            # Also update reporte_errores count
            session.execute("UPDATE reporte_errores SET total_anomalias = total_anomalias + 1 WHERE key = 'summary' ALLOW FILTERING")
            raise HTTPException(status_code=400, detail="Lectura actual no puede ser menor a la lectura anterior.")

        # 3. Lookup contract category to compute billing
        # Since this is a single query, we use ALLOW FILTERING because we only have medidor_iot
        contract_row = list(session.execute(f"SELECT numero_contrato, categoria, subcategoria FROM contratos WHERE medidor_iot = '{med_id}' ALLOW FILTERING"))
        
        num_contrato = "Sin Contrato"
        cat = "Residencial"
        sub = "R1"
        if contract_row:
            num_contrato = contract_row[0].numero_contrato
            cat = contract_row[0].categoria
            sub = contract_row[0].subcategoria
            
        # Get price
        price_row = list(session.execute(f"SELECT precio_m3 FROM tarifas WHERE categoria = '{sub}'"))
        if not price_row:
            price_row = list(session.execute(f"SELECT precio_m3 FROM tarifas WHERE categoria = '{cat}'"))
        precio_m3 = price_row[0].precio_m3 if price_row else 2.50
        
        monto_facturado = consumo * precio_m3

        # 4. Insert reading across denormalized tables
        # a. lecturas_by_medidor
        stmt_med = session.prepare("""
            INSERT INTO lecturas_by_medidor (
                medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, false)
        """)
        session.execute(stmt_med, (med_id, req.fecha_hora_lectura, lec_ant, lec_act, req.radiobase, consumo, monto_facturado))

        # Lookup housing location for zone/district details
        zona = "Desconocido"
        distrito = 0
        if contract_row:
            # We can get catastro
            cat_row = list(session.execute(f"SELECT numero_catastro FROM contratos WHERE numero_contrato = '{num_contrato}'"))
            if cat_row:
                num_catastro = cat_row[0].numero_catastro
                infra_row = list(session.execute(f"SELECT zona, distrito FROM infraestructuras WHERE numero_catastro = '{num_catastro}'"))
                if infra_row:
                    zona = infra_row[0].zona
                    distrito = infra_row[0].distrito

        # b. lecturas_by_zona
        stmt_zona = session.prepare("""
            INSERT INTO lecturas_by_zona (
                zona, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, false)
        """)
        session.execute(stmt_zona, (zona, req.fecha_hora_lectura, med_id, lec_ant, lec_act, consumo, monto_facturado))

        # c. lecturas_by_distrito
        stmt_dist = session.prepare("""
            INSERT INTO lecturas_by_distrito (
                distrito, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado
            ) VALUES (?, ?, ?, ?, ?, ?, ?, false)
        """)
        session.execute(stmt_dist, (distrito, req.fecha_hora_lectura, med_id, lec_ant, lec_act, consumo, monto_facturado))

        # d. lecturas_unpaid_by_contrato
        stmt_unpaid = session.prepare("""
            INSERT INTO lecturas_unpaid_by_contrato (
                numero_contrato, fecha_hora_lectura, medidor_iot, lectura_anterior, lectura_actual, consumo, monto_facturado
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """)
        session.execute(stmt_unpaid, (num_contrato, req.fecha_hora_lectura, med_id, lec_ant, lec_act, consumo, monto_facturado))

        return {
            "status": "success",
            "message": "Manual reading uploaded and billed.",
            "details": {
                "medidor_iot": med_id,
                "numero_contrato": num_contrato,
                "consumo_m3": consumo,
                "monto_facturado_bs": round(monto_facturado, 2),
                "pagado": False
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering manual lectura: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/gps")
async def save_gps_coordinates(req: MovilGPSRequest):
    session = get_session()
    try:
        cat_id = req.numero_catastro
        
        # 1. Update coordinates in infraestructuras table
        stmt_infra = session.prepare("""
            UPDATE infraestructuras
            SET latitud = ?, longitud = ?
            WHERE numero_catastro = ?
        """)
        session.execute(stmt_infra, (req.latitud, req.longitud, cat_id))
        
        # 2. Check if we need to update medidores_by_distrito
        # Fetch distrito from infraestructuras first
        infra_row = list(session.execute(f"SELECT distrito FROM infraestructuras WHERE numero_catastro = '{cat_id}'"))
        if infra_row:
            dist = infra_row[0].distrito
            # Find medidores linked to this catastro via contracts
            contract_rows = list(session.execute(f"SELECT medidor_iot FROM contratos WHERE numero_catastro = '{cat_id}' ALLOW FILTERING"))
            for cr in contract_rows:
                med_id = cr.medidor_iot
                # Update in medidores_by_distrito
                stmt_med_dist = session.prepare("""
                    UPDATE medidores_by_distrito
                    SET latitud = ?, longitud = ?
                    WHERE distrito = ? AND medidor_iot = ?
                """)
                session.execute(stmt_med_dist, (req.latitud, req.longitud, dist, med_id))
                
        return {"status": "success", "message": f"GPS coordinates updated for property {cat_id}."}
    except Exception as e:
        logger.error(f"Error saving GPS coordinates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/observacion")
async def register_meter_observacion(req: MovilObservacionRequest):
    session = get_session()
    try:
        med_id = req.medidor_iot
        estado = req.estado
        
        # 1. Update medidores state in main table
        stmt_med = session.prepare("""
            UPDATE medidores
            SET estado = ?
            WHERE medidor_iot = ?
        """)
        session.execute(stmt_med, (estado, med_id))
        
        # 2. Log observation to errores_iot if status is not Operativo
        now = datetime.now()
        stmt_err = session.prepare("""
            INSERT INTO errores_iot (medidor_iot, fecha_hora_error, tipo_medidor_id, codigo_error, descripcion)
            VALUES (?, ?, 1, ?, ?)
        """)
        session.execute(stmt_err, (med_id, now, estado.upper(), req.observacion))

        # 3. Update medidores_by_distrito state
        # Find district
        contracts = list(session.execute(f"SELECT numero_contrato FROM contratos WHERE medidor_iot = '{med_id}' ALLOW FILTERING"))
        if contracts:
            num_contrato = contracts[0].numero_contrato
            cat_row = list(session.execute(f"SELECT numero_catastro FROM contratos WHERE numero_contrato = '{num_contrato}'"))
            if cat_row:
                cat_id = cat_row[0].numero_catastro
                infra_row = list(session.execute(f"SELECT distrito FROM infraestructuras WHERE numero_catastro = '{cat_id}'"))
                if infra_row:
                    dist = infra_row[0].distrito
                    session.execute(f"UPDATE medidores_by_distrito SET estado = '{estado}' WHERE distrito = {dist} AND medidor_iot = '{med_id}'")

        # 4. Trigger reporting updates
        # Recalculate totals in reporte_errores
        try:
            # Simple increment logic
            if estado.lower() == "dañado":
                session.execute("UPDATE reporte_errores SET total_danados = total_danados + 1 WHERE key = 'summary' ALLOW FILTERING")
            elif estado.lower() == "mantenimiento":
                session.execute("UPDATE reporte_errores SET total_mantenimiento = total_mantenimiento + 1 WHERE key = 'summary' ALLOW FILTERING")
        except Exception as rep_err:
            logger.warning(f"Failed to increment error report table counters: {rep_err}")

        return {"status": "success", "message": f"Meter {med_id} state updated to '{estado}'."}
    except Exception as e:
        logger.error(f"Error registering meter observation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
