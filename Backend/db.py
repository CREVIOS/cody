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
from sqlalchemy.types import TypeDecorator, TEXT
from uuid import uuid4


class JsonEncoded(TypeDecorator):
    """Represents an immutable structure as a json-encoded string.

    Usage::

        JSONEncoded(255)

    """

    impl = TEXT

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)

        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value


# Database URLs - Supabase Postgres (pooled for app, direct for migrations)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres.igbmvsodtgfmbcxmalha:%2AbeHA%40%24p-E4%2A6X%21@aws-1-ap-south-1.pooler.supabase.com:6543/postgres",
)

# Optional: direct (non-pooled) sync URL for migrations/tools
DIRECT_URL = os.getenv(
    "DIRECT_URL",
    "postgresql://postgres.igbmvsodtgfmbcxmalha:%2AbeHA%40%24p-E4%2A6X%21@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
)

# Prefer JSONB for Postgres, JSON for others (e.g., SQLite in tests)
if "postgresql" in DATABASE_URL:
    from sqlalchemy.dialects.postgresql import JSONB as JSONVariant
else:
    from sqlalchemy import JSON as JSONVariant


# Create async engine configured for PgBouncer (avoid app-level pooling)
# - Disable asyncpg statement cache to avoid prepared statements under PgBouncer transaction/statement modes
# - Provide unique prepared statement names as an additional safeguard when prepared statements are used internally
connect_args = {}
if "postgresql+asyncpg" in DATABASE_URL:
    connect_args = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    }

engine = create_async_engine(
    DATABASE_URL,
    poolclass=NullPool,
    connect_args=connect_args,
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

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
    if hasattr(dbapi_connection, "set_type_codec"):
        dbapi_connection.set_type_codec(
            "json", codec=json.loads, encoder=json.dumps, schema="pg_catalog"
        )
