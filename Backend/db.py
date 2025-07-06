import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from typing import AsyncGenerator
import asyncio
import json
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine

# Database URL - CockroachDB connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "cockroachdb+asyncpg://tanzila:nd-qFSw5GhO5HFQoQ0AFJg@editor-12981.j77.aws-ap-south-1.cockroachlabs.cloud:26257/defaultdb")

# Create async engine with CockroachDB-specific settings
engine = create_async_engine(
    DATABASE_URL
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False
)

Base = declarative_base()

# Dependency to get async database session
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            raise
        finally:
            await session.close()

# Register JSON type handler
@event.listens_for(Engine, "connect")
def set_json_codec(dbapi_connection, connection_record):
    if hasattr(dbapi_connection, 'set_type_codec'):
        dbapi_connection.set_type_codec(
            'json',
            codec=json.loads,
            encoder=json.dumps,
            schema='pg_catalog'
        )
