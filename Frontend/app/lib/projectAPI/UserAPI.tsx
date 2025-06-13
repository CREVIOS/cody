import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { User, PaginatedResponse, UserProjectsResponse } from "./TypeDefinitions";
import { getRoles } from "./RoleAPI";
import { Project } from "./TypeDefinitions";


/**
 * List all users
 */
export const listUsers = async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<User> = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error listing users:', error);
      throw error;
    }
  };
  
  /**
   * Find user by email
   * Note: This is a workaround since the backend doesn't have email filtering
   * In production, add email filtering to the backend API
   */
  export const findUserByEmail = async (email: string): Promise<User | null> => {
    try {
      if (!API_BASE_URL) {
        throw new Error('API_BASE_URL is not configured');
      }
  
      // Get all users and filter by email (temporary solution until backend endpoint is ready)
      const response = await fetch(`${API_BASE_URL}/api/v1/users`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` // Add token if you have auth
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const users = data.items || [];
      const user = users.find((u: User) => u.email.toLowerCase() === email.toLowerCase());
      
      if (!user) {
        console.log('No user found with email:', email);
        return null;
      }
  
      console.log('Found user:', user);
      return user;
    } catch (error) {
      console.error('Error finding user by email:', error);
      throw error; // Let the caller handle the error
    }
  };
  
  /**
   * Get user's all projects (owned and member)
   */
  export const getUserProjects = async (userId: string): Promise<UserProjectsResponse> => {
    try {
      // First get all roles to find the owner role ID
      const roles = await getRoles();
      const ownerRole = roles.find(role => role.role_name.toLowerCase() === 'owner');
      if (!ownerRole) {
        throw new Error('Owner role not found in the system');
      }
  
      const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}/all-projects`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('API Response:', data); // Debug log
      
      // Transform the response to match expected structure
      const allProjects = [
        // Handle owned projects
        ...(data.owned_projects || []).map((project: Project) => ({
          ...project,
          role_id: ownerRole.role_id
        })),
        // Handle member projects
        ...(data.member_projects || []).map((memberProject: { project: Project; role: string }) => {
          // Find the role ID that matches the role name
          const roleId = roles.find(r => r.role_name.toLowerCase() === memberProject.role.toLowerCase())?.role_id;
          if (!roleId) {
            console.warn(`Role not found for name: ${memberProject.role}`);
          }
          return {
            ...memberProject.project,
            role_id: roleId || 'unknown'
          };
        })
      ];
  
      console.log('Transformed projects:', allProjects); // Debug log
  
      return {
        items: allProjects,
        total: allProjects.length,
        page: 1,
        size: allProjects.length,
        pages: 1
      };
    } catch (error) {
      console.error('Error fetching user projects:', error);
      throw error;
    }
  };
  