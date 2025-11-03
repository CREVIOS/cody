import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { Role, PaginatedResponse } from "./TypeDefinitions";

/**
 * Get all available roles
 */
export const getRoles = async (): Promise<Role[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/roles`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<Role> = await response.json();
      return data.items || [];
    } catch (error) {
      // Handle network errors with a more helpful message
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const networkError = new Error(
          `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running on port 8000.`
        );
        console.error('Network error fetching roles:', networkError);
        throw networkError;
      }
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
   * Returns either a permissions map (preferred) or legacy array of keys.
   */
  export const getRolePermissions = async (roleId: string): Promise<Record<string, boolean> | string[]> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/roles/${roleId}/permissions`
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const roleData = await response.json();
      // Backend returns a role object with permissions: Record<string, boolean>
      // Fallback to [] for legacy cases
      return roleData.permissions || [];
    } catch (error) {
      console.error('Error fetching role permissions:', error);
      throw error;
    }
  };
  