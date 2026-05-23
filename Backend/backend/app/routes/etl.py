import os
import shutil
import time
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from app.services.etl_service import ETLService

logger = logging.getLogger("ETLRoute")
router = APIRouter(prefix="/upload", tags=["ETL Ingestion"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def save_temp_file(file: UploadFile) -> str:
    temp_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    return temp_path

@router.post("/distritos")
async def upload_distritos(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")
    
    start_time = time.time()
    temp_path = save_temp_file(file)
    try:
        count = ETLService.import_distritos(temp_path)
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "message": f"Successfully imported {count} district records.",
            "records_inserted": count,
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Error importing distritos: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/contratos")
async def upload_contratos(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")
    
    start_time = time.time()
    temp_path = save_temp_file(file)
    try:
        count = ETLService.import_contratos(temp_path)
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "message": f"Successfully imported {count} contracts.",
            "records_inserted": count,
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Error importing contratos: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/infraestructura")
async def upload_infraestructura(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")
    
    start_time = time.time()
    temp_path = save_temp_file(file)
    try:
        count = ETLService.import_infraestructura(temp_path)
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "message": f"Successfully imported {count} infrastructure sites.",
            "records_inserted": count,
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Error importing infraestructura: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/medidores")
async def upload_medidores(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")
    
    start_time = time.time()
    temp_path = save_temp_file(file)
    try:
        count = ETLService.import_medidores(temp_path)
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "message": f"Successfully imported {count} water meters.",
            "records_inserted": count,
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Error importing medidores: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@router.post("/lecturas")
async def upload_lecturas(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are allowed.")
    
    start_time = time.time()
    temp_path = save_temp_file(file)
    try:
        # Before reading, make sure default tariffs exist
        ETLService.load_tarifas_default()
        
        count = ETLService.import_lecturas(temp_path)
        elapsed = time.time() - start_time
        return {
            "status": "success",
            "message": f"Successfully imported and deduplicated {count} readings.",
            "records_inserted": count,
            "elapsed_seconds": round(elapsed, 2)
        }
    except Exception as e:
        logger.error(f"Error importing lecturas: {e}")
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
@router.post("/tarifas")
async def upload_tarifas():
    # Since tariffs are dynamically seeded and configurable, we mock the custom upload
    # or reload default tariffs.
    try:
        ETLService.load_tarifas_default()
        return {"status": "success", "message": "Tariffs loaded/seeded successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
