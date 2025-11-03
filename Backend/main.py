from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import time
import logging
import traceback
from sqlalchemy import text

# ---------- Import core ----------
from db import engine
from routers import (
    users, projects, roles, project_members, project_invitations,
    directories, file_types, files, file_versions, notifications, locks
)
from routers import websocket_connections  # 👈 our new route
# Import routers
from routers import users, projects, roles, project_members, project_invitations, directories, file_types, files, file_versions, notifications, permissions

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
logging.getLogger("uvicorn").setLevel(logging.INFO)
logging.getLogger("uvicorn.error").setLevel(logging.INFO)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)

# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Starting up...")
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            logger.info("✅ Database connection successful")

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
            await conn.commit()
            logger.info("🛠️ Schema guard applied")
    except Exception as e:
        logger.error(f"❌ Error during startup: {e}")
        logger.error(traceback.format_exc())
        raise
    yield
    logger.info("🛑 Shutting down...")
    await engine.dispose()

# ---------- App ----------
app = FastAPI(
    title="Project Management API",
    description="Project management with file collaboration & locks",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------- CORS ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # or ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Middleware for request timing ----------
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error("💥 Exception in %s %s: %s", request.method, request.url.path, exc)
        raise
    dur = time.time() - start
    response.headers["X-Process-Time"] = f"{dur:.4f}"
    logger.info("⬅️  %s %s -> %s (%.3fs)", request.method, request.url.path, response.status_code, dur)
    return response

# ---------- Global exception handler ----------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("🌋 Global exception %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__, "path": request.url.path},
    )

# ---------- Health ----------
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": time.time()}

# ---------- Routers ----------
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
app.include_router(locks.router, prefix="/api/v1")
app.include_router(websocket_connections.router, prefix="/api/v1")   # 👈 crucial
app.include_router(permissions.router, prefix="/api/v1")

# ---------- Root ----------
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
