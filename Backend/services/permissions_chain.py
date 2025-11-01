from typing import Dict, Any, Optional, List


# Canonical permission keys stored in the Roles.permissions JSONB
KNOWN_PERMISSIONS: List[str] = [
    "canEdit",
    "canLock",
    "canView",
    "canInvite",
    "canApproveLock",
    "canRequestLock",
    "canDeleteProject",
    "canManageMembers",
]


class PermissionRequest:
    def __init__(
        self,
        *,
        permission: str,
        role_name: str,
        role_permissions: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.permission = permission
        self.role_name = role_name
        self.role_permissions = role_permissions or {}
        self.context = context or {}


class PermissionResult:
    def __init__(self, granted: bool, reason: Optional[str] = None, handled_by: Optional[str] = None) -> None:
        self.granted = granted
        self.reason = reason
        self.handled_by = handled_by


class PermissionHandler:
    def __init__(self) -> None:
        self._next: Optional["PermissionHandler"] = None

    def set_next(self, handler: "PermissionHandler") -> "PermissionHandler":
        self._next = handler
        return handler

    def handle(self, request: PermissionRequest) -> PermissionResult:
        result = self.check_permission(request)
        if result.granted or self._next is None:
            return result
        return self._next.handle(request)

    def check_permission(self, request: PermissionRequest) -> PermissionResult:
        raise NotImplementedError


class OwnerPermissionHandler(PermissionHandler):
    def check_permission(self, request: PermissionRequest) -> PermissionResult:
        if request.role_name.lower() == "owner":
            return PermissionResult(True, reason="Owner has full access to all features", handled_by="OwnerPermissionHandler")
        return PermissionResult(False)


class RolePermissionsHandler(PermissionHandler):
    def check_permission(self, request: PermissionRequest) -> PermissionResult:
        if request.permission in request.role_permissions:
            value = bool(request.role_permissions.get(request.permission))
            return PermissionResult(
                value,
                reason=(
                    f"Role '{request.role_name}' {'has' if value else 'does not have'} {request.permission} permission"
                ),
                handled_by="RolePermissionsHandler",
            )
        return PermissionResult(False)


class DefaultDenyHandler(PermissionHandler):
    def check_permission(self, request: PermissionRequest) -> PermissionResult:
        return PermissionResult(False, reason=f"Unknown role/permission - access denied for {request.permission}", handled_by="DefaultDenyHandler")


class PermissionChain:
    def __init__(self) -> None:
        self._chain = self._build_chain()

    def _build_chain(self) -> PermissionHandler:
        owner = OwnerPermissionHandler()
        role_permissions = RolePermissionsHandler()
        default_deny = DefaultDenyHandler()

        owner.set_next(role_permissions).set_next(default_deny)
        return owner

    def has_permission(
        self,
        *,
        permission: str,
        role_name: str,
        role_permissions: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> PermissionResult:
        req = PermissionRequest(
            permission=permission,
            role_name=role_name,
            role_permissions=role_permissions,
            context=context,
        )
        return self._chain.handle(req)

    def compute_permissions_map(
        self,
        *,
        role_name: str,
        role_permissions: Dict[str, Any],
        permissions: Optional[List[str]] = None,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, bool]:
        keys = permissions or KNOWN_PERMISSIONS
        result: Dict[str, bool] = {}
        for key in keys:
            res = self.has_permission(
                permission=key,
                role_name=role_name,
                role_permissions=role_permissions,
                context=context,
            )
            result[key] = bool(res.granted)
        return result


# Singleton instance for convenience
permission_chain = PermissionChain()


