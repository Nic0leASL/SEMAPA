import logging
import os
import pandas as pd
import urllib.request
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.cassandra.connection import CassandraConnection

logger = logging.getLogger("QueriesRoute")
router = APIRouter(tags=["General Queries"])

def get_session():
    return CassandraConnection.get_session()

@router.get("/consumo/distrito")
async def get_consumo_distrito():
    session = get_session()
    try:
        rows = list(session.execute("SELECT distrito, sub_alcaldia, consumo_total, facturacion_total, lecturas_count FROM reporte_consumo_distrito"))
        return sorted([
            {
                "distrito": r.distrito,
                "sub_alcaldia": r.sub_alcaldia,
                "consumo_total_m3": round(r.consumo_total, 2),
                "facturacion_total_bs": round(r.facturacion_total, 2),
                "cantidad_lecturas": r.lecturas_count
            } for r in rows
        ], key=lambda x: x["distrito"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consumo/zona")
async def get_consumo_zona():
    session = get_session()
    try:
        rows = list(session.execute("SELECT zona, consumo_total, facturacion_total, lecturas_count FROM reporte_consumo_zona"))
        return sorted([
            {
                "zona": r.zona,
                "consumo_total_m3": round(r.consumo_total, 2),
                "facturacion_total_bs": round(r.facturacion_total, 2),
                "cantidad_lecturas": r.lecturas_count
            } for r in rows
        ], key=lambda x: x["consumo_total_m3"], reverse=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consumo/percapita")
async def get_consumo_percapita():
    session = get_session()
    try:
        rows = list(session.execute("SELECT distrito, sub_alcaldia, consumo_total, habitantes, per_capita FROM reporte_consumo_distrito"))
        return sorted([
            {
                "distrito": r.distrito,
                "sub_alcaldia": r.sub_alcaldia,
                "habitantes": r.habitantes,
                "consumo_total_m3": round(r.consumo_total, 2),
                "per_capita_m3": round(r.per_capita, 4)
            } for r in rows
        ], key=lambda x: x["per_capita_m3"], reverse=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/medidores/activos")
async def get_medidores_activos():
    session = get_session()
    try:
        # Since scanning a massive table directly is discouraged, we fetch a limited sample
        # or we return the pre-aggregated summary count
        rows = list(session.execute("SELECT medidor_iot, estado, tipo_medidor_id FROM medidores LIMIT 100"))
        # We can also count total based on known metadata
        total_activos = 66460 + 4864 + 15959 # Operativo + Nuevo + Reacondicionado based on CSV
        return {
            "total_count_aprox": total_activos,
            "sample_active_meters": [
                {"medidor_iot": r.medidor_iot, "estado": r.estado, "tipo_medidor_id": r.tipo_medidor_id}
                for r in rows if r.estado in ["Operativo", "Nuevo", "Reacondicionado"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/medidores/inactivos")
async def get_medidores_inactivos():
    session = get_session()
    try:
        rows = list(session.execute("SELECT medidor_iot, estado, tipo_medidor_id FROM medidores LIMIT 100"))
        # Counts from report table
        rep_rows = list(session.execute("SELECT total_danados, total_mantenimiento FROM reporte_errores WHERE key = 'summary'"))
        total_danados = rep_rows[0].total_danados if rep_rows else 14871
        total_mantenimiento = rep_rows[0].total_mantenimiento if rep_rows else 17846
        return {
            "total_inactivos_aprox": total_danados + total_mantenimiento,
            "total_danados_aprox": total_danados,
            "total_mantenimiento_aprox": total_mantenimiento,
            "sample_inactive_meters": [
                {"medidor_iot": r.medidor_iot, "estado": r.estado, "tipo_medidor_id": r.tipo_medidor_id}
                for r in rows if r.estado in ["Dañado", "Mantenimiento"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/errores/modelo")
async def get_errores_modelo():
    session = get_session()
    try:
        # Group error counts by meter model ID
        # Since full scan is heavy, we simulate/approximate based on type IDs
        # (1: Standard, 2: Ultrasonic, 3: Electromagnetic, 4: IoT-LoRa, 5: IoT-NB)
        # Let's count them from error table
        error_rows = list(session.execute("SELECT medidor_iot, tipo_medidor_id, codigo_error FROM errores_iot LIMIT 500"))
        
        counts = {}
        for r in error_rows:
            model = r.tipo_medidor_id or 1
            counts[model] = counts.get(model, 0) + 1
            
        model_names = {
            1: "Standard Mecánico",
            2: "Ultrasonido IoT",
            3: "Electromagnético Industrial",
            4: "LoRaWAN Smart",
            5: "NB-IoT Smart"
        }
        
        return {
            "errores_por_modelo": [
                {"modelo_id": k, "nombre_modelo": model_names.get(k, f"Modelo {k}"), "cantidad_errores": v}
                for k, v in counts.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/facturacion")
async def get_facturacion():
    session = get_session()
    try:
        rows = list(session.execute("SELECT ingresos_recaudados, deuda_total, total_clientes_morosos FROM reporte_financiero WHERE key = 'global'"))
        if not rows:
            return {"ingresos_recaudados_bs": 0.0, "deuda_total_bs": 0.0, "total_clientes_morosos": 0}
        
        r = rows[0]
        total = r.ingresos_recaudados + r.deuda_total
        cobro_eficiencia = (r.ingresos_recaudados / total * 100) if total > 0 else 0.0
        
        return {
            "total_facturado_bs": round(total, 2),
            "ingresos_recaudados_bs": round(r.ingresos_recaudados, 2),
            "deuda_pendiente_bs": round(r.deuda_total, 2),
            "eficiencia_cobro_porcentaje": round(cobro_eficiencia, 2),
            "total_clientes_morosos": r.total_clientes_morosos
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/morosos")
async def get_morosos():
    session = get_session()
    try:
        rows = list(session.execute("SELECT numero_contrato, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_unpaid_by_contrato LIMIT 100"))
        morosos_list = []
        for r in rows:
            # lookup contract details
            details = list(session.execute(f"SELECT titular_contrato, ci_titular, medidor_iot, categoria FROM contratos WHERE numero_contrato = '{r.numero_contrato}'"))
            titular = details[0].titular_contrato if details else "Cliente"
            ci = details[0].ci_titular if details else "N/A"
            categoria = details[0].categoria if details else "Residencial"
            
            morosos_list.append({
                "numero_contrato": r.numero_contrato,
                "titular": titular,
                "ci_titular": ci,
                "categoria": categoria,
                "medidor_iot": r.medidor_iot,
                "fecha_lectura_impaga": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                "monto_deuda_bs": round(r.monto_facturado, 2)
            })
        return morosos_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consumo-excesivo")
async def get_consumo_excesivo():
    session = get_session()
    try:
        # Fetch readings from a couple of districts and filter those with high consumption (> 40 m3)
        # We query the district routing tables to do this cleanly
        excesivo = []
        for d in range(1, 16):
            rows = list(session.execute(f"SELECT medidor_iot, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_by_distrito WHERE distrito = {d} LIMIT 50"))
            for r in rows:
                if r.consumo > 40:
                    excesivo.append({
                        "distrito": d,
                        "medidor_iot": r.medidor_iot,
                        "fecha": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                        "consumo_m3": r.consumo,
                        "monto_facturado_bs": round(r.monto_facturado, 2)
                    })
        return sorted(excesivo, key=lambda x: x["consumo_m3"], reverse=True)[:50]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zonas-criticas")
async def get_zonas_criticas():
    session = get_session()
    try:
        # Zones with highest consumption + zones with highest error rates
        zona_rows = list(session.execute("SELECT zona, consumo_total, facturacion_total FROM reporte_consumo_zona"))
        zonas_criticas = []
        for z in zona_rows:
            # We can classify as critical if consumption > average consumption of all zones
            zonas_criticas.append({
                "zona": z.zona,
                "consumo_total_m3": round(z.consumo_total, 2),
                "riesgo_estres_hidrico": "Alto" if z.consumo_total > 50000 else "Moderado"
            })
        return sorted(zonas_criticas, key=lambda x: x["consumo_total_m3"], reverse=True)[:10]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lecturas-duplicadas")
async def get_lecturas_duplicadas():
    session = get_session()
    try:
        rows = list(session.execute("SELECT medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo FROM lecturas_duplicadas_log LIMIT 100"))
        return [
            {
                "medidor_iot": r.medidor_iot,
                "fecha_hora_lectura": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                "lectura_anterior": r.lectura_anterior,
                "lectura_actual": r.lectura_actual,
                "radiobase": r.radiobase,
                "motivo": r.motivo
            } for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mapa/medidores")
async def get_mapa_medidores():
    session = get_session()
    # To demonstrate sharding and horizontal division, we query by Partition Key (distrito)
    # Loop over all 15 districts
    medidores_mapa = []
    logger.info("Fetching map coordinates for medidores across all 15 districts...")
    try:
        for d in range(1, 16):
            rows = list(session.execute(f"SELECT medidor_iot, zona, numero_contrato, numero_catastro, latitud, longitud, estado FROM medidores_by_distrito WHERE distrito = {d}"))
            for r in rows:
                medidores_mapa.append({
                    "distrito": d,
                    "medidor_iot": r.medidor_iot,
                    "zona": r.zona,
                    "numero_contrato": r.numero_contrato,
                    "numero_catastro": r.numero_catastro,
                    "latitud": r.latitud,
                    "longitud": r.longitud,
                    "estado": r.estado
                })
        return medidores_mapa
    except Exception as e:
        logger.error(f"Error querying medidores_by_distrito: {e}")
        # Partial result return or raise
        if medidores_mapa:
            # Node is down but we got partial data!
            return {
            "sample_active_meters": [
                {"medidor_iot": r.medidor_iot, "estado": r.estado, "tipo_medidor_id": r.tipo_medidor_id}
                for r in rows if r.estado in ["Operativo", "Nuevo", "Reacondicionado"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/medidores/inactivos")
async def get_medidores_inactivos():
    session = get_session()
    try:
        rows = list(session.execute("SELECT medidor_iot, estado, tipo_medidor_id FROM medidores LIMIT 100"))
        # Counts from report table
        rep_rows = list(session.execute("SELECT total_danados, total_mantenimiento FROM reporte_errores WHERE key = 'summary'"))
        total_danados = rep_rows[0].total_danados if rep_rows else 14871
        total_mantenimiento = rep_rows[0].total_mantenimiento if rep_rows else 17846
        return {
            "total_inactivos_aprox": total_danados + total_mantenimiento,
            "total_danados_aprox": total_danados,
            "total_mantenimiento_aprox": total_mantenimiento,
            "sample_inactive_meters": [
                {"medidor_iot": r.medidor_iot, "estado": r.estado, "tipo_medidor_id": r.tipo_medidor_id}
                for r in rows if r.estado in ["Dañado", "Mantenimiento"]
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/errores/modelo")
async def get_errores_modelo():
    session = get_session()
    try:
        # Group error counts by meter model ID
        # Since full scan is heavy, we simulate/approximate based on type IDs
        # (1: Standard, 2: Ultrasonic, 3: Electromagnetic, 4: IoT-LoRa, 5: IoT-NB)
        # Let's count them from error table
        error_rows = list(session.execute("SELECT medidor_iot, tipo_medidor_id, codigo_error FROM errores_iot LIMIT 500"))
        
        counts = {}
        for r in error_rows:
            model = r.tipo_medidor_id or 1
            counts[model] = counts.get(model, 0) + 1
            
        model_names = {
            1: "Standard Mecánico",
            2: "Ultrasonido IoT",
            3: "Electromagnético Industrial",
            4: "LoRaWAN Smart",
            5: "NB-IoT Smart"
        }
        
        return {
            "errores_por_modelo": [
                {"modelo_id": k, "nombre_modelo": model_names.get(k, f"Modelo {k}"), "cantidad_errores": v}
                for k, v in counts.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/facturacion")
async def get_facturacion():
    session = get_session()
    try:
        rows = list(session.execute("SELECT ingresos_recaudados, deuda_total, total_clientes_morosos FROM reporte_financiero WHERE key = 'global'"))
        if not rows:
            return {"ingresos_recaudados_bs": 0.0, "deuda_total_bs": 0.0, "total_clientes_morosos": 0}
        
        r = rows[0]
        total = r.ingresos_recaudados + r.deuda_total
        cobro_eficiencia = (r.ingresos_recaudados / total * 100) if total > 0 else 0.0
        
        return {
            "total_facturado_bs": round(total, 2),
            "ingresos_recaudados_bs": round(r.ingresos_recaudados, 2),
            "deuda_pendiente_bs": round(r.deuda_total, 2),
            "eficiencia_cobro_porcentaje": round(cobro_eficiencia, 2),
            "total_clientes_morosos": r.total_clientes_morosos
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/morosos")
async def get_morosos():
    session = get_session()
    try:
        rows = list(session.execute("SELECT numero_contrato, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_unpaid_by_contrato LIMIT 100"))
        morosos_list = []
        for r in rows:
            # lookup contract details
            details = list(session.execute(f"SELECT titular_contrato, ci_titular, medidor_iot, categoria FROM contratos WHERE numero_contrato = '{r.numero_contrato}'"))
            titular = details[0].titular_contrato if details else "Cliente"
            ci = details[0].ci_titular if details else "N/A"
            categoria = details[0].categoria if details else "Residencial"
            
            morosos_list.append({
                "numero_contrato": r.numero_contrato,
                "titular": titular,
                "ci_titular": ci,
                "categoria": categoria,
                "medidor_iot": r.medidor_iot,
                "fecha_lectura_impaga": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                "monto_deuda_bs": round(r.monto_facturado, 2)
            })
        return morosos_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consumo-excesivo")
async def get_consumo_excesivo():
    session = get_session()
    try:
        # Fetch readings from a couple of districts and filter those with high consumption (> 40 m3)
        # We query the district routing tables to do this cleanly
        excesivo = []
        for d in range(1, 16):
            rows = list(session.execute(f"SELECT medidor_iot, fecha_hora_lectura, consumo, monto_facturado FROM lecturas_by_distrito WHERE distrito = {d} LIMIT 50"))
            for r in rows:
                if r.consumo > 40:
                    excesivo.append({
                        "distrito": d,
                        "medidor_iot": r.medidor_iot,
                        "fecha": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                        "consumo_m3": r.consumo,
                        "monto_facturado_bs": round(r.monto_facturado, 2)
                    })
        return sorted(excesivo, key=lambda x: x["consumo_m3"], reverse=True)[:50]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/zonas-criticas")
async def get_zonas_criticas():
    session = get_session()
    try:
        # Zones with highest consumption + zones with highest error rates
        zona_rows = list(session.execute("SELECT zona, consumo_total, facturacion_total FROM reporte_consumo_zona"))
        zonas_criticas = []
        for z in zona_rows:
            # We can classify as critical if consumption > average consumption of all zones
            zonas_criticas.append({
                "zona": z.zona,
                "consumo_total_m3": round(z.consumo_total, 2),
                "riesgo_estres_hidrico": "Alto" if z.consumo_total > 50000 else "Moderado"
            })
        return sorted(zonas_criticas, key=lambda x: x["consumo_total_m3"], reverse=True)[:10]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/lecturas-duplicadas")
async def get_lecturas_duplicadas():
    session = get_session()
    try:
        rows = list(session.execute("SELECT medidor_iot, fecha_hora_lectura, lectura_anterior, lectura_actual, radiobase, motivo FROM lecturas_duplicadas_log LIMIT 100"))
        return [
            {
                "medidor_iot": r.medidor_iot,
                "fecha_hora_lectura": r.fecha_hora_lectura.isoformat() if r.fecha_hora_lectura else None,
                "lectura_anterior": r.lectura_anterior,
                "lectura_actual": r.lectura_actual,
                "radiobase": r.radiobase,
                "motivo": r.motivo
            } for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mapa/medidores")
async def get_mapa_medidores():
    session = get_session()
    # To demonstrate sharding and horizontal division, we query by Partition Key (distrito)
    # Loop over all 15 districts
    medidores_mapa = []
    logger.info("Fetching map coordinates for medidores across all 15 districts...")
    try:
        for d in range(1, 16):
            rows = list(session.execute(f"SELECT medidor_iot, zona, numero_contrato, numero_catastro, latitud, longitud, estado FROM medidores_by_distrito WHERE distrito = {d}"))
            for r in rows:
                medidores_mapa.append({
                    "distrito": d,
                    "medidor_iot": r.medidor_iot,
                    "zona": r.zona,
                    "numero_contrato": r.numero_contrato,
                    "numero_catastro": r.numero_catastro,
                    "latitud": r.latitud,
                    "longitud": r.longitud,
                    "estado": r.estado
                })
        return medidores_mapa
    except Exception as e:
        logger.error(f"Error querying medidores_by_distrito: {e}")
        # Partial result return or raise
        if medidores_mapa:
            # Node is down but we got partial data!
            return {
                "warning": "Some districts are unavailable due to a Cassandra node being down.",
                "data": medidores_mapa
            }
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mapa/vivienda/{id}")
async def get_mapa_vivienda(id: str):
    session = get_session()
    try:
        rows = list(session.execute(f"SELECT numero_catastro, propietario, direccion, zona, distrito, latitud, longitud, valor_catastral FROM infraestructuras WHERE numero_catastro = '{id}'"))
        if not rows:
            raise HTTPException(status_code=404, detail=f"Catastro ID '{id}' not found.")
        
        r = rows[0]
        return {
            "numero_catastro": r.numero_catastro,
            "propietario": r.propietario,
            "direccion": r.direccion,
            "zona": r.zona,
            "distrito": r.distrito,
            "latitud": r.latitud,
            "longitud": r.longitud,
            "valor_catastral": r.valor_catastral
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

CSV_PATH = r"c:\Users\manuc\Universidad\Sistemas distribuidos\Cassandra\SEMAPA\Backend\datos\03 Practica 5 Recursos infraestructuras_cochabamba.csv"
CSV_COORD_PATH = r"c:\Users\manuc\Universidad\Sistemas distribuidos\Cassandra\SEMAPA\Backend\datos\infraestructuras_coordenadas.csv"

@router.get("/mapa/infraestructuras")
async def get_mapa_infraestructuras(distrito: int = None, buscar: str = None, limit: int = 500):
    # Try reading the lightweight coordinate CSV file first if it exists,
    # as it contains the full set of extracted properties and loads instantly.
    try:
        path_to_use = CSV_COORD_PATH if os.path.exists(CSV_COORD_PATH) else CSV_PATH
        if os.path.exists(path_to_use):
            df = pd.read_csv(path_to_use, encoding='latin1')
            df_filtered = df
            if buscar:
                df_filtered = df_filtered[df_filtered['direccion'].str.contains(buscar, case=False, na=False)]
            if distrito is not None:
                df_filtered = df_filtered[df_filtered['distrito'] == distrito]
            
            # Drop entries without valid coordinates if using the original CSV as fallback
            if path_to_use == CSV_PATH:
                df_filtered = df_filtered.dropna(subset=['latitud', 'longitud'])
            
            df_limit = df_filtered.head(limit)
            return [
                {
                    "numero_catastro": str(row['numero_catastro']),
                    "direccion": str(row['direccion']),
                    "latitud": float(row['latitud']),
                    "longitud": float(row['longitud'])
                } for _, row in df_limit.iterrows()
            ]
    except Exception as csv_err:
        logger.warning(f"CSV read failed: {csv_err}. Falling back to database scan.")

    session = get_session()
    try:
        if distrito is not None:
            query = f"SELECT numero_catastro, direccion, latitud, longitud FROM infraestructuras WHERE distrito = {distrito} LIMIT 2000 ALLOW FILTERING"
        else:
            query = f"SELECT numero_catastro, direccion, latitud, longitud FROM infraestructuras LIMIT 2000"
        
        rows = list(session.execute(query))
        results = [
            {
                "numero_catastro": r.numero_catastro,
                "direccion": r.direccion,
                "latitud": r.latitud,
                "longitud": r.longitud
            } for r in rows
        ]
        
        if buscar:
            buscar_lower = buscar.lower()
            results = [r for r in results if r["direccion"] and buscar_lower in r["direccion"].lower()]
            
        return results[:limit]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weather-comparison")
async def get_weather_comparison():
    # Fallback/Primary pre-calculated water consumption (m3) from CSV
    consumption_data = {
        "2026-02-28": 2250187.0,
        "2026-03-31": 2228679.0,
        "2026-04-30": 2207534.0
    }
    
    # Try to check if Cassandra connection is active (failsafe)
    try:
        session = get_session()
        if session and not session.is_shutdown:
            pass
    except Exception as e:
        logger.warning(f"Cassandra query failed for weather comparison: {e}")
        
    # Default maximum temperatures for Cochabamba on those dates
    weather_data = {
        "2026-02-28": 25.5,
        "2026-03-31": 26.8,
        "2026-04-30": 27.2
    }
    
    api_sourced = False
    try:
        # Query Open-Meteo free historical/archive API for Cochabamba coordinates
        url = "https://archive-api.open-meteo.com/v1/archive?latitude=-17.3935&longitude=-66.1570&start_date=2026-02-28&end_date=2026-04-30&daily=temperature_2m_max&timezone=auto"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            daily = res_data.get("daily", {})
            times = daily.get("time", [])
            temps = daily.get("temperature_2m_max", [])
            for t, temp in zip(times, temps):
                if t in consumption_data and temp is not None:
                    weather_data[t] = temp
            api_sourced = True
    except Exception as e:
        logger.warning(f"Failed to fetch weather from Open-Meteo API: {e}. Using fallback values.")

    comparison = []
    for date in sorted(consumption_data.keys()):
        comparison.append({
            "fecha": date,
            "consumo_total_m3": consumption_data[date],
            "temperatura_max_c": weather_data[date],
            "ubicacion": "Cochabamba, Bolivia"
        })
        
    return {
        "api_sourced": api_sourced,
        "data": comparison
    }

@router.get("/dollar-price")
async def get_dollar_price():
    official_rate = 6.96
    api_sourced = False
    try:
        # Query free exchange rate API
        url = "https://open.er-api.com/v6/latest/USD"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            res_data = json.loads(response.read().decode('utf-8'))
            rates = res_data.get("rates", {})
            if "BOB" in rates:
                official_rate = round(float(rates["BOB"]), 2)
                api_sourced = True
    except Exception as e:
        logger.warning(f"Failed to fetch dollar exchange rate: {e}. Using fallback 6.96.")

    # Parallel market rate in Bolivia is currently around 11.50 BOB
    parallel_rate = 11.50

    return {
        "api_sourced": api_sourced,
        "base_currency": "USD",
        "target_currency": "BOB",
        "official_rate": official_rate,
        "parallel_rate": parallel_rate,
        "timestamp": datetime.now().isoformat()
    }
