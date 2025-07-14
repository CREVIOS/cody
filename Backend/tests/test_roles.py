import pytest
from httpx import AsyncClient
import uuid
import time

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def create_test_role(client: AsyncClient, role_suffix: str = None):
    """Helper function to create a test role with unique data."""
    timestamp = str(int(time.time() * 1000))
    suffix = role_suffix or timestamp
    
    role_data = {
        "role_name": f"test_role_{suffix}",
        "description": f"Test role {suffix}",
        "permissions": {
            "read": True,
            "write": True,
            "delete": False,
            "admin": False
        }
    }
    
    response = await client.post("/api/v1/roles/", json=role_data)
    return response, role_data


async def test_create_role_success(client: AsyncClient):
    """Test successful role creation."""
    response, role_data = await create_test_role(client)
    
    assert response.status_code == 201
    response_data = response.json()
    assert response_data["role_name"] == role_data["role_name"]
    assert response_data["description"] == role_data["description"]
    assert response_data["permissions"] == role_data["permissions"]
    assert "role_id" in response_data


async def test_create_role_duplicate_name(client: AsyncClient):
    """Test creating role with duplicate name."""
    # Create first role
    response1, role_data1 = await create_test_role(client, "first")
    assert response1.status_code == 201
    
    # Try to create second role with same name
    role_data2 = {
        "role_name": role_data1["role_name"],  # Same name
        "description": "Different description",
        "permissions": {"read": True}
    }
    
    response2 = await client.post("/api/v1/roles/", json=role_data2)
    assert response2.status_code == 400
    assert "Role name already exists" in response2.json()["detail"]


async def test_get_role_by_id(client: AsyncClient):
    """Test retrieving a role by ID."""
    # Create a role first
    response, role_data = await create_test_role(client)
    assert response.status_code == 201
    created_role = response.json()
    role_id = created_role["role_id"]
    
    # Get the role by ID
    response = await client.get(f"/api/v1/roles/{role_id}")
    assert response.status_code == 200
    retrieved_role = response.json()
    
    assert retrieved_role["role_id"] == role_id
    assert retrieved_role["role_name"] == role_data["role_name"]
    assert retrieved_role["description"] == role_data["description"]
    assert retrieved_role["permissions"] == role_data["permissions"]


async def test_get_role_not_found(client: AsyncClient):
    """Test retrieving a non-existent role."""
    non_existent_id = str(uuid.uuid4())
    response = await client.get(f"/api/v1/roles/{non_existent_id}")
    assert response.status_code == 404
    assert "Role not found" in response.json()["detail"]


async def test_get_roles_list(client: AsyncClient):
    """Test retrieving list of roles."""
    # Create a few roles
    roles = []
    for i in range(3):
        response, role_data = await create_test_role(client, f"list_{i}")
        assert response.status_code == 201
        roles.append(response.json())
    
    # Get roles list
    response = await client.get("/api/v1/roles/")
    assert response.status_code == 200
    response_data = response.json()
    
    assert "items" in response_data
    assert "total" in response_data
    assert response_data["total"] >= 3  # At least the roles we created
    assert len(response_data["items"]) >= 3


async def test_update_role(client: AsyncClient):
    """Test updating a role."""
    # Create a role first
    response, role_data = await create_test_role(client)
    assert response.status_code == 201
    created_role = response.json()
    role_id = created_role["role_id"]
    
    # Update the role
    update_data = {
        "description": "Updated description",
        "permissions": {
            "read": True,
            "write": True,
            "delete": True,
            "admin": True
        }
    }
    
    response = await client.put(f"/api/v1/roles/{role_id}", json=update_data)
    assert response.status_code == 200
    updated_role = response.json()
    
    assert updated_role["description"] == update_data["description"]
    assert updated_role["permissions"] == update_data["permissions"]
    assert updated_role["role_name"] == role_data["role_name"]  # Unchanged


async def test_update_role_not_found(client: AsyncClient):
    """Test updating a non-existent role."""
    non_existent_id = str(uuid.uuid4())
    update_data = {"description": "Updated description"}
    
    response = await client.put(f"/api/v1/roles/{non_existent_id}", json=update_data)
    assert response.status_code == 404
    assert "Role not found" in response.json()["detail"]


async def test_delete_role(client: AsyncClient):
    """Test deleting a role."""
    # Create a role first
    response, role_data = await create_test_role(client)
    assert response.status_code == 201
    created_role = response.json()
    role_id = created_role["role_id"]
    
    # Delete the role
    response = await client.delete(f"/api/v1/roles/{role_id}")
    assert response.status_code == 204
    
    # Verify role is deleted
    response = await client.get(f"/api/v1/roles/{role_id}")
    assert response.status_code == 404


async def test_delete_role_not_found(client: AsyncClient):
    """Test deleting a non-existent role."""
    non_existent_id = str(uuid.uuid4())
    response = await client.delete(f"/api/v1/roles/{non_existent_id}")
    assert response.status_code == 404
    assert "Role not found" in response.json()["detail"]


async def test_create_role_missing_required_fields(client: AsyncClient):
    """Test creating role with missing required fields."""
    # Missing role_name
    response = await client.post("/api/v1/roles/", json={
        "description": "Test role",
        "permissions": {"read": True}
    })
    assert response.status_code == 422  # Validation error
    
    # Missing permissions
    response = await client.post("/api/v1/roles/", json={
        "role_name": "test_role",
        "description": "Test role"
    })
    assert response.status_code == 422  # Validation error


async def test_create_role_invalid_permissions(client: AsyncClient):
    """Test creating role with invalid permissions format."""
    response = await client.post("/api/v1/roles/", json={
        "role_name": "test_role",
        "description": "Test role",
        "permissions": "invalid_permissions"  # Should be dict, not string
    })
    assert response.status_code == 422  # Validation error 