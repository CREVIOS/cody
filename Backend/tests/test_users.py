import pytest
from httpx import AsyncClient
import uuid
import time

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def create_test_user(client: AsyncClient, username_suffix: str = None):
    """Helper function to create a test user with unique data."""
    timestamp = str(int(time.time() * 1000))
    suffix = username_suffix or timestamp
    
    user_data = {
        "username": f"testuser_{suffix}",
        "email": f"test_{suffix}@example.com",
        "password": "password123",
        "full_name": f"Test User {suffix}",
    }
    
    response = await client.post("/api/v1/users/", json=user_data)
    return response, user_data


async def test_create_user_success(client: AsyncClient):
    """Test successful user creation."""
    response, user_data = await create_test_user(client)
    
    assert response.status_code == 201
    response_data = response.json()
    assert response_data["username"] == user_data["username"]
    assert response_data["email"] == user_data["email"]
    assert response_data["full_name"] == user_data["full_name"]
    assert "user_id" in response_data
    assert "password" not in response_data
    assert "password_hash" not in response_data


async def test_create_user_duplicate_email(client: AsyncClient):
    """Test creating user with duplicate email."""
    # Create first user with unique identifiers
    timestamp = str(int(time.time() * 1000))
    response1, user_data1 = await create_test_user(client, f"dup_email_{timestamp}")
    assert response1.status_code == 201
    
    # Try to create second user with same email but different username
    user_data2 = {
        "username": f"testuser_second_{timestamp}",
        "email": user_data1["email"],  # Same email
        "password": "password123",
    }
    
    response2 = await client.post("/api/v1/users/", json=user_data2)
    assert response2.status_code == 400
    assert "Email already registered" in response2.json()["detail"]


async def test_create_user_duplicate_username(client: AsyncClient):
    """Test creating user with duplicate username."""
    # Create first user with unique identifiers
    timestamp = str(int(time.time() * 1000))
    response1, user_data1 = await create_test_user(client, f"dup_user_{timestamp}")
    assert response1.status_code == 201
    
    # Try to create second user with same username but different email
    user_data2 = {
        "username": user_data1["username"],  # Same username
        "email": f"different_{timestamp}@example.com",
        "password": "password123",
    }
    
    response2 = await client.post("/api/v1/users/", json=user_data2)
    assert response2.status_code == 400
    assert "Username already taken" in response2.json()["detail"]


async def test_get_user_by_id(client: AsyncClient):
    """Test retrieving a user by ID."""
    # Create a user first
    response, user_data = await create_test_user(client)
    assert response.status_code == 201
    created_user = response.json()
    user_id = created_user["user_id"]
    
    # Get the user by ID
    response = await client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 200
    retrieved_user = response.json()
    
    assert retrieved_user["user_id"] == user_id
    assert retrieved_user["username"] == user_data["username"]
    assert retrieved_user["email"] == user_data["email"]


async def test_get_user_not_found(client: AsyncClient):
    """Test retrieving a non-existent user."""
    non_existent_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/users/{non_existent_id}")
    assert response.status_code == 404
    assert "User not found" in response.json()["detail"]


async def test_get_users_list(client: AsyncClient):
    """Test retrieving list of users."""
    # Create a few users
    users = []
    for i in range(3):
        response, user_data = await create_test_user(client, f"list_{i}")
        assert response.status_code == 201
        users.append(response.json())
    
    # Get users list
    response = await client.get("/api/v1/users/")
    assert response.status_code == 200
    response_data = response.json()
    
    assert "items" in response_data
    assert "total" in response_data
    assert response_data["total"] >= 3  # At least the users we created
    assert len(response_data["items"]) >= 3


async def test_get_users_list_with_pagination(client: AsyncClient):
    """Test retrieving users with pagination."""
    # Create multiple users
    for i in range(5):
        response, _ = await create_test_user(client, f"pagination_{i}")
        assert response.status_code == 201
    
    # Get first page with limit
    response = await client.get("/api/v1/users/?skip=0&limit=2")
    assert response.status_code == 200
    response_data = response.json()
    
    assert len(response_data["items"]) == 2
    assert response_data["total"] >= 5


async def test_update_user(client: AsyncClient):
    """Test updating a user."""
    # Create a user first
    response, user_data = await create_test_user(client)
    assert response.status_code == 201
    created_user = response.json()
    user_id = created_user["user_id"]
    
    # Update the user
    update_data = {
        "full_name": "Updated Full Name",
        "status": "active"
    }
    
    response = await client.put(f"/api/v1/users/{user_id}", json=update_data)
    assert response.status_code == 200
    updated_user = response.json()
    
    assert updated_user["full_name"] == update_data["full_name"]
    assert updated_user["status"] == update_data["status"]
    assert updated_user["username"] == user_data["username"]  # Unchanged


async def test_update_user_not_found(client: AsyncClient):
    """Test updating a non-existent user."""
    non_existent_id = str(uuid.uuid4())
    update_data = {"full_name": "Updated Name"}
    
    response = await client.put(f"/api/v1/users/{non_existent_id}", json=update_data)
    assert response.status_code == 404
    assert "User not found" in response.json()["detail"]


async def test_delete_user(client: AsyncClient):
    """Test deleting a user."""
    # Create a user first
    response, user_data = await create_test_user(client)
    assert response.status_code == 201
    created_user = response.json()
    user_id = created_user["user_id"]
    
    # Delete the user
    response = await client.delete(f"/api/v1/users/{user_id}")
    assert response.status_code == 204
    
    # Verify user is deleted
    response = await client.get(f"/api/v1/users/{user_id}")
    assert response.status_code == 404


async def test_delete_user_not_found(client: AsyncClient):
    """Test deleting a non-existent user."""
    non_existent_id = str(uuid.uuid4())
    response = await client.delete(f"/api/v1/users/{non_existent_id}")
    assert response.status_code == 404
    assert "User not found" in response.json()["detail"]


async def test_create_user_missing_required_fields(client: AsyncClient):
    """Test creating user with missing required fields."""
    # Missing username
    response = await client.post("/api/v1/users/", json={
        "email": "test@example.com",
        "password": "password123"
    })
    assert response.status_code == 422  # Validation error
    
    # Missing email
    response = await client.post("/api/v1/users/", json={
        "username": "testuser",
        "password": "password123"
    })
    assert response.status_code == 422  # Validation error
    
    # Missing password
    response = await client.post("/api/v1/users/", json={
        "username": "testuser",
        "email": "test@example.com"
    })
    assert response.status_code == 422  # Validation error


async def test_create_user_invalid_email(client: AsyncClient):
    """Test creating user with invalid email format."""
    response = await client.post("/api/v1/users/", json={
        "username": "testuser",
        "email": "invalid-email",
        "password": "password123"
    })
    assert response.status_code == 422  # Validation error 