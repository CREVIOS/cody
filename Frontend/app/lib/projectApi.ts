// Project management API functions
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Project {
  id: string;
  name: string;
  lastModified: Date;
}

export interface ProjectApiResponse {
  success: boolean;
  projects?: Project[];
  error?: string;
}

export interface DeleteProjectResponse {
  success: boolean;
  message?: string;
  deletedObjects?: number;
  error?: string;
}

// List all projects
export const listProjects = async (): Promise<Project[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects`);
    const data: ProjectApiResponse = await response.json();
    
    if (data.success && data.projects) {
      return data.projects.map(project => ({
        ...project,
        lastModified: new Date(project.lastModified)
      }));
    } else {
      throw new Error(data.error || 'Failed to fetch projects');
    }
  } catch (error) {
    console.error('Error listing projects:', error);
    throw error;
  }
};

// Delete a project
export const deleteProject = async (projectId: string): Promise<DeleteProjectResponse> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE'
    });
    
    const data: DeleteProjectResponse = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
};

// Check if project exists
export const projectExists = async (projectId: string): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/exists`);
    const data = await response.json();
    
    if (data.success) {
      return data.exists;
    } else {
      throw new Error(data.error || 'Failed to check project existence');
    }
  } catch (error) {
    console.error('Error checking project existence:', error);
    return false;
  }
};

// Initialize a new project
export const initializeProject = async (projectId: string): Promise<void> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to initialize project');
    }
  } catch (error) {
    console.error('Error initializing project:', error);
    throw error;
  }
};
