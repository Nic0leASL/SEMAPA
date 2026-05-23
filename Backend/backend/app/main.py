import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.cassandra.connection import CassandraConnection
from app.routes import etl, dashboard, queries, mobile, totem

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MainAPI")

# Create the FastAPI app
app = FastAPI(
    title="SEMAPA Cochabamba Distributed Big Data Platform API",
    description="FastAPI Backend for horizontal sharded billing & IoT platform using Apache Cassandra.",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads folder and mount as static
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=UPLOAD_DIR), name="static")

# Database connection listeners
@app.on_event("startup")
async def startup_event():
    logger.info("Starting FastAPI Server...")
    try:
        # Initialize Cassandra cluster connection and tables
        CassandraConnection.initialize()
    except Exception as e:
        logger.error(f"Could not connect to Cassandra on startup: {e}. API will run but DB calls will fail.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down FastAPI Server...")
    CassandraConnection.close()

# Register Routers
app.include_router(etl.router)
app.include_router(dashboard.router)
app.include_router(queries.router)
app.include_router(mobile.router)
app.include_router(totem.router)

@app.get("/", tags=["Status"])
async def root():
    node_name = os.getenv("NODE_NAME", "API_Principal_Nodo1")
    contact_points = os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1")
    port = os.getenv("CASSANDRA_PORT", "9042")
    
    # Try to verify active Cassandra session
    db_connected = False
    try:
        session = CassandraConnection.get_session()
        if session and not session.is_shutdown:
            db_connected = True
    except Exception:
        pass

    return {
        "status": "online",
        "service": "SEMAPA Big Data Backend",
        "node_assigned": node_name,
        "database_connected": db_connected,
        "connection_details": {
            "contact_points": contact_points,
            "port": port
        }
    }
