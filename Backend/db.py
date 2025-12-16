import os
import json
from typing import AsyncGenerator
from uuid import uuid4
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.types import TypeDecorator, TEXT


class JsonEncoded(TypeDecorator):
    impl = TEXT

    def process_bind_param(self, value, dialect):
        if value is not None:
            value = json.dumps(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            value = json.loads(value)
        return value


RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.igbmvsodtgfmbcxmalha:M6KPIqpWntaF4nAN@aws-1-ap-south-1.pooler.supabase.com:6543/postgres",
)

DIRECT_URL = os.getenv(
    "DIRECT_URL",
    "postgresql://postgres.igbmvsodtgfmbcxmalha:M6KPIqpWntaF4nAN@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
)


def ensure_pooler_port(url: str | None) -> str | None:
    """Ensure Supabase URLs use pooler port 6543 instead of direct port 5432."""
    if not url:
        return url
    if "supabase.com" in url and ":5432/" in url:
        return url.replace(":5432/", ":6543/")
    return url


def ensure_async_driver(url: str | None) -> str | None:
    """Convert postgresql:// to postgresql+asyncpg:// and strip unsupported params."""
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        upgraded = url
    elif url.startswith("postgresql://"):
        upgraded = "postgresql+asyncpg://" + url[len("postgresql://"):]
    else:
        upgraded = url
    try:
        parsed = urlsplit(upgraded)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        filtered = [(k, v) for k, v in query_pairs if k.lower() not in {"pgbouncer"}]
        new_query = urlencode(filtered)
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
    except Exception:
        return upgraded


DATABASE_URL = ensure_pooler_port(RAW_DATABASE_URL)
DATABASE_URL_ASYNC = ensure_async_driver(DATABASE_URL)

if "postgresql" in DATABASE_URL:
    from sqlalchemy.dialects.postgresql import JSONB as JSONVariant
else:
    from sqlalchemy import JSON as JSONVariant

connect_args: dict = {}
if DATABASE_URL_ASYNC and "postgresql+asyncpg" in DATABASE_URL_ASYNC:
    connect_args = {
        "prepared_statement_cache_size": 0,
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        "server_settings": {"statement_timeout": "60000"},
    }

# Connection Pool Configuration
# IMPORTANT: For Supabase with PgBouncer (transaction mode), use LOCAL pooling
# The app-level pool maintains warm connections, PgBouncer handles server-side pooling
POOLING_MODE = os.getenv("DB_POOLING_MODE", "local").lower()  # Changed default to "local"
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))  # Increased for better concurrency
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))  # More overflow for bursts
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "300"))  # Recycle every 5 min (within PgBouncer's server_lifetime)

engine_kwargs = {
    "connect_args": connect_args,
    "pool_pre_ping": True,  # Validates connections before use
    "echo": os.getenv("DB_ECHO", "false").lower() == "true",
}

if POOLING_MODE == "null":
    # NullPool: No pooling - creates new connection per request (SLOW!)
    # Only use this for debugging or if you have external connection pooling
    engine_kwargs["poolclass"] = NullPool
else:
    # Local connection pool - RECOMMENDED for production
    # Maintains warm connections, reducing TCP/SSL handshake overhead
    engine_kwargs.update({
        "pool_size": POOL_SIZE,
        "max_overflow": MAX_OVERFLOW,
        "pool_timeout": POOL_TIMEOUT,
        "pool_recycle": POOL_RECYCLE,
    })

engine = create_async_engine(
    DATABASE_URL_ASYNC,
    **engine_kwargs,
)

AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@event.listens_for(Engine, "connect")
def set_json_codec(dbapi_connection, connection_record):
    if hasattr(dbapi_connection, "set_type_codec"):
        dbapi_connection.set_type_codec(
            "json", decoder=json.loads, encoder=json.dumps, schema="pg_catalog"
        )
