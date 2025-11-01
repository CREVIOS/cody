import { useState, useEffect, useCallback } from 'react';
import { Permission, Permissions, DEFAULT_PERMISSIONS, CANONICAL_PERMISSIONS } from '@/types/permissions';
import { getRolePermissions } from '@/lib/projectAPI/RoleAPI';
import { getUserProjectPermissions } from '@/lib/projectAPI/PermissionsAPI';

interface UsePermissionsProps {
  roleId: string | null;
  projectId?: string;
  userId?: string;
}

interface UsePermissionsReturn {
  permissions: Permissions;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  getPermissionDetails: (permission: Permission) => { granted: boolean; reason: string };
  refreshPermissions: () => Promise<void>;
}

const LEGACY_TO_CANONICAL: Record<string, Permission> = {
  read: 'canView',
  write: 'canEdit',
  invite: 'canInvite',
  manage_members: 'canManageMembers',
  delete_project: 'canDeleteProject',
};

const createPermissionsFromMap = (source: Record<string, any> | undefined): Permissions => {
  const base: Permissions = { ...DEFAULT_PERMISSIONS };

  if (!source) {
    return base;
  }

  const assignValue = (key: string, value: unknown) => {
    const canonical = (LEGACY_TO_CANONICAL[key] ?? key) as Permission;
    if (CANONICAL_PERMISSIONS.includes(canonical)) {
      base[canonical] = Boolean(value);
    }
  };

  Object.entries(source).forEach(([key, value]) => assignValue(key, value));

  return base;
};

const createPermissionsFromArray = (permissions: string[]): Permissions => {
  const map: Record<string, boolean> = {};
  permissions.forEach((key) => {
    map[key] = true;
  });
  return createPermissionsFromMap(map);
};

export function usePermissions({ roleId, projectId, userId }: UsePermissionsProps): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<Permissions>({ ...DEFAULT_PERMISSIONS });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (projectId && userId) {
        try {
          const resp = await getUserProjectPermissions(projectId, userId);
          setPermissions(createPermissionsFromMap(resp.permissions));
          return;
        } catch (err) {
          console.warn('Falling back to role-based permissions:', err);
        }
      }

      if (!roleId) {
        setPermissions({ ...DEFAULT_PERMISSIONS });
        return;
      }

      const result = await getRolePermissions(roleId);
      if (Array.isArray(result)) {
        setPermissions(createPermissionsFromArray(result));
      } else if (result && typeof result === 'object') {
        setPermissions(createPermissionsFromMap(result as Record<string, any>));
      } else {
        setPermissions({ ...DEFAULT_PERMISSIONS });
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError('Failed to load permissions');
      setPermissions({ ...DEFAULT_PERMISSIONS });
    } finally {
      setLoading(false);
    }
  }, [projectId, userId, roleId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = useCallback(
    (permission: Permission) => Boolean(permissions[permission]),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (permissionList: Permission[]) => permissionList.some((permission) => permissions[permission]),
    [permissions]
  );

  const hasAllPermissions = useCallback(
    (permissionList: Permission[]) => permissionList.every((permission) => permissions[permission]),
    [permissions]
  );

  const getPermissionDetails = useCallback(
    (permission: Permission) => ({
      granted: Boolean(permissions[permission]),
      reason: permissions[permission]
        ? 'Granted by backend permission evaluation'
        : 'Not granted by backend permission evaluation',
    }),
    [permissions]
  );

  return {
    permissions,
    loading,
    error,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getPermissionDetails,
    refreshPermissions: fetchPermissions,
  };
}