from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
import traceback
from db import engine, Base
from sqlalchemy import text

# DESIGN PATTERN: Factory Pattern
# The RouterFactory automates router discovery and registration
from factories import create_router_factory

# OLD APPROACH (Before Factory Pattern):
# Had to manually import and register each router - 13 import lines + 13 registration lines!
# from routers import users, projects, roles, project_members, project_invitations, directories, file_types, files, file_versions, notifications, permissions, locks
# from routers import websocket_connections


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("uvicorn").setLevel(logging.INFO)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)


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
            
            # Defensive schema guard
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='file_locks' AND column_name='updated_at'
                    ) THEN
                        ALTER TABLE file_locks ADD COLUMN updated_at TIMESTAMPTZ NULL;
                    END IF;
                END$$;
            """))
            await conn.execute(text("""
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='file_locks' AND column_name='expires_at'
                    ) THEN
                        ALTER TABLE file_locks ADD COLUMN expires_at TIMESTAMPTZ NULL;
                    END IF;
                END$$;
            """))
            
            
            
            # Commit the transaction
            await conn.commit()
            logger.info("🛠️ Schema guard applied")
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


# DESIGN PATTERN: Factory Pattern Implementation
# The factory automatically discovers and registers all routers
router_factory = create_router_factory(routers_package="routers", api_prefix="/api/v1")
router_factory.register_all_routers(app)

# OLD APPROACH (Before Factory Pattern):
# Had to manually register each router - repetitive and error-prone!
# app.include_router(users.router, prefix="/api/v1")
# app.include_router(projects.router, prefix="/api/v1")
# app.include_router(roles.router, prefix="/api/v1")
# app.include_router(project_members.router, prefix="/api/v1")
# app.include_router(project_invitations.router, prefix="/api/v1")
# app.include_router(directories.router, prefix="/api/v1")
# app.include_router(file_types.router, prefix="/api/v1")
# app.include_router(files.router, prefix="/api/v1")
# app.include_router(file_versions.router, prefix="/api/v1")
# app.include_router(notifications.router, prefix="/api/v1")
# app.include_router(permissions.router, prefix="/api/v1")
# app.include_router(locks.router, prefix="/api/v1")
# app.include_router(websocket_connections.router, prefix="/api/v1")

logger.info(f"Registered {len(router_factory.get_registered_routers())} routers using Factory Pattern")


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
        port=8000,
        reload=True,
        log_level="info"
    )

