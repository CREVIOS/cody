import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { Project, PaginatedResponse } from "./TypeDefinitions";

/**
 * Get all projects
 */
export const getProjects = async (
    skip: number = 0,
    limit: number = 100,
    ownerId?: string
  ): Promise<Project[]> => {
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString()
      });
      
      if (ownerId) params.append('owner_id', ownerId);
      
      const response = await fetch(`${API_BASE_URL}/api/v1/projects?${params}`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<Project> = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  };
  
  /**
   * Get a specific project by ID
   */
  export const getProjectById = async (projectId: string): Promise<Project> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching project:', error);
      throw error;
    }
  };
  
  /**
   * Delete a project
   */
  export const deleteProject = async (projectId: string): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  };

/**
 * Create a new project
 */
export const createProject = async (projectData: {
  project_name: string;
  description?: string;
  visibility?: string;
  project_settings?: Record<string, any>;
  owner_id: string;
}): Promise<Project> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(projectData),
    });

    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
};