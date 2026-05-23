import logging
from fastapi import APIRouter, HTTPException, Request
from app.cassandra.connection import CassandraConnection
from app.services.pdf_service import PdfService
from app.services.notification_service import NotificationService

logger = logging.getLogger("TotemRoute")
router = APIRouter(prefix="/totem", tags=["Citizen Totems"])

def get_session():
    return CassandraConnection.get_session()

@router.get("/deuda/{ci}")
async def get_deuda_by_ci(ci: str):
    session = get_session()
    try:
        # 1. Fetch contracts linked to this CI
        contracts_rows = list(session.execute(f"SELECT numero_contrato, titular_contrato, medidor_iot, categoria, subcategoria FROM contratos_by_ci WHERE ci_titular = '{ci}'"))
        if not contracts_rows:
            return {
                "ci_titular": ci,
                "has_debt": False,
                "total_debt_bs": 0.0,
                "contracts": []
            }
            
        contracts_list = []
        grand_total_debt = 0.0
        titular_name = contracts_rows[0].titular_contrato

        for c in contracts_rows:
            c_num = c.numero_contrato
            # 2. Sum unpaid bills for this contract
            unpaid_bills = list(session.execute(f"SELECT monto_facturado, fecha_hora_lectura FROM lecturas_unpaid_by_contrato WHERE numero_contrato = '{c_num}'"))
            
            c_debt = sum(b.monto_facturado for b in unpaid_bills)
            grand_total_debt += c_debt
            
            contracts_list.append({
                "numero_contrato": c_num,
                "medidor_iot": c.medidor_iot,
                "categoria": c.categoria,
                "subcategoria": c.subcategoria,
                "deuda_contrato_bs": round(c_debt, 2),
                "meses_impagos": len(unpaid_bills)
            })

        return {
            "ci_titular": ci,
            "titular_contrato": titular_name,
            "has_debt": grand_total_debt > 0,
            "total_debt_bs": round(grand_total_debt, 2),
            "contracts": contracts_list
        }
    except Exception as e:
        logger.error(f"Error checking debt by CI: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/consumo/{contrato}")
async def get_consumo_history(contrato: str):
    session = get_session()
    try:
        # 1. Get contract and meter
        c_row = list(session.execute(f"SELECT titular_contrato, medidor_iot, categoria, subcategoria FROM contratos WHERE numero_contrato = '{contrato}'"))
        if not c_row:
            raise HTTPException(status_code=404, detail=f"Contract '{contrato}' not found.")
            
        c = c_row[0]
        med_id = c.medidor_iot
        
        # 2. Fetch history of readings (last 12 months)
        history_rows = list(session.execute(f"SELECT fecha_hora_lectura, lectura_anterior, lectura_actual, consumo, monto_facturado, pagado FROM lecturas_by_medidor WHERE medidor_iot = '{med_id}' LIMIT 12"))
        
        history_list = []
        for h in history_rows:
            history_list.append({
                "fecha_hora_lectura": h.fecha_hora_lectura.isoformat() if h.fecha_hora_lectura else None,
                "lectura_anterior": h.lectura_anterior,
                "lectura_actual": h.lectura_actual,
                "consumo_m3": h.consumo,
                "monto_facturado_bs": round(h.monto_facturado, 2),
                "pagado": h.pagado
            })

        return {
            "numero_contrato": contrato,
            "titular_contrato": c.titular_contrato,
            "medidor_iot": med_id,
            "categoria": c.categoria,
            "subcategoria": c.subcategoria,
            "historial_consumos": history_list
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching consumption history: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/preaviso/{contrato}")
async def get_preaviso(contrato: str, request: Request):
    session = get_session()
    try:
        # 1. Fetch contract
        c_row = list(session.execute(f"SELECT titular_contrato, ci_titular, medidor_iot, categoria, subcategoria FROM contratos WHERE numero_contrato = '{contrato}'"))
        if not c_row:
            raise HTTPException(status_code=404, detail=f"Contract '{contrato}' not found.")
            
        c = c_row[0]
        
        # 2. Fetch unpaid bills
        unpaid_bills = list(session.execute(f"SELECT fecha_hora_lectura, consumo, monto_facturado FROM lecturas_unpaid_by_contrato WHERE numero_contrato = '{contrato}'"))
        
        total_debt = sum(b.monto_facturado for b in unpaid_bills)
        latest_consumption = unpaid_bills[0].consumo if unpaid_bills else 0
        latest_amount = unpaid_bills[0].monto_facturado if unpaid_bills else 0.0
        
        # Determine deadline (15 days from latest reading)
        latest_date = unpaid_bills[0].fecha_hora_lectura if unpaid_bills else None
        
        # Generate PDFs dynamically via PdfService
        thermal_filename = PdfService.generate_preaviso_pdf(contrato, "thermal")
        half_letter_filename = PdfService.generate_preaviso_pdf(contrato, "half_letter")
        
        # Build base URL for serving
        base_url = str(request.base_url)
        thermal_url = f"{base_url}static/uploads/{thermal_filename}"
        half_letter_url = f"{base_url}static/uploads/{half_letter_filename}"

        # Generate notification templates
        msg_payload = {
            "titular": c.titular_contrato,
            "contrato": contrato,
            "consumo": latest_consumption,
            "deuda": total_debt,
            "url_pdf": half_letter_url
        }
        templates = NotificationService.generate_templates(msg_payload)

        return {
            "numero_contrato": contrato,
            "titular_contrato": c.titular_contrato,
            "ci_titular": c.ci_titular,
            "medidor_iot": c.medidor_iot,
            "categoria": c.categoria,
            "subcategoria": c.subcategoria,
            "ultimo_consumo_m3": latest_consumption,
            "monto_ultimo_mes_bs": round(latest_amount, 2),
            "deuda_total_bs": round(total_debt, 2),
            "fecha_lectura": latest_date.isoformat() if latest_date else None,
            "pdf_descarga_roll_55mm": thermal_url,
            "pdf_descarga_media_carta": half_letter_url,
            "notificaciones": templates
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating preaviso: {e}")
        raise HTTPException(status_code=500, detail=str(e))
