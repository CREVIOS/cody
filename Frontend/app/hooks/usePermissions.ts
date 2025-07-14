import { useState, useEffect, useCallback } from 'react';
import { Permission, Permissions, DEFAULT_PERMISSIONS } from '@/types/permissions';
import { getRolePermissions } from '@/lib/projectAPI/RoleAPI';

interface UsePermissionsProps {
  roleId: string | null;
}

interface UsePermissionsReturn {
  permissions: Permissions;
  loading: boolean;
  error: string | null;
  hasPermission: (permission: Permission) => boolean;
  refreshPermissions: () => Promise<void>;
}

export function usePermissions({ roleId }: UsePermissionsProps): UsePermissionsReturn {
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!roleId) {
      setPermissions(DEFAULT_PERMISSIONS);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const permissionsList = await getRolePermissions(roleId);
      
      // Convert array of permissions to permissions object
      const newPermissions = { ...DEFAULT_PERMISSIONS };
      
      // Handle both array and object formats
      if (Array.isArray(permissionsList)) {
        permissionsList.forEach((permission: string) => {
          if (permission in newPermissions) {
            (newPermissions as Record<string, boolean>)[permission] = true;
          }
        });
      } else if (typeof permissionsList === 'object' && permissionsList !== null) {
        Object.entries(permissionsList).forEach(([permission, value]) => {
          if (permission in newPermissions) {
            (newPermissions as Record<string, boolean>)[permission] = Boolean(value);
          }
        });
      }
      
      setPermissions(newPermissions);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError('Failed to load permissions');
      setPermissions(DEFAULT_PERMISSIONS);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  const hasPermission = (permission: Permission): boolean => {
    return permissions[permission];
  };

  return {
    permissions,
    loading,
    error,
    hasPermission,
    refreshPermissions: fetchPermissions,
  };
} 