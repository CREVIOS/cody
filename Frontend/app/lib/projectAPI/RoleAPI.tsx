import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { Role, PaginatedResponse } from "./TypeDefinitions";

/**
 * Get all available roles
 */
export const getRoles = async (): Promise<Role[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/roles`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<Role> = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching roles:', error);
      throw error;
    }
  };
  
  /**
   * Get a specific role by ID
   */
  export const getRoleById = async (roleId: string): Promise<Role> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/roles/${roleId}`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching role:', error);
      throw error;
    }
  };
  
  /**
   * Get role permissions by role ID
   */
  export const getRolePermissions = async (roleId: string): Promise<string[]> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/roles/${roleId}/permissions`
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const roleData = await response.json();
      // Extract permissions array from the role data
      return roleData.permissions || [];
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      throw error;
    }
  };
  