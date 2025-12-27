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


class TestSyncUserFromAuth:
    """Test POST /users/sync-from-auth endpoint."""
    
    async def test_sync_user_from_auth_success(self, client: AsyncClient):
        """Test successful user sync from auth."""
        user_id = str(uuid.uuid4())
        request_data = {
            "user_id": user_id,
            "email": f"auth_{int(time.time() * 1000)}@example.com",
            "username": f"authuser_{int(time.time() * 1000)}",
            "full_name": "Auth User",
            "avatar_url": "https://example.com/avatar.jpg"
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 200
        result = response.json()
        assert "user_id" in result
        assert result["user_id"] == user_id
    
    async def test_sync_user_from_auth_missing_user_id(self, client: AsyncClient):
        """Test syncing user without user_id."""
        request_data = {
            "email": "test@example.com"
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 400
        assert "user_id and email are required" in response.json()["detail"]
    
    async def test_sync_user_from_auth_missing_email(self, client: AsyncClient):
        """Test syncing user without email."""
        user_id = str(uuid.uuid4())
        request_data = {
            "user_id": user_id
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 400
        assert "user_id and email are required" in response.json()["detail"]
    
    async def test_sync_user_from_auth_user_already_exists(self, client: AsyncClient):
        """Test syncing user that already exists."""
        # Create user via normal endpoint
        response, _ = await create_test_user(client, "existing")
        assert response.status_code == 201
        existing_user = response.json()
        
        # Try to sync with same user_id
        request_data = {
            "user_id": existing_user["user_id"],
            "email": existing_user["email"],
            "username": existing_user["username"]
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 200
        result = response.json()
        assert result["user_id"] == existing_user["user_id"]
        assert "already exists" in result["message"]
    
    async def test_sync_user_from_auth_email_exists(self, client: AsyncClient):
        """Test syncing user when email already exists."""
        # Create user via normal endpoint
        response, user_data = await create_test_user(client, "email_exists")
        assert response.status_code == 201
        existing_user = response.json()
        
        # Try to sync with different user_id but same email
        new_user_id = str(uuid.uuid4())
        request_data = {
            "user_id": new_user_id,
            "email": existing_user["email"],
            "username": f"different_{int(time.time() * 1000)}"
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 200
        result = response.json()
        assert "already exists with this email" in result["message"]
        assert result["user_id"] == existing_user["user_id"]
    
    async def test_sync_user_from_auth_username_conflict(self, client: AsyncClient):
        """Test syncing user with username conflict (should append number)."""
        # Create user via normal endpoint
        response, user_data = await create_test_user(client, "username_conflict")
        assert response.status_code == 201
        existing_user = response.json()
        
        # Try to sync with different user_id but same username
        new_user_id = str(uuid.uuid4())
        timestamp = int(time.time() * 1000)
        request_data = {
            "user_id": new_user_id,
            "email": f"new_{timestamp}@example.com",
            "username": existing_user["username"]
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 200
        result = response.json()
        assert "user_id" in result
        # Username should be different (appended number or email)
        assert result["user_id"] == new_user_id
    
    async def test_sync_user_from_auth_invalid_user_id_format(self, client: AsyncClient):
        """Test syncing user with invalid user_id format."""
        request_data = {
            "user_id": "not-a-valid-uuid",
            "email": "test@example.com"
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 400
        assert "Invalid user_id format" in response.json()["detail"]
    
    async def test_sync_user_from_auth_with_optional_fields(self, client: AsyncClient):
        """Test syncing user with optional fields."""
        user_id = str(uuid.uuid4())
        timestamp = int(time.time() * 1000)
        request_data = {
            "user_id": user_id,
            "email": f"optional_{timestamp}@example.com",
            "username": f"optionaluser_{timestamp}",
            "full_name": "Optional Full Name",
            "avatar_url": "https://example.com/avatar.jpg"
        }
        
        response = await client.post("/api/v1/users/sync-from-auth", json=request_data)
        assert response.status_code == 200
        result = response.json()
        assert result["user_id"] == user_id


class TestGetUserAllProjects:
    """Test GET /users/{user_id}/all-projects endpoint."""
    
    async def test_get_user_all_projects_success(self, client: AsyncClient):
        """Test getting all projects for a user."""
        # Create user
        response, _ = await create_test_user(client, "projects_user")
        assert response.status_code == 201
        user = response.json()
        user_id = user["user_id"]
        
        # Create project owned by user
        project_data = {
            "project_name": "Owned Project",
            "description": "A project owned by the user",
            "owner_id": user_id,
        }
        project_response = await client.post("/api/v1/projects/", json=project_data)
        assert project_response.status_code == 201
        
        # Get all projects
        response = await client.get(f"/api/v1/users/{user_id}/all-projects")
        assert response.status_code == 200
        result = response.json()
        assert "user" in result
        assert "owned_projects" in result
        assert "member_projects" in result
        assert len(result["owned_projects"]) >= 1
    
    async def test_get_user_all_projects_user_not_found(self, client: AsyncClient):
        """Test getting projects for non-existent user."""
        fake_user_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/users/{fake_user_id}/all-projects")
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]
    
    async def test_get_user_all_projects_with_member_projects(self, client: AsyncClient):
        """Test getting projects where user is a member."""
        # Create owner and member users
        owner_response, _ = await create_test_user(client, "owner_proj")
        assert owner_response.status_code == 201
        owner = owner_response.json()
        
        member_response, _ = await create_test_user(client, "member_proj")
        assert member_response.status_code == 201
        member = member_response.json()
        
        # Create project owned by owner
        project_data = {
            "project_name": "Member Project",
            "description": "A project where user is a member",
            "owner_id": owner["user_id"],
        }
        project_response = await client.post("/api/v1/projects/", json=project_data)
        assert project_response.status_code == 201
        project = project_response.json()
        
        # Create role
        timestamp = str(int(time.time() * 1000))
        role_data = {
            "role_name": f"editor_{timestamp}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        # Add member to project
        member_data = {
            "project_id": project["project_id"],
            "user_id": member["user_id"],
            "role_id": role["role_id"],
        }
        member_create_response = await client.post(
            f"/api/v1/project-members/?actor_id={owner['user_id']}",
            json=member_data
        )
        assert member_create_response.status_code == 201
        
        # Get all projects for member
        response = await client.get(f"/api/v1/users/{member['user_id']}/all-projects")
        assert response.status_code == 200
        result = response.json()
        assert len(result["member_projects"]) >= 1
        # Should not include owned projects (member doesn't own any)
        assert len(result["owned_projects"]) == 0
    
    async def test_get_user_all_projects_no_projects(self, client: AsyncClient):
        """Test getting projects for user with no projects."""
        # Create user
        response, _ = await create_test_user(client, "no_projects")
        assert response.status_code == 201
        user = response.json()
        user_id = user["user_id"]
        
        # Get all projects
        response = await client.get(f"/api/v1/users/{user_id}/all-projects")
        assert response.status_code == 200
        result = response.json()
        assert len(result["owned_projects"]) == 0
        assert len(result["member_projects"]) == 0


class TestReadUsersNoTrailingSlash:
    """Test GET /users endpoint (without trailing slash)."""
    
    async def test_read_users_no_trailing_slash(self, client: AsyncClient):
        """Test reading users without trailing slash."""
        # Create a user
        response, _ = await create_test_user(client, "no_slash")
        assert response.status_code == 201
        
        # Get users without trailing slash
        response = await client.get("/api/v1/users")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
    
    async def test_read_users_no_trailing_slash_with_filters(self, client: AsyncClient):
        """Test reading users without trailing slash with status filter."""
        # Create a user
        response, _ = await create_test_user(client, "no_slash_filter")
        assert response.status_code == 201
        
        # Get users with status filter
        response = await client.get("/api/v1/users?status=active")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data 