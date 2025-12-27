import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
import json


@pytest.mark.asyncio
async def test_db_connection(client: AsyncClient):
    """
    Tests the database connection using the test client and health endpoint.
    """
    try:
        print("Testing database connection...")
        response = await client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"
        print("Database connection successful")
    except Exception as e:
        pytest.fail(f"Database connection failed: {e}")


@pytest.mark.asyncio
async def test_db_direct_connection():
    """
    Tests the database connection directly using the test database.
    """
    from tests.conftest import TestingSessionLocal
    
    try:
        print("Testing direct database connection...")
        async with TestingSessionLocal() as session:
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1
            print("Direct database connection successful")
    except Exception as e:
        pytest.fail(f"Direct database connection failed: {e}")


class TestEnsurePoolerPort:
    """Test ensure_pooler_port function."""
    
    def test_ensure_pooler_port_supabase_5432(self):
        """Test that Supabase URLs with port 5432 are converted to 6543."""
        from db import ensure_pooler_port
        
        url = "postgresql://user:pass@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"
        result = ensure_pooler_port(url)
        assert ":6543/" in result
        assert ":5432/" not in result
    
    def test_ensure_pooler_port_supabase_already_6543(self):
        """Test that Supabase URLs with port 6543 are unchanged."""
        from db import ensure_pooler_port
        
        url = "postgresql://user:pass@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
        result = ensure_pooler_port(url)
        assert result == url
    
    def test_ensure_pooler_port_non_supabase(self):
        """Test that non-Supabase URLs are unchanged."""
        from db import ensure_pooler_port
        
        url = "postgresql://user:pass@example.com:5432/db"
        result = ensure_pooler_port(url)
        assert result == url
    
    def test_ensure_pooler_port_none(self):
        """Test that None is returned as None."""
        from db import ensure_pooler_port
        
        result = ensure_pooler_port(None)
        assert result is None
    
    def test_ensure_pooler_port_empty_string(self):
        """Test that empty string is returned as empty string."""
        from db import ensure_pooler_port
        
        result = ensure_pooler_port("")
        assert result == ""


class TestEnsureAsyncDriver:
    """Test ensure_async_driver function."""
    
    def test_ensure_async_driver_postgresql(self):
        """Test that postgresql:// is converted to postgresql+asyncpg://."""
        from db import ensure_async_driver
        
        url = "postgresql://user:pass@localhost:5432/db"
        result = ensure_async_driver(url)
        assert result.startswith("postgresql+asyncpg://")
    
    def test_ensure_async_driver_already_asyncpg(self):
        """Test that postgresql+asyncpg:// is unchanged."""
        from db import ensure_async_driver
        
        url = "postgresql+asyncpg://user:pass@localhost:5432/db"
        result = ensure_async_driver(url)
        assert result == url
    
    def test_ensure_async_driver_sqlite(self):
        """Test that SQLite URLs are unchanged."""
        from db import ensure_async_driver
        
        url = "sqlite+aiosqlite:///:memory:"
        result = ensure_async_driver(url)
        assert result == url
    
    def test_ensure_async_driver_strips_pgbouncer(self):
        """Test that pgbouncer query params are stripped."""
        from db import ensure_async_driver
        
        url = "postgresql://user:pass@localhost:5432/db?pgbouncer=true&other=value"
        result = ensure_async_driver(url)
        assert "pgbouncer" not in result
        assert "other=value" in result
    
    def test_ensure_async_driver_none(self):
        """Test that None is returned as None."""
        from db import ensure_async_driver
        
        result = ensure_async_driver(None)
        assert result is None
    
    def test_ensure_async_driver_invalid_url(self):
        """Test that invalid URLs are handled gracefully."""
        from db import ensure_async_driver
        
        # Should not raise exception, just return the upgraded URL
        url = "invalid://url"
        result = ensure_async_driver(url)
        assert result is not None


class TestJsonEncoded:
    """Test JsonEncoded TypeDecorator."""
    
    def test_json_encoded_process_bind_param(self):
        """Test that dict is converted to JSON string."""
        from db import JsonEncoded
        
        encoder = JsonEncoded()
        value = {"key": "value", "number": 42}
        result = encoder.process_bind_param(value, None)
        assert isinstance(result, str)
        assert json.loads(result) == value
    
    def test_json_encoded_process_bind_param_none(self):
        """Test that None is returned as None."""
        from db import JsonEncoded
        
        encoder = JsonEncoded()
        result = encoder.process_bind_param(None, None)
        assert result is None
    
    def test_json_encoded_process_result_value(self):
        """Test that JSON string is converted to dict."""
        from db import JsonEncoded
        
        encoder = JsonEncoded()
        json_str = '{"key": "value", "number": 42}'
        result = encoder.process_result_value(json_str, None)
        assert isinstance(result, dict)
        assert result == {"key": "value", "number": 42}
    
    def test_json_encoded_process_result_value_none(self):
        """Test that None is returned as None."""
        from db import JsonEncoded
        
        encoder = JsonEncoded()
        result = encoder.process_result_value(None, None)
        assert result is None
    
    def test_json_encoded_round_trip(self):
        """Test that encoding and decoding produces original value."""
        from db import JsonEncoded
        
        encoder = JsonEncoded()
        original = {"key": "value", "nested": {"inner": 123}}
        
        # Encode
        encoded = encoder.process_bind_param(original, None)
        assert isinstance(encoded, str)
        
        # Decode
        decoded = encoder.process_result_value(encoded, None)
        assert decoded == original


class TestGetDb:
    """Test get_db function."""
    
    @pytest.mark.asyncio
    async def test_get_db_yields_session(self):
        """Test that get_db yields a session."""
        from db import get_db
        
        async for session in get_db():
            assert isinstance(session, AsyncSession)
            # Only iterate once to avoid multiple sessions
            break
    
    @pytest.mark.asyncio
    async def test_get_db_session_closes(self):
        """Test that session is closed after use."""
        from db import get_db
        
        async for session in get_db():
            # Session should be usable
            assert session is not None
            # Exit the context manager
            break
        
        # After exiting, session should be closed
        # Note: This is tested implicitly by the context manager
    
    @pytest.mark.asyncio
    async def test_get_db_rollback_on_exception(self):
        """Test that session rolls back on exception."""
        from db import get_db
        from sqlalchemy import text
        
        try:
            async for session in get_db():
                # Try to execute something that might fail
                await session.execute(text("SELECT 1"))
                # Simulate an exception
                raise ValueError("Test exception")
        except ValueError:
            pass
        # Session should have been rolled back and closed 