import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { ProjectMemberWithDetails } from "./TypeDefinitions";

/**
 * Get project members with full user and role details by project ID
 */
export const getProjectMembers = async (projectId: string): Promise<ProjectMemberWithDetails[]> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-members/by-project/${projectId}`
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const members: ProjectMemberWithDetails[] = await response.json();
      return members;
    } catch (error) {
      console.error('Error fetching project members:', error);
      throw error;
    }
  };
  