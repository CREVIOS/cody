'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Role } from '@/lib/projectAPI/TypeDefinitions';
import { getRoles, getRolePermissions } from '@/lib/projectAPI/RoleAPI';

interface Permission {
  permission_name: string;
}

interface RoleWithPermissions extends Role {
  permissions: Record<string, boolean>;
}

interface RolesContextType {
  roles: RoleWithPermissions[];
  getRoleById: (roleId: string) => RoleWithPermissions | undefined;
  getRoleNameById: (roleId: string) => string;
  hasPermission: (roleId: string, permission: string) => boolean;
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

        // Fetch roles
        const fetchedRoles = await getRoles();
        console.log('Fetched roles:', fetchedRoles); // Debug log

        // Fetch permissions for each role
        const rolesWithPermissions = await Promise.all(
          fetchedRoles.map(async (role) => {
            const permissions = await getRolePermissions(role.role_id);
            console.log(`Permissions for role ${role.role_name}:`, permissions); // Debug log
            
            const permissionsMap = Array.isArray(permissions) 
              ? permissions.reduce((acc, p) => ({ ...acc, [p]: true }), {} as Record<string, boolean>)
              : {};
            
            return {
              ...role,
              permissions: permissionsMap
            };
          })
        );

        console.log('Roles with permissions:', rolesWithPermissions); // Debug log
        setRoles(rolesWithPermissions);
      } catch (err) {
        console.error('Failed to fetch roles and permissions:', err);
        setError('Failed to load roles and permissions');
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

  const hasPermission = (roleId: string, permission: string) => {
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