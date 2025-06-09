from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
import traceback
from db import engine, Base
from sqlalchemy import text

# Import routers
from routers import users, projects, roles, project_members, project_invitations, directories, file_types, files, file_versions, notifications

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up...")
    try:
        # Test connection first
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            logger.info("Database connection successful")
            
            # # Create tables
            # await conn.run_sync(Base.metadata.create_all)
            # logger.info("Database tables created successfully")
            
            # Commit the transaction
            await conn.commit()
    except Exception as e:
        logger.error(f"Error during startup: {str(e)}")
        logger.error(traceback.format_exc())
        raise
    yield
    # Shutdown
    logger.info("Shutting down...")
    await engine.dispose()

# Create FastAPI app
app = FastAPI(
    title="Project Management API",
    description="A comprehensive project management system with file management, collaboration, and execution environments",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing middleware
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_detail = str(exc)
    stack_trace = traceback.format_exc()
    logger.error(f"Global exception: {error_detail}\n{stack_trace}")
    
    # Return a more detailed error response
    return JSONResponse(
        status_code=500,
        content={
            "detail": error_detail,
            "type": type(exc).__name__,
            "path": request.url.path
        }
    )

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}


# Include routers
app.include_router(users.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(roles.router, prefix="/api/v1")
app.include_router(project_members.router, prefix="/api/v1")
app.include_router(project_invitations.router, prefix="/api/v1")
app.include_router(directories.router, prefix="/api/v1")
app.include_router(file_types.router, prefix="/api/v1")
app.include_router(files.router, prefix="/api/v1")
app.include_router(file_versions.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")

# Root endpoint
@app.get("/")
async def root():
    return {
        "message": "Project Management API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
        log_level="info"
    )

