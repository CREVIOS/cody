'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Role } from '@/lib/projectAPI/TypeDefinitions';
import { getRoles, getRolePermissions } from '@/lib/projectAPI/RoleAPI';
import { CANONICAL_PERMISSIONS, Permission } from '@/types/permissions';

interface RoleWithPermissions extends Role {
  permissions: Record<Permission, boolean>;
}

interface RolesContextType {
  roles: RoleWithPermissions[];
  getRoleById: (roleId: string) => RoleWithPermissions | undefined;
  getRoleNameById: (roleId: string) => string;
  hasPermission: (roleId: string, permission: Permission) => boolean;
  loading: boolean;
  error: string | null;
}

const RolesContext = createContext<RolesContextType | undefined>(undefined);

export function RolesProvider({ children }: { children: ReactNode }) {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRolesAndPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        const fetchedRoles = await getRoles();

        const rolesWithPermissions = await Promise.all(
          fetchedRoles.map(async (role) => {
            const permissions = await getRolePermissions(role.role_id);

            const permissionsMap = mapRolePermissions(permissions);

            return {
              ...role,
              permissions: permissionsMap
            };
          })
        );
        setRoles(rolesWithPermissions);
      } catch (err) {
        console.error('Failed to fetch roles and permissions:', err);
        // Provide more specific error message
        const errorMessage = err instanceof Error 
          ? err.message 
          : 'Failed to load roles and permissions';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    fetchRolesAndPermissions();
  }, []);

  const getRoleById = (roleId: string) => {
    if (!roleId) {
      console.warn('getRoleById called with empty roleId');
      return undefined;
    }
    const role = roles.find(role => role.role_id === roleId);
    if (!role) {
      console.warn(`Role not found for ID: ${roleId}`);
    }
    return role;
  };

  const getRoleNameById = (roleId: string) => {
    if (!roleId) {
      console.warn('getRoleNameById called with empty roleId');
      return 'Unknown Role';
    }
    const role = getRoleById(roleId);
    if (!role) {
      console.warn(`Role name not found for ID: ${roleId}`);
      return 'Unknown Role';
    }
    return role.role_name;
  };

  const hasPermission = (roleId: string, permission: Permission) => {
    const role = getRoleById(roleId);
    return !!role?.permissions[permission];
  };

  const value = {
    roles,
    getRoleById,
    getRoleNameById,
    hasPermission,
    loading,
    error
  };

  return (
    <RolesContext.Provider value={value}>
      {children}
    </RolesContext.Provider>
  );
}

export function useRoles() {
  const context = useContext(RolesContext);
  if (context === undefined) {
    throw new Error('useRoles must be used within a RolesProvider');
  }
  return context;
} 

const LEGACY_TO_CANONICAL: Record<string, Permission> = {
  read: 'canView',
  write: 'canEdit',
  invite: 'canInvite',
  manage_members: 'canManageMembers',
  delete_project: 'canDeleteProject',
};

const mapRolePermissions = (raw: unknown): Record<Permission, boolean> => {
  const base = CANONICAL_PERMISSIONS.reduce((acc, permission) => {
    acc[permission] = false;
    return acc;
  }, {} as Record<Permission, boolean>);

  if (!raw) {
    return base;
  }

  const assign = (key: string, value: unknown) => {
    const canonical = (LEGACY_TO_CANONICAL[key] ?? key) as Permission;
    if (CANONICAL_PERMISSIONS.includes(canonical)) {
      base[canonical] = Boolean(value);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach((key) => assign(String(key), true));
  } else if (typeof raw === 'object') {
    Object.entries(raw as Record<string, unknown>).forEach(([key, value]) => assign(key, value));
  }

  return base;
};