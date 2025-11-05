"""
Tests for Factory Pattern - Router Factory

This test file validates that the Factory pattern correctly
discovers, creates, and registers API routers.
"""

import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch, Mock
from fastapi import FastAPI, APIRouter
from factories import RouterFactory, create_router_factory, RouterConfig


class TestRouterFactory:
    """Test suite for the RouterFactory pattern"""

    def test_factory_initializes_with_default_values(self):
        """
        Test that the factory initializes with sensible defaults.
        """
        # Arrange & Act
        factory = RouterFactory()

        # Assert
        assert factory.routers_package == "routers"
        assert factory.api_prefix == "/api/v1"
        assert factory.registered_routers == []
        assert factory._router_configs == {}

    def test_factory_initializes_with_custom_values(self):
        """
        Test that the factory can be initialized with custom values.
        """
        # Arrange & Act
        factory = RouterFactory(
            routers_package="custom_routers",
            api_prefix="/api/v2"
        )

        # Assert
        assert factory.routers_package == "custom_routers"
        assert factory.api_prefix == "/api/v2"

    def test_discover_routers_finds_all_router_files(self):
        """
        Test that the factory discovers all Python files in the routers directory.

        This validates the auto-discovery feature of the Factory pattern.
        """
        # Arrange
        factory = RouterFactory(routers_package="routers")

        # Act
        with patch.object(Path, 'exists', return_value=True):
            with patch.object(Path, 'glob') as mock_glob:
                # Mock file discovery
                mock_glob.return_value = [
                    Path("routers/users.py"),
                    Path("routers/projects.py"),
                    Path("routers/files.py"),
                    Path("routers/__init__.py"),  # Should be skipped
                ]

                discovered = factory.discover_routers()

        # Assert
        assert "users" in discovered
        assert "projects" in discovered
        assert "files" in discovered
        assert "__init__" not in discovered  # Private files should be skipped

    def test_discover_routers_returns_empty_when_directory_not_found(self):
        """
        Test that the factory handles missing router directory gracefully.
        """
        # Arrange
        factory = RouterFactory(routers_package="nonexistent")

        # Act
        with patch.object(Path, 'exists', return_value=False):
            discovered = factory.discover_routers()

        # Assert
        assert discovered == []

    def test_create_router_imports_and_returns_router(self):
        """
        Test that the factory method creates router instances from modules.

        This validates the core Factory method pattern.
        """
        # Arrange
        factory = RouterFactory()
        mock_router = APIRouter()
        mock_module = MagicMock()
        mock_module.router = mock_router

        # Act
        with patch("importlib.import_module", return_value=mock_module):
            result = factory.create_router("users")

        # Assert
        assert result == mock_router

    def test_create_router_returns_none_when_module_has_no_router(self):
        """
        Test that the factory handles modules without router attribute.
        """
        # Arrange
        factory = RouterFactory()
        mock_module = MagicMock()
        del mock_module.router  # Module doesn't have router attribute

        # Act
        with patch("importlib.import_module", return_value=mock_module):
            with patch.object(mock_module, "__getattribute__", side_effect=AttributeError):
                with patch("hasattr", return_value=False):
                    result = factory.create_router("invalid")

        # Assert
        assert result is None

    def test_create_router_handles_import_errors(self):
        """
        Test that the factory handles import errors gracefully.
        """
        # Arrange
        factory = RouterFactory()

        # Act
        with patch("importlib.import_module", side_effect=ImportError("Module not found")):
            result = factory.create_router("nonexistent")

        # Assert
        assert result is None

    def test_register_router_adds_router_to_app(self):
        """
        Test that the factory registers routers with the FastAPI app.
        """
        # Arrange
        factory = RouterFactory()
        app = MagicMock(spec=FastAPI)
        router = APIRouter()

        # Act
        factory.register_router(app, router, prefix="/api/v1", tags=["test"])

        # Assert
        app.include_router.assert_called_once_with(
            router,
            prefix="/api/v1",
            tags=["test"]
        )
        assert router in factory.registered_routers

    def test_register_router_uses_default_prefix(self):
        """
        Test that the factory uses default prefix when none provided.
        """
        # Arrange
        factory = RouterFactory(api_prefix="/api/v2")
        app = MagicMock(spec=FastAPI)
        router = APIRouter()

        # Act
        factory.register_router(app, router)

        # Assert
        app.include_router.assert_called_once_with(
            router,
            prefix="/api/v2",
            tags=None
        )

    def test_register_all_routers_discovers_and_registers_all(self):
        """
        Test the complete factory workflow:
        1. Discover routers
        2. Create router instances
        3. Register with app

        This is an end-to-end test of the Factory pattern.
        """
        # Arrange
        factory = RouterFactory()
        app = MagicMock(spec=FastAPI)
        mock_router1 = APIRouter()
        mock_router2 = APIRouter()

        # Mock discovery
        with patch.object(factory, 'discover_routers', return_value=["users", "projects"]):
            # Mock creation
            with patch.object(factory, 'create_router', side_effect=[mock_router1, mock_router2]):
                # Act
                factory.register_all_routers(app, auto_discover=True)

        # Assert
        assert len(factory.registered_routers) == 2
        assert app.include_router.call_count == 2

    def test_configure_router_stores_custom_configuration(self):
        """
        Test that the factory can store custom configuration for specific routers.
        """
        # Arrange
        factory = RouterFactory()

        # Act
        factory.configure_router(
            "admin",
            prefix="/api/v1/admin",
            tags=["Admin"],
            include_in_schema=False
        )

        # Assert
        assert "admin" in factory._router_configs
        config = factory._router_configs["admin"]
        assert config.prefix == "/api/v1/admin"
        assert config.tags == ["Admin"]
        assert config.include_in_schema is False

    def test_register_all_routers_uses_custom_configuration(self):
        """
        Test that custom router configuration is applied during registration.
        """
        # Arrange
        factory = RouterFactory()
        app = MagicMock(spec=FastAPI)
        mock_router = APIRouter()

        # Configure custom settings for admin router
        factory.configure_router("admin", prefix="/api/v1/admin", tags=["Admin"])

        # Mock discovery and creation
        with patch.object(factory, 'discover_routers', return_value=["admin"]):
            with patch.object(factory, 'create_router', return_value=mock_router):
                # Act
                factory.register_all_routers(app)

        # Assert
        app.include_router.assert_called_once_with(
            mock_router,
            prefix="/api/v1/admin",
            tags=["Admin"]
        )

    def test_get_registered_routers_returns_copy(self):
        """
        Test that getting registered routers returns a copy,
        not the original list (encapsulation).
        """
        # Arrange
        factory = RouterFactory()
        router1 = APIRouter()
        router2 = APIRouter()
        factory.registered_routers = [router1, router2]

        # Act
        result = factory.get_registered_routers()
        result.append(APIRouter())  # Modify the returned list

        # Assert
        assert len(factory.registered_routers) == 2  # Original unchanged
        assert len(result) == 3  # Copy was modified


class TestCreateRouterFactory:
    """Test the convenience factory function"""

    def test_create_router_factory_returns_factory_instance(self):
        """
        Test that the convenience function creates a RouterFactory.
        """
        # Act
        factory = create_router_factory()

        # Assert
        assert isinstance(factory, RouterFactory)
        assert factory.routers_package == "routers"
        assert factory.api_prefix == "/api/v1"

    def test_create_router_factory_accepts_custom_parameters(self):
        """
        Test that the convenience function accepts custom parameters.
        """
        # Act
        factory = create_router_factory(
            routers_package="custom",
            api_prefix="/api/v2"
        )

        # Assert
        assert factory.routers_package == "custom"
        assert factory.api_prefix == "/api/v2"


class TestRouterConfig:
    """Test the RouterConfig class"""

    def test_router_config_initialization(self):
        """
        Test that RouterConfig stores configuration correctly.
        """
        # Act
        config = RouterConfig(
            module_name="admin",
            prefix="/api/v1/admin",
            tags=["Admin"],
            include_in_schema=False
        )

        # Assert
        assert config.module_name == "admin"
        assert config.prefix == "/api/v1/admin"
        assert config.tags == ["Admin"]
        assert config.include_in_schema is False


class TestFactoryPatternBenefits:
    """
    Tests that validate the benefits of the Factory pattern:
    - Auto-discovery
    - Centralized configuration
    - Easy to extend
    """

    def test_adding_new_router_requires_no_factory_changes(self):
        """
        Test that adding a new router doesn't require modifying the factory.

        This validates the Open/Closed Principle benefit of the Factory pattern.
        """
        # Arrange
        factory = RouterFactory()
        app = MagicMock(spec=FastAPI)

        # Create a new router file (mocked)
        new_router = APIRouter()
        mock_module = MagicMock()
        mock_module.router = new_router

        # Act - Factory automatically picks up the new router
        with patch.object(factory, 'discover_routers', return_value=["new_router"]):
            with patch("importlib.import_module", return_value=mock_module):
                factory.register_all_routers(app)

        # Assert - New router was registered without factory changes
        assert app.include_router.called
        assert new_router in factory.registered_routers

    def test_factory_ensures_consistent_configuration(self):
        """
        Test that all routers get consistent configuration by default.

        This validates the consistency benefit of the Factory pattern.
        """
        # Arrange
        factory = RouterFactory(api_prefix="/api/v1")
        app = MagicMock(spec=FastAPI)
        router1 = APIRouter()
        router2 = APIRouter()
        router3 = APIRouter()

        # Act
        factory.register_router(app, router1)
        factory.register_router(app, router2)
        factory.register_router(app, router3)

        # Assert - All use the same prefix
        for call in app.include_router.call_args_list:
            assert call[1]["prefix"] == "/api/v1"

    def test_factory_reduces_boilerplate_code(self):
        """
        Test that using the factory requires less code than manual registration.

        Before Factory: 26 lines (13 imports + 13 registrations)
        After Factory: 3 lines

        This is a conceptual test demonstrating the benefit.
        """
        # Arrange
        factory = create_router_factory()
        app = MagicMock(spec=FastAPI)

        # Act - Single call registers everything
        with patch.object(factory, 'discover_routers', return_value=[
            "users", "projects", "files", "roles", "permissions",
            "directories", "file_types", "file_versions",
            "notifications", "locks", "project_members",
            "project_invitations", "websocket_connections"
        ]):
            with patch.object(factory, 'create_router', return_value=APIRouter()):
                factory.register_all_routers(app)

        # Assert - All 13 routers registered with 1 call
        assert app.include_router.call_count == 13
        assert len(factory.registered_routers) == 13


class TestFactoryIntegration:
    """Integration tests for the Factory pattern"""

    def test_factory_works_with_real_fastapi_app(self):
        """
        Test that the factory integrates correctly with a real FastAPI app.
        """
        # Arrange
        app = FastAPI()
        factory = RouterFactory()
        test_router = APIRouter()
        test_router.get("/")(lambda: {"status": "ok"})

        # Act
        factory.register_router(app, test_router, prefix="/test")

        # Assert
        assert len(factory.registered_routers) == 1
        # In a real test, we would also check that routes are accessible

    @pytest.mark.parametrize("router_count", [1, 5, 10, 20])
    def test_factory_scales_with_many_routers(self, router_count):
        """
        Test that the factory handles many routers efficiently.

        This validates the scalability of the Factory pattern.
        """
        # Arrange
        factory = RouterFactory()
        app = MagicMock(spec=FastAPI)
        routers = [APIRouter() for _ in range(router_count)]

        # Act
        for router in routers:
            factory.register_router(app, router)

        # Assert
        assert len(factory.registered_routers) == router_count
        assert app.include_router.call_count == router_count
