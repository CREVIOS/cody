'use client';

import { ReactNode, useMemo } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Permission } from '@/types/permissions';

interface PermissionGateProps {
  roleId: string | null;
  projectId?: string;
  userId?: string;
  permission: Permission | Permission[];
  mode?: 'any' | 'all';
  fallback?: ReactNode;
  children: ReactNode;
}

export default function PermissionGate({
  roleId,
  projectId,
  userId,
  permission,
  mode = 'any',
  fallback = null,
  children,
}: PermissionGateProps) {
  const { loading, hasAnyPermission, hasAllPermissions, permissions } = usePermissions({ roleId, projectId, userId });

  const allowed = useMemo(() => {
    const permissions = Array.isArray(permission) ? permission : [permission];
    return mode === 'all' ? hasAllPermissions(permissions) : hasAnyPermission(permissions);
  }, [permission, mode, hasAnyPermission, hasAllPermissions]);

  // If we have cached permissions (not loading), show immediately
  // Only wait for loading if we don't have any permissions yet
  if (loading && Object.values(permissions).every(v => v === false)) {
    return null;
  }
  return allowed ? <>{children}</> : <>{fallback}</>;
}

