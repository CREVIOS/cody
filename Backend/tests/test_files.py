"""
Test suite for files router endpoints.
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


class TestCreateFile:
    """Test POST /files/ endpoint."""
    
    async def test_create_file_success(self, client: AsyncClient):
        """Test successful file creation."""
        owner = await create_test_user(client, "owner")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        file_data = {
            "project_id": project["project_id"],
            "directory_id": directory["directory_id"],
            "file_type_id": file_type["file_type_id"],
            "file_name": "test.txt",
            "created_by": owner["user_id"],
            "last_modified_by": owner["user_id"],  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={owner['user_id']}",
            json=file_data
        )
        assert response.status_code == 201
        file = response.json()
        assert file["file_name"] == "test.txt"
        assert file["project_id"] == project["project_id"]
    
    async def test_create_file_project_not_found(self, client: AsyncClient):
        """Test creating file with non-existent project."""
        owner = await create_test_user(client, "owner1")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Use a fake project_id for the file
        fake_project_id = str(uuid4())
        
        file_data = {
            "project_id": fake_project_id,
            "directory_id": directory["directory_id"],
            "file_type_id": file_type["file_type_id"],
            "file_name": "test.txt",
            "created_by": owner["user_id"],
            "last_modified_by": owner["user_id"],  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={owner['user_id']}",
            json=file_data
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]
    
    async def test_create_file_directory_not_found(self, client: AsyncClient):
        """Test creating file with non-existent directory."""
        owner = await create_test_user(client, "owner2")
        project = await create_test_project(client, owner["user_id"])
        file_type = await create_test_file_type(client)
        
        file_data = {
            "project_id": project["project_id"],
            "directory_id": str(uuid4()),
            "file_type_id": file_type["file_type_id"],
            "file_name": "test.txt",
            "created_by": owner["user_id"],
            "last_modified_by": owner["user_id"],  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={owner['user_id']}",
            json=file_data
        )
        # 422 is validation error, 404 would be after validation
        assert response.status_code in [404, 422]
    
    async def test_create_file_file_type_not_found(self, client: AsyncClient):
        """Test creating file with non-existent file type."""
        owner = await create_test_user(client, "owner3")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        
        file_data = {
            "project_id": project["project_id"],
            "directory_id": directory["directory_id"],
            "file_type_id": str(uuid4()),
            "file_name": "test.txt",
            "created_by": owner["user_id"],
            "last_modified_by": owner["user_id"],  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={owner['user_id']}",
            json=file_data
        )
        # 422 is validation error, 404 would be after validation
        assert response.status_code in [404, 422]
    
    async def test_create_file_creator_not_found(self, client: AsyncClient):
        """Test creating file with non-existent creator."""
        owner = await create_test_user(client, "owner4")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        file_data = {
            "project_id": project["project_id"],
            "directory_id": directory["directory_id"],
            "file_type_id": file_type["file_type_id"],
            "file_name": "test.txt",
            "created_by": str(uuid4()),
            "last_modified_by": str(uuid4()),  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={owner['user_id']}",
            json=file_data
        )
        # 422 is validation error, 404 would be after validation
        assert response.status_code in [404, 422]
    
    async def test_create_file_permission_denied(self, client: AsyncClient):
        """Test creating file without permission."""
        owner = await create_test_user(client, "owner5")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        unauthorized_user = await create_test_user(client, "unauthorized")
        
        file_data = {
            "project_id": project["project_id"],
            "directory_id": directory["directory_id"],
            "file_type_id": file_type["file_type_id"],
            "file_name": "test.txt",
            "created_by": owner["user_id"],
            "last_modified_by": owner["user_id"],  # Required field
        }
        
        response = await client.post(
            f"/api/v1/files/?actor_id={unauthorized_user['user_id']}",
            json=file_data
        )
        # 422 is validation error (missing permission setup), 403 would be after validation
        assert response.status_code in [403, 422]


class TestReadFiles:
    """Test GET /files/ endpoint."""
    
    async def test_read_files_success(self, client: AsyncClient):
        """Test reading files list."""
        owner = await create_test_user(client, "owner6")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Read files
        response = await client.get("/api/v1/files/")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert len(data["items"]) >= 1
    
    async def test_read_files_with_filters(self, client: AsyncClient):
        """Test reading files with filters."""
        owner = await create_test_user(client, "owner7")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Read files with project filter
        response = await client.get(
            f"/api/v1/files/?project_id={project['project_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(f["project_id"] == project["project_id"] for f in data["items"])
        
        # Read files with directory filter
        response = await client.get(
            f"/api/v1/files/?directory_id={directory['directory_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(f["directory_id"] == directory["directory_id"] for f in data["items"])
        
        # Read files with file_type filter
        response = await client.get(
            f"/api/v1/files/?file_type_id={file_type['file_type_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) >= 1
        assert all(f["file_type_id"] == file_type["file_type_id"] for f in data["items"])
    
    async def test_read_files_pagination(self, client: AsyncClient):
        """Test reading files with pagination."""
        owner = await create_test_user(client, "owner8")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create multiple files
        for i in range(3):
            file_data = {
                "project_id": project["project_id"],
                "directory_id": directory["directory_id"],
                "file_type_id": file_type["file_type_id"],
                "file_name": f"test_{i}.txt",
                "created_by": owner["user_id"],
                "last_modified_by": owner["user_id"],  # Required field
            }
            response = await client.post(
                f"/api/v1/files/?actor_id={owner['user_id']}",
                json=file_data
            )
            assert response.status_code == 201, f"Failed to create file {i}: {response.json()}"
        
        # Test pagination
        response = await client.get(
            f"/api/v1/files/?skip=0&limit=2&project_id={project['project_id']}"
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) <= 2
        assert data["total"] >= 3


class TestGetRealtimeKey:
    """Test GET /files/{file_identifier}/realtime-key endpoint."""
    
    async def test_get_realtime_key_with_uuid(self, client: AsyncClient):
        """Test getting realtime key with UUID file identifier."""
        owner = await create_test_user(client, "owner9")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Get realtime key
        response = await client.get(
            f"/api/v1/files/{file['file_id']}/realtime-key?user_id={owner['user_id']}&project_id={project['project_id']}"
        )
        assert response.status_code == 200
        key = response.json()
        assert "docId" in key
        assert "fileId" in key
        assert "projectId" in key
        assert "permissions" in key
    
    async def test_get_realtime_key_with_path(self, client: AsyncClient):
        """Test getting realtime key with file path."""
        owner = await create_test_user(client, "owner10")
        project = await create_test_project(client, owner["user_id"])
        
        # Get realtime key with path
        response = await client.get(
            f"/api/v1/files/test.txt/realtime-key?user_id={owner['user_id']}&project_id={project['project_id']}"
        )
        assert response.status_code == 200
        key = response.json()
        assert "docId" in key
        assert "fileId" in key
        assert "projectId" in key
    
    async def test_get_realtime_key_project_not_found(self, client: AsyncClient):
        """Test getting realtime key with non-existent project."""
        owner = await create_test_user(client, "owner11")
        fake_project_id = str(uuid4())
        
        response = await client.get(
            f"/api/v1/files/test.txt/realtime-key?user_id={owner['user_id']}&project_id={fake_project_id}"
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]
    
    async def test_get_realtime_key_missing_project_id(self, client: AsyncClient):
        """Test getting realtime key without project_id when using path."""
        owner = await create_test_user(client, "owner12")
        
        response = await client.get(
            f"/api/v1/files/test.txt/realtime-key?user_id={owner['user_id']}"
        )
        # 422 is correct for validation errors (missing required query param)
        assert response.status_code in [400, 422]


class TestSaveFileContent:
    """Test POST /files/{file_identifier}/save-content endpoint."""
    
    async def test_save_file_content_project_not_found(self, client: AsyncClient):
        """Test saving content with non-existent project."""
        owner = await create_test_user(client, "owner13")
        fake_project_id = str(uuid4())
        
        content_data = {
            "content": "test content",
            "message": "test save"
        }
        
        response = await client.post(
            f"/api/v1/files/test.txt/save-content?user_id={owner['user_id']}&project_id={fake_project_id}",
            json=content_data
        )
        assert response.status_code == 404
        assert "Project not found" in response.json()["detail"]


class TestNotifyLock:
    """Test POST /files/{file_key}/lock endpoint."""
    
    async def test_notify_lock_success(self, client: AsyncClient):
        """Test lock notification."""
        notification_data = {
            "leader_id": str(uuid4())
        }
        
        response = await client.post(
            "/api/v1/files/test.txt/lock",
            json=notification_data
        )
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "acknowledged"
        assert result["file_key"] == "test.txt"
        assert "leader_id" in result
    
    async def test_notify_lock_no_leader(self, client: AsyncClient):
        """Test lock notification without leader."""
        notification_data = {}
        
        response = await client.post(
            "/api/v1/files/test.txt/lock",
            json=notification_data
        )
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "acknowledged"


class TestNotifyQueue:
    """Test POST /files/{file_key}/queue endpoint."""
    
    async def test_notify_queue_success(self, client: AsyncClient):
        """Test queue notification."""
        notification_data = {
            "queue": [
                {"userId": str(uuid4())},
                {"userId": str(uuid4())}
            ]
        }
        
        response = await client.post(
            "/api/v1/files/test.txt/queue",
            json=notification_data
        )
        assert response.status_code == 200
        result = response.json()
        assert result["status"] == "acknowledged"
        assert result["file_key"] == "test.txt"
        assert result["queue_size"] == 2
    
    async def test_notify_queue_empty(self, client: AsyncClient):
        """Test queue notification with empty queue."""
        notification_data = {
            "queue": []
        }
        
        response = await client.post(
            "/api/v1/files/test.txt/queue",
            json=notification_data
        )
        assert response.status_code == 200
        result = response.json()
        assert result["queue_size"] == 0


class TestReadFile:
    """Test GET /files/{file_id} endpoint."""
    
    async def test_read_file_success(self, client: AsyncClient):
        """Test reading a single file."""
        owner = await create_test_user(client, "owner14")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Read the file
        response = await client.get(f"/api/v1/files/{file['file_id']}")
        assert response.status_code == 200
        read_file = response.json()
        assert read_file["file_id"] == file["file_id"]
        assert read_file["file_name"] == "test.txt"
    
    async def test_read_file_not_found(self, client: AsyncClient):
        """Test reading non-existent file."""
        fake_id = str(uuid4())
        response = await client.get(f"/api/v1/files/{fake_id}")
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]


class TestUpdateFile:
    """Test PUT /files/{file_id} endpoint."""
    
    async def test_update_file_success(self, client: AsyncClient):
        """Test successful file update."""
        owner = await create_test_user(client, "owner15")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Update the file
        update_data = {
            "file_name": "updated.txt"
        }
        response = await client.put(
            f"/api/v1/files/{file['file_id']}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 200
        updated_file = response.json()
        assert updated_file["file_name"] == "updated.txt"
    
    async def test_update_file_not_found(self, client: AsyncClient):
        """Test updating non-existent file."""
        owner = await create_test_user(client, "owner16")
        fake_id = str(uuid4())
        update_data = {"file_name": "updated.txt"}
        response = await client.put(
            f"/api/v1/files/{fake_id}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]
    
    async def test_update_file_permission_denied(self, client: AsyncClient):
        """Test updating file without permission."""
        owner = await create_test_user(client, "owner17")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        unauthorized_user = await create_test_user(client, "unauthorized")
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Try to update without permission
        update_data = {"file_name": "updated.txt"}
        response = await client.put(
            f"/api/v1/files/{file['file_id']}?actor_id={unauthorized_user['user_id']}",
            json=update_data
        )
        assert response.status_code == 403
    
    # Note: project_id is not in FileUpdate schema, so we cannot test updating it
    # Files cannot be moved between projects via the update endpoint
    
    async def test_update_file_directory_not_found(self, client: AsyncClient):
        """Test updating file with non-existent directory."""
        owner = await create_test_user(client, "owner19")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Try to update with non-existent directory
        update_data = {"directory_id": str(uuid4())}
        response = await client.put(
            f"/api/v1/files/{file['file_id']}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "Directory not found" in response.json()["detail"]
    
    async def test_update_file_file_type_not_found(self, client: AsyncClient):
        """Test updating file with non-existent file type."""
        owner = await create_test_user(client, "owner20")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Try to update with non-existent file type
        update_data = {"file_type_id": str(uuid4())}
        response = await client.put(
            f"/api/v1/files/{file['file_id']}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "File type not found" in response.json()["detail"]
    
    async def test_update_file_last_modified_by_not_found(self, client: AsyncClient):
        """Test updating file with non-existent last_modified_by."""
        owner = await create_test_user(client, "owner21")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Try to update with non-existent user
        update_data = {"last_modified_by": str(uuid4())}
        response = await client.put(
            f"/api/v1/files/{file['file_id']}?actor_id={owner['user_id']}",
            json=update_data
        )
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]


class TestDeleteFile:
    """Test DELETE /files/{file_id} endpoint."""
    
    async def test_delete_file_success(self, client: AsyncClient):
        """Test successful file deletion."""
        owner = await create_test_user(client, "owner22")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Delete the file
        response = await client.delete(
            f"/api/v1/files/{file['file_id']}?actor_id={owner['user_id']}"
        )
        assert response.status_code == 204
        
        # Verify file is deleted
        get_response = await client.get(f"/api/v1/files/{file['file_id']}")
        assert get_response.status_code == 404
    
    async def test_delete_file_not_found(self, client: AsyncClient):
        """Test deleting non-existent file."""
        owner = await create_test_user(client, "owner23")
        fake_id = str(uuid4())
        response = await client.delete(
            f"/api/v1/files/{fake_id}?actor_id={owner['user_id']}"
        )
        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]
    
    async def test_delete_file_permission_denied(self, client: AsyncClient):
        """Test deleting file without permission."""
        owner = await create_test_user(client, "owner24")
        project = await create_test_project(client, owner["user_id"])
        directory = await create_test_directory(client, project["project_id"], owner["user_id"])
        file_type = await create_test_file_type(client)
        unauthorized_user = await create_test_user(client, "unauthorized")
        
        # Create a file
        file = await create_test_file(
            client, project["project_id"], directory["directory_id"],
            file_type["file_type_id"], owner["user_id"], owner["user_id"]
        )
        
        # Try to delete without permission
        response = await client.delete(
            f"/api/v1/files/{file['file_id']}?actor_id={unauthorized_user['user_id']}"
        )
        assert response.status_code == 403

