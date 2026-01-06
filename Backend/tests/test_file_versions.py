"""
Test suite for file_versions router endpoints.
"""
import pytest
from httpx import AsyncClient
from uuid import uuid4
import time

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio


async def create_test_user(client: AsyncClient, username_suffix: str = None):
    """Helper function to create a test user."""
    import uuid as uuid_lib
    timestamp = str(int(time.time() * 1000))
    unique_id = str(uuid_lib.uuid4())[:8]
    suffix = f"{username_suffix}_{timestamp}_{unique_id}" if username_suffix else f"{timestamp}_{unique_id}"
    
    user_data = {
        "username": f"testuser_{suffix}",
        "email": f"test_{suffix}@example.com",
        "password": "password123",
    }
    
    response = await client.post("/api/v1/users/", json=user_data)
    assert response.status_code == 201
    return response.json()


async def create_test_project(client: AsyncClient, owner_id: str, project_name: str = None):
    """Helper function to create a test project."""
    timestamp = str(int(time.time() * 1000))
    name = project_name or f"Test Project {timestamp}"
    
    project_data = {
        "project_name": name,
        "description": "A test project",
        "owner_id": owner_id,
    }
    
    response = await client.post("/api/v1/projects/", json=project_data)
    assert response.status_code == 201
    return response.json()


async def create_test_directory(client: AsyncClient, project_id: str, created_by: str):
    """Helper function to create a test directory."""
    directory_data = {
        "project_id": project_id,
        "directory_name": "test_dir",
        "created_by": created_by,
    }
    
    response = await client.post("/api/v1/directories/", json=directory_data)
    assert response.status_code == 201
    return response.json()


async def create_test_file_type(client: AsyncClient):
    """Helper function to create a test file type."""
    import uuid as uuid_lib
    timestamp = str(int(time.time() * 1000))
    unique_id = str(uuid_lib.uuid4())[:8]
    file_type_data = {
        "type_name": f"Test Type {timestamp}_{unique_id}",
        "extension": ".txt",
        "mime_type": "text/plain",
    }
    
    response = await client.post("/api/v1/file-types/", json=file_type_data)
    assert response.status_code == 201
    return response.json()


async def create_test_file(client: AsyncClient, project_id: str, directory_id: str, 
                           file_type_id: str, created_by: str, actor_id: str):
    """Helper function to create a test file."""
    file_data = {
        "project_id": project_id,
        "directory_id": directory_id,
        "file_type_id": file_type_id,
        "file_name": "test.txt",
        "created_by": created_by,
        "last_modified_by": created_by,  # Required field
    }
    
    response = await client.post(
        f"/api/v1/files/?actor_id={actor_id}",
        json=file_data
    )
    assert response.status_code == 201
    return response.json()


async def create_test_project_member(client: AsyncClient, project_id: str, user_id: str, 
                                     role_id: str, actor_id: str):
    """Helper function to create a test project member."""
    member_data = {
        "project_id": project_id,
        "user_id": user_id,
        "role_id": role_id,
    }
    
    response = await client.post(
        f"/api/v1/project-members/?actor_id={actor_id}",
        json=member_data
    )
    return response.status_code == 201


class TestCreateFileVersion:
    """Test POST /file-versions/ endpoint."""
    
    async def test_create_file_version_success(self, client: AsyncClient):
        """Test successful file version creation."""
        # Setup
        owner = await create_test_user(client, "owner")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create file version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        
        response = await client.post("/api/v1/file-versions/", json=version_data)
        assert response.status_code == 201
        version = response.json()
        assert version["file_id"] == file["file_id"]
        assert version["version_number"] == 1
    
    async def test_create_file_version_file_not_found(self, client: AsyncClient):
        """Test creating version with non-existent file."""
        owner = await create_test_user(client, "owner1")
        
        version_data = {
            "file_id": str(uuid4()),
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        
        response = await client.post("/api/v1/file-versions/", json=version_data)
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]
    
    async def test_create_file_version_creator_not_found(self, client: AsyncClient):
        """Test creating version with non-existent creator."""
        owner = await create_test_user(client, "owner2")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": str(uuid4()),
        }
        
        response = await client.post("/api/v1/file-versions/", json=version_data)
        assert response.status_code == 404
        assert "Creator not found" in response.json()["detail"]
    
    async def test_create_file_version_user_not_member(self, client: AsyncClient):
        """Test creating version when user is not a project member."""
        owner = await create_test_user(client, "owner3")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        non_member = await create_test_user(client, "nonmember")
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": non_member["user_id"],
        }
        
        response = await client.post("/api/v1/file-versions/", json=version_data)
        assert response.status_code == 403
        assert "not a member" in response.json()["detail"]


class TestReadFileVersions:
    """Test GET /file-versions/ endpoint."""
    
    async def test_read_file_versions_success(self, client: AsyncClient):
        """Test reading file versions list."""
        owner = await create_test_user(client, "owner4")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        await client.post("/api/v1/file-versions/", json=version_data)
        
        # Read versions
        response = await client.get("/api/v1/file-versions/")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 1
    
    async def test_read_file_versions_with_file_filter(self, client: AsyncClient):
        """Test reading file versions with file filter."""
        owner = await create_test_user(client, "owner5")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        await client.post("/api/v1/file-versions/", json=version_data)
        
        # Read versions with file filter
        response = await client.get(
            f"/api/v1/file-versions/?file_id={file['file_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(v["file_id"] == file["file_id"] for v in data["items"])
    
    async def test_read_file_versions_pagination(self, client: AsyncClient):
        """Test reading file versions with pagination."""
        owner = await create_test_user(client, "owner6")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create multiple versions
        for i in range(3):
            version_data = {
                "file_id": file["file_id"],
                "version_number": i + 1,
                "version_link": f"https://example.com/versions/test_{i}.txt",
                "size_in_bytes": 1024,
                "created_by": owner["user_id"],
            }
            await client.post("/api/v1/file-versions/", json=version_data)
        
        # Test pagination
        response = await client.get(
            f"/api/v1/file-versions/?skip=0&limit=2&file_id={file['file_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 2
        assert data["total"] >= 3


class TestReadFileVersion:
    """Test GET /file-versions/{version_id} endpoint."""
    
    async def test_read_file_version_success(self, client: AsyncClient):
        """Test reading a single file version."""
        owner = await create_test_user(client, "owner7")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        create_response = await client.post("/api/v1/file-versions/", json=version_data)
        version_id = create_response.json()["version_id"]
        
        # Read the version
        response = await client.get(f"/api/v1/file-versions/{version_id}")
        assert response.status_code == 200
        version = response.json()
        assert version["version_id"] == version_id
    
    async def test_read_file_version_not_found(self, client: AsyncClient):
        """Test reading non-existent file version."""
        fake_id = str(uuid4())
        response = await client.get(f"/api/v1/file-versions/{fake_id}")
        assert response.status_code == 404
        assert "File version not found" in response.json()["detail"]


class TestGetFileVersionContent:
    """Test GET /file-versions/{version_id}/content endpoint."""
    
    async def test_get_file_version_content_not_found(self, client: AsyncClient):
        """Test getting content for non-existent version."""
        fake_id = str(uuid4())
        project_id = str(uuid4())
        response = await client.get(
            f"/api/v1/file-versions/{fake_id}/content?project_id={project_id}"
        )
        assert response.status_code == 404
        assert "File version not found" in response.json()["detail"]


class TestUpdateFileVersion:
    """Test PUT /file-versions/{version_id} endpoint."""
    
    async def test_update_file_version_success(self, client: AsyncClient):
        """Test successful file version update."""
        owner = await create_test_user(client, "owner8")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        create_response = await client.post("/api/v1/file-versions/", json=version_data)
        version_id = create_response.json()["version_id"]
        
        # Update the version
        update_data = {
            "size_in_bytes": 2048,
        }
        response = await client.put(
            f"/api/v1/file-versions/{version_id}",
            json=update_data
        )
        assert response.status_code == 200
        updated_version = response.json()
        assert updated_version["size_in_bytes"] == 2048
    
    async def test_update_file_version_not_found(self, client: AsyncClient):
        """Test updating non-existent file version."""
        fake_id = str(uuid4())
        update_data = {"size_in_bytes": 2048}
        response = await client.put(
            f"/api/v1/file-versions/{fake_id}",
            json=update_data
        )
        assert response.status_code == 404
        assert "File version not found" in response.json()["detail"]
    
    async def test_update_file_version_file_not_found(self, client: AsyncClient):
        """Test updating version with non-existent file."""
        owner = await create_test_user(client, "owner9")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        create_response = await client.post("/api/v1/file-versions/", json=version_data)
        version_id = create_response.json()["version_id"]
        
        # Try to update with non-existent file
        update_data = {"file_id": str(uuid4())}
        response = await client.put(
            f"/api/v1/file-versions/{version_id}",
            json=update_data
        )
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]


class TestDeleteFileVersion:
    """Test DELETE /file-versions/{version_id} endpoint."""
    
    async def test_delete_file_version_success(self, client: AsyncClient):
        """Test successful file version deletion."""
        owner = await create_test_user(client, "owner10")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create role and add user as member
        import uuid as uuid_lib
        timestamp = str(int(time.time() * 1000))
        unique_id = str(uuid_lib.uuid4())[:8]
        role_data = {
            "role_name": f"editor_{timestamp}_{unique_id}",
            "permissions": {"canView": True, "canEdit": True},
        }
        role_response = await client.post("/api/v1/roles/", json=role_data)
        assert role_response.status_code == 201
        role = role_response.json()
        
        await create_test_project_member(
            client, project["project_id"], owner["user_id"], role["role_id"], owner["user_id"]
        )
        
        # Create file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Create a version
        version_data = {
            "file_id": file["file_id"],
            "version_number": 1,
            "version_link": "https://example.com/versions/test.txt",
            "size_in_bytes": 1024,
            "created_by": owner["user_id"],
        }
        create_response = await client.post("/api/v1/file-versions/", json=version_data)
        version_id = create_response.json()["version_id"]
        
        # Delete the version
        response = await client.delete(f"/api/v1/file-versions/{version_id}")
        assert response.status_code == 204
        
        # Verify version is deleted
        get_response = await client.get(f"/api/v1/file-versions/{version_id}")
        assert get_response.status_code == 404
    
    async def test_delete_file_version_not_found(self, client: AsyncClient):
        """Test deleting non-existent file version."""
        fake_id = str(uuid4())
        response = await client.delete(f"/api/v1/file-versions/{fake_id}")
        assert response.status_code == 404
        assert "File version not found" in response.json()["detail"]

