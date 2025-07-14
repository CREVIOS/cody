import { API_BASE_URL, fetchWithRetry } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { ProjectMemberWithDetails, ProjectMember } from "./TypeDefinitions";

/**
 * Get project members with full user and role details by project ID
 */
export const getProjectMembers = async (projectId: string): Promise<ProjectMemberWithDetails[]> => {
    try {
      const response = await fetchWithRetry(
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
      // Return empty array instead of throwing to prevent UI breakage
      return [];
    }
  };

/**
 * Create a new project member
 */
export const createProjectMember = async (memberData: {
  project_id: string;
  user_id: string;
  role_id: string;
  invited_by?: string;
}): Promise<ProjectMember> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/project-members/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memberData),
    });

    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating project member:', error);
    throw error;
  }
};
  