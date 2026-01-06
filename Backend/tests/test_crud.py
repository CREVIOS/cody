"""
Test Suite for CRUD Operations

This test suite validates the CRUD base class and specific
CRUD implementations for various models.
"""

import pytest
from uuid import uuid4, UUID
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from crud import (
    CRUDBase,
    CRUDUser,
    CRUDProject,
    CRUDRole,
    CRUDProjectMember,
    CRUDProjectInvitation,
    CRUDFileType,
    CRUDExecutionEnvironment,
    CRUDTerminalEnvironment,
    CRUDWebSocketConnection
)
import models
import schema as schemas


@pytest.mark.asyncio
class TestCRUDBase:
    """Test suite for CRUDBase generic class."""
    
    async def test_get_by_id(self):
        """Test getting an object by ID."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_id = uuid4()
        
        mock_obj = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_obj
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.get(mock_db, id=obj_id)
        
        # Assert
        assert result == mock_obj
        mock_db.execute.assert_called_once()
    
    async def test_get_not_found(self):
        """Test getting a non-existent object returns None."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_id = uuid4()
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.get(mock_db, id=obj_id)
        
        # Assert
        assert result is None
    
    async def test_create(self):
        """Test creating a new object."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_data = {"name": "Test", "email": "test@example.com"}
        
        mock_obj = MagicMock()
        mock_obj.user_id = uuid4()
        mock_model.return_value = mock_obj
        
        mock_db.refresh = AsyncMock()
        
        # Act
        result = await crud.create(mock_db, obj_in=obj_data)
        
        # Assert
        assert result == mock_obj
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
        mock_db.refresh.assert_called_once()
    
    async def test_create_with_dict(self):
        """Test creating with a dictionary."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_data = {"name": "Test"}
        
        mock_obj = MagicMock()
        mock_obj.user_id = uuid4()
        mock_model.return_value = mock_obj
        
        mock_db.refresh = AsyncMock()
        
        # Act
        result = await crud.create(mock_db, obj_in=obj_data)
        
        # Assert
        assert result == mock_obj
    
    async def test_update(self):
        """Test updating an existing object."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_id = uuid4()
        
        mock_db_obj = MagicMock()
        mock_db_obj.user_id = obj_id
        
        update_data = MagicMock()
        update_data.model_dump.return_value = {"name": "Updated"}
        
        mock_db.refresh = AsyncMock()
        
        # Act
        result = await crud.update(mock_db, db_obj=mock_db_obj, obj_in=update_data)
        
        # Assert
        assert result == mock_db_obj
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()
    
    async def test_remove(self):
        """Test removing an object."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_id = uuid4()
        
        mock_obj = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_obj
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        mock_db.delete = AsyncMock()
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.remove(mock_db, id=obj_id)
        
        # Assert
        assert result == mock_obj
        mock_db.delete.assert_called_once_with(mock_obj)
        mock_db.commit.assert_called_once()
    
    async def test_remove_not_found(self):
        """Test removing a non-existent object."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        obj_id = uuid4()
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.remove(mock_db, id=obj_id)
        
        # Assert
        assert result is None
    
    async def test_get_multi(self):
        """Test getting multiple objects."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        
        mock_objs = [MagicMock(), MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_objs
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.get_multi(mock_db, skip=0, limit=10)
        
        # Assert
        assert result == mock_objs
        assert len(result) == 2
    
    async def test_get_multi_with_filters(self):
        """Test getting multiple objects with filters."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        mock_model.email = "test@example.com"
        
        crud = CRUDBase(mock_model)
        
        mock_objs = [MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_objs
        
        mock_query = MagicMock()
        mock_query.where.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.get_multi(mock_db, skip=0, limit=10, email="test@example.com")
        
        # Assert
        assert result == mock_objs
        mock_db.execute.assert_called_once()
    
    async def test_count(self):
        """Test counting objects."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        
        crud = CRUDBase(mock_model)
        
        mock_result = MagicMock()
        mock_result.scalar.return_value = 5
        
        mock_query = MagicMock()
        mock_query.select_from.return_value = mock_query
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query), \
             patch('crud.func.count', return_value=MagicMock()):
            # Act
            result = await crud.count(mock_db)
        
        # Assert
        assert result == 5
    
    async def test_count_with_filters(self):
        """Test counting objects with filters."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        mock_model = MagicMock()
        mock_model.__name__ = "User"
        mock_model.status = "active"
        
        crud = CRUDBase(mock_model)
        
        mock_result = MagicMock()
        mock_result.scalar.return_value = 3
        
        mock_query = MagicMock()
        mock_query.select_from.return_value = mock_query
        mock_query.where.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query), \
             patch('crud.func.count', return_value=MagicMock()):
            # Act
            result = await crud.count(mock_db, status="active")
        
        # Assert
        assert result == 3


@pytest.mark.asyncio
class TestCRUDUser:
    """Test suite for CRUDUser."""
    
    async def test_get_by_email(self):
        """Test getting a user by email."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDUser(models.User)
        
        mock_user = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_email(mock_db, email="test@example.com")
        
        # Assert
        assert result == mock_user
    
    async def test_get_by_username(self):
        """Test getting a user by username."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDUser(models.User)
        
        mock_user = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_user
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_username(mock_db, username="testuser")
        
        # Assert
        assert result == mock_user


@pytest.mark.asyncio
class TestCRUDProject:
    """Test suite for CRUDProject."""
    
    async def test_get_by_owner(self):
        """Test getting projects by owner."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDProject(models.Project)
        owner_id = uuid4()
        
        mock_projects = [MagicMock(), MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_projects
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_owner(mock_db, owner_id=owner_id)
        
        # Assert
        assert result == mock_projects
        assert len(result) == 2


@pytest.mark.asyncio
class TestCRUDRole:
    """Test suite for CRUDRole."""
    
    async def test_get_by_name(self):
        """Test getting a role by name."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDRole(models.Role)
        
        mock_role = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_role
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_name(mock_db, role_name="admin")
        
        # Assert
        assert result == mock_role


@pytest.mark.asyncio
class TestCRUDProjectMember:
    """Test suite for CRUDProjectMember."""
    
    async def test_get_by_user(self):
        """Test getting project members by user."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDProjectMember(models.ProjectMember)
        user_id = uuid4()
        
        mock_members = [MagicMock(), MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_members
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_user(mock_db, user_id=user_id)
        
        # Assert
        assert result == mock_members
        assert len(result) == 2


@pytest.mark.asyncio
class TestCRUDProjectInvitation:
    """Test suite for CRUDProjectInvitation."""
    
    async def test_get_by_token(self):
        """Test getting an invitation by token."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDProjectInvitation(models.ProjectInvitation)
        token = "test-token-123"
        
        mock_invitation = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_invitation
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_token(mock_db, token=token)
        
        # Assert
        assert result == mock_invitation
    
    async def test_get_multi_with_active_filters(self):
        """Test getting multiple invitations with active filters."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDProjectInvitation(models.ProjectInvitation)
        
        mock_invitations = [MagicMock()]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = mock_invitations
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_multi(mock_db, skip=0, limit=10)
        
        # Assert
        assert result == mock_invitations
        mock_db.execute.assert_called_once()
    
    async def test_count_with_active_filters(self):
        """Test counting invitations with active filters."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDProjectInvitation(models.ProjectInvitation)
        
        mock_result = MagicMock()
        mock_result.scalar.return_value = 2
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.count(mock_db)
        
        # Assert
        assert result == 2


@pytest.mark.asyncio
class TestCRUDFileType:
    """Test suite for CRUDFileType."""
    
    async def test_get_by_name(self):
        """Test getting a file type by name."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDFileType(models.FileType)
        
        mock_file_type = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_file_type
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_name(mock_db, type_name="python")
        
        # Assert
        assert result == mock_file_type


@pytest.mark.asyncio
class TestCRUDExecutionEnvironment:
    """Test suite for CRUDExecutionEnvironment."""
    
    async def test_get_by_name(self):
        """Test getting an execution environment by name."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDExecutionEnvironment(models.ExecutionEnvironment)
        
        mock_env = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_env
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        # Act
        result = await crud.get_by_name(mock_db, environment_name="python3")
        
        # Assert
        assert result == mock_env


@pytest.mark.asyncio
class TestCRUDTerminalEnvironment:
    """Test suite for CRUDTerminalEnvironment."""
    
    async def test_get_by_name_returns_none(self):
        """Test that get_by_name returns None for terminal environments."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDTerminalEnvironment(models.TerminalEnvironment)
        
        # Act
        result = await crud.get_by_name(mock_db, environment_name="test")
        
        # Assert
        assert result is None


@pytest.mark.asyncio
class TestCRUDWebSocketConnection:
    """Test suite for CRUDWebSocketConnection."""
    
    async def test_get(self):
        """Test getting a websocket connection by ID."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDWebSocketConnection()
        conn_id = uuid4()
        
        mock_conn = MagicMock()
        mock_result = MagicMock()
        mock_result.scalars.return_value.first.return_value = mock_conn
        
        mock_query = MagicMock()
        mock_query.filter.return_value = mock_query
        
        mock_db.execute = AsyncMock(return_value=mock_result)
        
        with patch('crud.select', return_value=mock_query):
            # Act
            result = await crud.get(mock_db, id=conn_id)
        
        # Assert
        assert result == mock_conn
    
    async def test_create(self):
        """Test creating a websocket connection."""
        # Arrange
        mock_db = AsyncMock(spec=AsyncSession)
        crud = CRUDWebSocketConnection()
        
        mock_conn_data = MagicMock()
        mock_conn_data.dict.return_value = {"user_id": uuid4(), "websocket_id": "test-id"}
        mock_conn = MagicMock()
        mock_conn.connection_id = uuid4()
        
        mock_model = MagicMock()
        mock_model.return_value = mock_conn
        
        with patch('crud.WebSocketConnection', mock_model):
            mock_db.refresh = AsyncMock()
            
            # Act
            result = await crud.create(mock_db, obj_in=mock_conn_data)
            
            # Assert
            assert result == mock_conn
            mock_db.add.assert_called_once()
            mock_db.commit.assert_called_once()

