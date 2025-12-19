import { BaseAPITemplate } from "./BaseAPITemplate";
import { PaginatedResponse, Role } from "./TypeDefinitions";

class GetRolesCall extends BaseAPITemplate<Role[]> {
  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/roles`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };
  }

  protected async parseResponse(response: Response): Promise<Role[]> {
    const data: PaginatedResponse<Role> = await response.json();
    return data.items || [];
  }

  protected async onError(message: string): Promise<void> {
    console.error("Error fetching roles:", message);
  }
}

/**
 * Get all available roles
 */
export const getRoles = async (): Promise<Role[]> => {
  return new GetRolesCall().execute();
};
  
  /**
   * Get a specific role by ID
   */
class GetRoleByIdCall extends BaseAPITemplate<Role> {
  constructor(private roleId: string) {
    super();
  }

  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/roles/${this.roleId}`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: "GET",
    };
  }

  protected async onError(message: string): Promise<void> {
    console.error("Error fetching role:", message);
  }
}

export const getRoleById = async (roleId: string): Promise<Role> => {
  return new GetRoleByIdCall(roleId).execute();
};
  
  /**
   * Get role permissions by role ID
   * Returns either a permissions map (preferred) or legacy array of keys.
   */
class GetRolePermissionsCall extends BaseAPITemplate<Record<string, boolean> | string[]> {
  constructor(private roleId: string) {
    super();
  }

  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/roles/${this.roleId}/permissions`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: "GET",
    };
  }

  protected async parseResponse(response: Response): Promise<Record<string, boolean> | string[]> {
    const roleData = await response.json();
    // Backend returns a role object with permissions: Record<string, boolean>
    // Fallback to [] for legacy cases
    return roleData.permissions || [];
  }

  protected async onError(message: string): Promise<void> {
    console.error("Error fetching role permissions:", message);
  }
}

export const getRolePermissions = async (
  roleId: string
): Promise<Record<string, boolean> | string[]> => {
  return new GetRolePermissionsCall(roleId).execute();
};
  