"""
Factories Package

This package contains factory implementations following the Factory design pattern.
Factories centralize and simplify the creation and configuration of complex objects.
"""

from .router_factory import RouterFactory, create_router_factory, RouterConfig

__all__ = [
    "RouterFactory",
    "create_router_factory",
    "RouterConfig"
]
