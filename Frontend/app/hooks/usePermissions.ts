import { useState, useEffect, useCallback, useRef } from 'react';
import { Permission, Permissions, DEFAULT_PERMISSIONS, CANONICAL_PERMISSIONS } from '@/types/permissions';
import { getRolePermissions } from '@/lib/projectAPI/RoleAPI';
import { getUserProjectPermissions } from '@/lib/projectAPI/PermissionsAPI';

/**
 * Permission Hook - Enforced Backend Strategy Pattern
 * 
 * This hook ensures all permission checks go through the backend's Strategy pattern
 * (defined in Backend/services/permission_strategies.py).
 * 
 * CRITICAL: When projectId and userId are provided, this hook ALWAYS uses the backend
 * Strategy pattern via /api/v1/permissions/projects/{projectId}?user_id={userId}.
 * 
 * The backend Strategy pattern:
 * - Correctly handles owners (via project.owner_id check)
 * - Uses role-specific permission strategies (OwnerPermissionStrategy, AdminPermissionStrategy, etc.)
 * - Ensures consistent permission evaluation across frontend and backend
 * 
 * Fallback to role-based permissions only occurs when BOTH projectId and userId are missing,
 * which should be rare in normal application flow.
 * 
 * Cache permissions by projectId+userId to avoid re-fetching
 */
// Global in-memory cache shared across hook instances.
// Key format:
// - `${projectId}:${userId}` for project-specific permissions
// - `role:${roleId}` for role-only fallback
const permissionsCache = new Map<string, Permissions>();

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
  // Compute the cache key up-front so we can use it for initial state as well.
  const getCacheKey = (pid?: string, uid?: string) => {
    return pid && uid ? `${pid}:${uid}` : '';
  };
  const projectUserCacheKey = getCacheKey(projectId, userId);
  const roleCacheKey = !projectUserCacheKey && roleId ? `role:${roleId}` : '';

  // Initialise from cache when possible so components don't flash "no permissions"
  // when reopening the same project or when multiple components share permissions.
  const [permissions, setPermissions] = useState<Permissions>(() => {
    if (projectUserCacheKey && permissionsCache.has(projectUserCacheKey)) {
      return permissionsCache.get(projectUserCacheKey)!;
    }
    if (roleCacheKey && permissionsCache.has(roleCacheKey)) {
      return permissionsCache.get(roleCacheKey)!;
    }
    return { ...DEFAULT_PERMISSIONS };
  });

  const [loading, setLoading] = useState<boolean>(() => {
    // Only show loading if we DON'T already have cached permissions
    if (projectUserCacheKey && permissionsCache.has(projectUserCacheKey)) {
      return false;
    }
    if (roleCacheKey && permissionsCache.has(roleCacheKey)) {
      return false;
    }
    return false;
  });
  const [error, setError] = useState<string | null>(null);
  const lastFetchedKey = useRef<string>('');

  const fetchPermissions = useCallback(async () => {
    const cacheKey = getCacheKey(projectId, userId);

    // If we already have cached permissions for this project/user, use them immediately
    // but still allow a background re-validation.
    if (cacheKey && permissionsCache.has(cacheKey)) {
      setPermissions(permissionsCache.get(cacheKey)!);
      setLoading(false);
    } else {
      // Only show loading spinner when we truly don't have anything cached yet
      setLoading(true);
    }

    setError(null);

    try {
      // CRITICAL: ALWAYS use backend Strategy pattern when projectId and userId are available
      // This ensures owners are handled correctly (they're identified by project.owner_id, not role_id)
      // The backend Strategy pattern evaluates permissions correctly for all roles including owners
      if (projectId && userId) {
        try {
          const resp = await getUserProjectPermissions(projectId, userId);
          if (resp && resp.permissions) {
            const fetchedPermissions = createPermissionsFromMap(resp.permissions);
            // Cache the permissions
            if (cacheKey) {
              permissionsCache.set(cacheKey, fetchedPermissions);
              lastFetchedKey.current = cacheKey;
            }
            setPermissions(fetchedPermissions);
            setLoading(false);
            return;
          } else {
            console.error('[usePermissions] Backend Strategy pattern returned invalid response:', resp);
            // Don't fall back - this is an error condition
            setError('Backend permission evaluation failed');
            setPermissions({ ...DEFAULT_PERMISSIONS });
            setLoading(false);
            return;
          }
        } catch (err) {
          console.error('[usePermissions] Failed to fetch permissions via backend Strategy pattern:', err);
          // CRITICAL: Do NOT fall back to role-based permissions when projectId/userId are available
          // This would bypass the Strategy pattern and could give incorrect permissions (especially for owners)
          setError('Failed to fetch permissions from backend');
          setPermissions({ ...DEFAULT_PERMISSIONS });
          setLoading(false);
          return;
        }
      }

      // ONLY use role-based fallback if projectId/userId are NOT available (edge case)
      // This should rarely happen in normal application flow
      // WARNING: This bypasses the Strategy pattern and may not handle owners correctly
      if (roleId && !projectId && !userId) {
        console.warn('[usePermissions] Using role-based fallback (bypasses Strategy pattern). projectId/userId should be provided for correct permission evaluation.', { projectId, userId, roleId });
        try {
          const result = await getRolePermissions(roleId);
          let fetchedPermissions: Permissions;
          if (Array.isArray(result)) {
            fetchedPermissions = createPermissionsFromArray(result);
          } else if (result && typeof result === 'object') {
            fetchedPermissions = createPermissionsFromMap(result as Record<string, any>);
          } else {
            fetchedPermissions = { ...DEFAULT_PERMISSIONS };
          }
          // Cache role-based permissions too (using roleId as key)
          const roleKey = `role:${roleId}`;
          permissionsCache.set(roleKey, fetchedPermissions);
          setPermissions(fetchedPermissions);
          setLoading(false);
          return;
        } catch (err) {
          console.error('[usePermissions] Failed to fetch role-based permissions (fallback):', err);
        }
      } else if (!projectId || !userId) {
        console.warn('[usePermissions] Missing projectId or userId. Cannot use backend Strategy pattern. Permissions may be incorrect.', { projectId, userId, roleId });
      }

      // If all failed, set default permissions (deny all)
      setPermissions({ ...DEFAULT_PERMISSIONS });
      setLoading(false);
    } catch (err) {
      console.error('Failed to load permissions:', err);
      setError('Failed to load permissions');
      setPermissions({ ...DEFAULT_PERMISSIONS });
      setLoading(false);
    }
  }, [projectId, userId, roleId]);

  // Fetch (or revalidate) when identifiers change.
  useEffect(() => {
    const cacheKey = getCacheKey(projectId, userId);

    // Prefer projectId/userId for backend Strategy pattern evaluation.
    if (cacheKey) {
      // Always ensure we have permissions for this project/user.
      // fetchPermissions() will use cache immediately if available,
      // otherwise it will call the backend and update cache/state.
      fetchPermissions();
      return;
    }

    // ONLY use role-based fallback if BOTH projectId and userId are missing.
    // This should rarely happen in normal flows.
    if (!cacheKey && roleId && !projectId && !userId) {
      const roleKey = `role:${roleId}`;
      if (permissionsCache.has(roleKey)) {
        setPermissions(permissionsCache.get(roleKey)!);
        setLoading(false);
      } else {
        fetchPermissions();
      }
      return;
    }

    // No identifiers at all – cannot evaluate permissions.
    if (!cacheKey && !roleId) {
      console.warn('[usePermissions] Cannot fetch permissions: missing projectId, userId, and roleId');
      setPermissions({ ...DEFAULT_PERMISSIONS });
      setLoading(false);
    }
  }, [projectId, userId, roleId, fetchPermissions]);

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
    refreshPermissions: async () => {
      // Clear cache and force refresh
      const cacheKey = getCacheKey(projectId, userId);
      if (cacheKey) {
        permissionsCache.delete(cacheKey);
        lastFetchedKey.current = '';
      }
      await fetchPermissions();
    },
  };
}