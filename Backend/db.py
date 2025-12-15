import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from typing import AsyncGenerator
import asyncio
import json
from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.types import TypeDecorator, TEXT
from uuid import uuid4
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode


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


# Database URLs - prefer PgBouncer/pooler
RAW_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    'postgresql://postgres.igbmvsodtgfmbcxmalha:M6KPIqpWntaF4nAN@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true',
)
PGBOUNCER_URL = os.getenv("PGBOUNCER_URL") or os.getenv("DATABASE_POOLER_URL")


def derive_pooler_url(url: str | None) -> str | None:
    if not url:
        return url

    if "supabase.com" in url and ":5432/" in url:
        return url.replace(":5432/", ":6543/")
    return url


def ensure_async_driver(url: str | None) -> str | None:
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        upgraded = url
    elif url.startswith("postgresql://"):
        upgraded = "postgresql+asyncpg://" + url[len("postgresql://") :]
    else:
        upgraded = url
    return strip_unsupported_asyncpg_params(upgraded)


def strip_unsupported_asyncpg_params(url: str | None) -> str | None:
    """
    asyncpg treats URL query params as keyword args; strip ones it doesn't accept (e.g., pgbouncer).
    """
    if not url:
        return url
    try:
        parsed = urlsplit(url)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        filtered = [(k, v) for (k, v) in query_pairs if k.lower() not in {"pgbouncer"}]
        if len(filtered) == len(query_pairs):
            return url
        new_query = urlencode(filtered)
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, new_query, parsed.fragment))
    except Exception:
        return url


DATABASE_URL = PGBOUNCER_URL or derive_pooler_url(RAW_DATABASE_URL) or RAW_DATABASE_URL
DATABASE_URL_ASYNC = ensure_async_driver(DATABASE_URL)

# Optional: direct (non-pooled) sync URL for migrations/tools
DIRECT_URL = os.getenv(
    "DIRECT_URL",
    "postgresql://postgres.igbmvsodtgfmbcxmalha:M6KPIqpWntaF4nAN@aws-1-ap-south-1.pooler.supabase.com:5432/postgres",
)

# Prefer JSONB for Postgres, JSON for others (e.g., SQLite in tests)
if "postgresql" in DATABASE_URL:
    from sqlalchemy.dialects.postgresql import JSONB as JSONVariant
else:
    from sqlalchemy import JSON as JSONVariant


# Create async engine configured for PgBouncer-friendly pooling
# - Keep a small capped pool to avoid exhausting PgBouncer client slots
# - Disable asyncpg statement cache to avoid prepared statements under PgBouncer transaction/statement modes
# - Provide unique prepared statement names as an additional safeguard when prepared statements are used internally
# - Relax server-side statement timeout to avoid spurious "canceling statement due to statement timeout"
connect_args: dict = {}
if DATABASE_URL_ASYNC and "postgresql+asyncpg" in DATABASE_URL_ASYNC:
    connect_args = {
        "statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        # Ensure reasonable server-side timeout; some managed Postgres providers
        # (and PgBouncer configurations) default to very low statement_timeout
        # which can break metadata / JSON codec introspection queries.
        "server_settings": {
            # 60 seconds; adjust as needed for your environment
            "statement_timeout": "60000",
        },
    }

POOLING_MODE = os.getenv("DB_POOLING_MODE", "pool").lower()
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "1"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "0"))
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))

engine_kwargs = {
    "connect_args": connect_args,
    "pool_pre_ping": True,
}

if POOLING_MODE == "null":
    # Let PgBouncer own pooling; avoid app-level pooling to prevent exhausting slots
    engine_kwargs["poolclass"] = NullPool
else:
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
            "json", decoder=json.loads, encoder=json.dumps, schema="pg_catalog"
        )
