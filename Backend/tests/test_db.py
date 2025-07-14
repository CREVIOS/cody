import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


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