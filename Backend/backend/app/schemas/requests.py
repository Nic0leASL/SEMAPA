from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class MovilLecturaRequest(BaseModel):
    medidor_iot: str = Field(..., description="MAC address or identifier of the IoT meter")
    lectura_actual: int = Field(..., gte=0, description="The current manual reading value")
    lectura_anterior: Optional[int] = Field(None, gte=0, description="The previous reading value")
    radiobase: int = Field(1, description="The connection radiobase code")
    fecha_hora_lectura: datetime = Field(default_factory=datetime.now, description="Timestamp of the reading")

class MovilGPSRequest(BaseModel):
    numero_catastro: str = Field(..., description="Property cadastral number to link coordinate")
    latitud: float = Field(..., ge=-90.0, le=90.0, description="Latitude coordinate")
    longitud: float = Field(..., ge=-180.0, le=180.0, description="Longitude coordinate")

class MovilObservacionRequest(BaseModel):
    medidor_iot: str = Field(..., description="MAC address of the meter")
    estado: str = Field(..., description="Status of the meter (Operativo, Mantenimiento, Dañado, etc.)")
    observacion: str = Field(..., description="Citizen or inspector observations")
