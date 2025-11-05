"""
Factory Pattern for Router Initialization

This module implements the Factory pattern to automate the discovery and
registration of API routers in the FastAPI application.

Design Pattern: Factory
Purpose: Centralize and automate the creation and configuration of API routers
Benefits:
    - Eliminates repetitive router registration code in main.py
    - Auto-discovery: New routers are automatically picked up
    - Configuration consistency: All routers get same prefix/tags
    - Easier testing: Can create router instances with different configurations
    - Single Responsibility: Router registration logic is separated from app setup
"""

import importlib
import inspect
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, APIRouter
import logging

logger = logging.getLogger(__name__)


class RouterConfig:
    """Configuration for a router."""

    def __init__(
        self,
        module_name: str,
        prefix: str = "/api/v1",
        tags: Optional[List[str]] = None,
        include_in_schema: bool = True
    ):
        self.module_name = module_name
        self.prefix = prefix
        self.tags = tags or []
        self.include_in_schema = include_in_schema


class RouterFactory:
    """
    Factory class for creating and registering API routers.

    This is the core of the Factory pattern - it centralizes the creation
    and configuration of router objects, hiding the complexity of
    discovery and registration from the main application.
    """

    def __init__(self, routers_package: str = "routers", api_prefix: str = "/api/v1"):
        """
        Initialize the router factory.

        Args:
            routers_package: Package name containing router modules (default: "routers")
            api_prefix: Default prefix for all routes (default: "/api/v1")
        """
        self.routers_package = routers_package
        self.api_prefix = api_prefix
        self.registered_routers: List[APIRouter] = []
        self._router_configs: Dict[str, RouterConfig] = {}

    def discover_routers(self) -> List[str]:
        """
        Auto-discover all router modules in the routers package.

        Returns:
            List of module names that contain routers

        Example:
            ['users', 'projects', 'files', 'roles', ...]
        """
        routers_path = Path(self.routers_package)

        if not routers_path.exists():
            logger.warning(f"Routers directory not found: {routers_path}")
            return []

        router_modules = []

        for file_path in routers_path.glob("*.py"):
            if file_path.name.startswith("_"):
                continue  # Skip __init__.py and private modules

            module_name = file_path.stem
            router_modules.append(module_name)

        logger.info(f"Discovered {len(router_modules)} router modules: {router_modules}")
        return router_modules

    def create_router(self, module_name: str) -> Optional[APIRouter]:
        """
        Create a router instance from a module name.

        This is the factory method - it creates router objects based on
        the module name, handling all the import and instantiation logic.

        Args:
            module_name: Name of the module in the routers package

        Returns:
            APIRouter instance or None if not found

        Example:
            router = factory.create_router("users")
            # Returns the router from routers.users module
        """
        try:
            # Import the module
            full_module_name = f"{self.routers_package}.{module_name}"
            module = importlib.import_module(full_module_name)

            # Look for 'router' attribute (standard naming convention)
            if hasattr(module, "router"):
                router = getattr(module, "router")

                if isinstance(router, APIRouter):
                    logger.info(f"Created router from module: {module_name}")
                    return router
                else:
                    logger.warning(f"Module {module_name} has 'router' but it's not an APIRouter")
                    return None
            else:
                logger.warning(f"Module {module_name} does not have a 'router' attribute")
                return None

        except Exception as e:
            logger.error(f"Error creating router from module {module_name}: {e}")
            return None

    def register_router(
        self,
        app: FastAPI,
        router: APIRouter,
        prefix: Optional[str] = None,
        tags: Optional[List[str]] = None
    ):
        """
        Register a router with the FastAPI application.

        Args:
            app: FastAPI application instance
            router: APIRouter to register
            prefix: URL prefix for the router (default: self.api_prefix)
            tags: OpenAPI tags for the router
        """
        final_prefix = prefix or self.api_prefix

        app.include_router(
            router,
            prefix=final_prefix,
            tags=tags
        )

        self.registered_routers.append(router)
        logger.info(f"Registered router with prefix: {final_prefix}")

    def register_all_routers(self, app: FastAPI, auto_discover: bool = True):
        """
        Discover and register all routers with the FastAPI application.

        This is the main factory method that orchestrates the entire
        router creation and registration process.

        Args:
            app: FastAPI application instance
            auto_discover: If True, automatically discover routers (default: True)

        Example:
            factory = RouterFactory()
            factory.register_all_routers(app)
            # All routers in the 'routers' package are now registered
        """
        if auto_discover:
            router_modules = self.discover_routers()
        else:
            router_modules = list(self._router_configs.keys())

        registered_count = 0

        for module_name in router_modules:
            router = self.create_router(module_name)

            if router:
                # Get custom configuration if exists
                config = self._router_configs.get(module_name)

                if config:
                    self.register_router(
                        app,
                        router,
                        prefix=config.prefix,
                        tags=config.tags
                    )
                else:
                    # Use default configuration
                    self.register_router(app, router)

                registered_count += 1

        logger.info(f"Successfully registered {registered_count} routers")

    def configure_router(
        self,
        module_name: str,
        prefix: Optional[str] = None,
        tags: Optional[List[str]] = None,
        include_in_schema: bool = True
    ):
        """
        Add custom configuration for a specific router.

        This allows fine-grained control over router settings while
        still using the factory pattern.

        Args:
            module_name: Name of the router module
            prefix: Custom prefix for this router
            tags: Custom tags for this router
            include_in_schema: Whether to include in OpenAPI schema

        Example:
            factory.configure_router("admin", prefix="/api/v1/admin", tags=["Admin"])
            factory.configure_router("public", prefix="/public", tags=["Public"])
        """
        self._router_configs[module_name] = RouterConfig(
            module_name=module_name,
            prefix=prefix or self.api_prefix,
            tags=tags,
            include_in_schema=include_in_schema
        )

    def get_registered_routers(self) -> List[APIRouter]:
        """
        Get list of all registered routers.

        Returns:
            List of registered APIRouter instances
        """
        return self.registered_routers.copy()


def create_router_factory(
    routers_package: str = "routers",
    api_prefix: str = "/api/v1"
) -> RouterFactory:
    """
    Convenience function to create a RouterFactory instance.

    This is a simplified factory function for creating the factory itself.

    Args:
        routers_package: Package containing router modules
        api_prefix: Default API prefix

    Returns:
        Configured RouterFactory instance

    Example:
        factory = create_router_factory()
        factory.register_all_routers(app)
    """
    return RouterFactory(routers_package=routers_package, api_prefix=api_prefix)
