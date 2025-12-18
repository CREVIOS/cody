import { BaseAPITemplate, BaseAPITemplateWithUser } from "./BaseAPITemplate";
import { Project, PaginatedResponse } from "./TypeDefinitions";

// ============================================================================
// GET PROJECTS - List all projects with pagination and optional filtering
// ============================================================================

class GetProjectsCall extends BaseAPITemplate<Project[]> {
  constructor(
    private skip: number,
    private limit: number,
    private ownerId?: string
  ) {
    super();
  }

  protected buildURL(): string {
    const params = new URLSearchParams({
      skip: this.skip.toString(),
      limit: this.limit.toString()
    });

    if (this.ownerId) {
      params.append('owner_id', this.ownerId);
    }

    return `${this.getBaseURL()}/api/v1/projects?${params}`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: 'GET'
    };
  }

  /**
   * Override parseResponse to extract items array from paginated response
   */
  protected async parseResponse(response: Response): Promise<Project[]> {
    const data: PaginatedResponse<Project> = await response.json();
    return data.items || [];
  }

  /**
   * Override onError to add context-specific logging
   */
  protected async onError(message: string, response: Response): Promise<void> {
    console.error('Error fetching projects:', message);
  }
}

/**
 * Get all projects
 */
export const getProjects = async (
  skip: number = 0,
  limit: number = 100,
  ownerId?: string
): Promise<Project[]> => {
  return new GetProjectsCall(skip, limit, ownerId).execute();
};

// ============================================================================
// GET PROJECT BY ID - Fetch a specific project
// ============================================================================

class GetProjectByIdCall extends BaseAPITemplate<Project> {
  constructor(private projectId: string) {
    super();
  }

  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/projects/${this.projectId}`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: 'GET'
    };
  }

  /**
   * Override onError to add context-specific logging
   */
  protected async onError(message: string, response: Response): Promise<void> {
    console.error('Error fetching project:', message);
  }
}

/**
 * Get a specific project by ID
 */
export const getProjectById = async (projectId: string): Promise<Project> => {
  return new GetProjectByIdCall(projectId).execute();
};

// ============================================================================
// DELETE PROJECT - Delete a project and invalidate cache
// ============================================================================

class DeleteProjectCall extends BaseAPITemplate<void> {
  constructor(private projectId: string) {
    super();
  }

  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/projects/${this.projectId}`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: 'DELETE'
    };
  }

  /**
   * Override parseResponse since DELETE returns no content
   */
  protected async parseResponse(response: Response): Promise<void> {
    // DELETE requests typically return no content
    return;
  }

  /**
   * Override onSuccess to invalidate cache after successful deletion
   */
  protected onSuccess(data: void, response: Response): void {
    this.invalidateCache('/projects');
  }

  /**
   * Override onError to add context-specific logging
   */
  protected async onError(message: string, response: Response): Promise<void> {
    console.error('Error deleting project:', message);
  }
}

/**
 * Delete a project
 */
export const deleteProject = async (projectId: string): Promise<void> => {
  return new DeleteProjectCall(projectId).execute();
};

// ============================================================================
// CREATE PROJECT - Create a new project with user context
// ============================================================================

interface CreateProjectData {
  project_name: string;
  description?: string;
  visibility?: string;
  project_settings?: Record<string, any>;
  owner_id: string;
}

class CreateProjectCall extends BaseAPITemplateWithUser<Project> {
  constructor(
    private projectData: CreateProjectData,
    userId: string | null
  ) {
    // BaseAPITemplateWithUser requires userId, default to empty string if null
    super(userId || '');
  }

  protected buildURL(): string {
    return `${this.getBaseURL()}/api/v1/projects/`;
  }

  protected buildOptions(): RequestInit {
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(this.projectData),
    };
  }

  /**
   * Override onSuccess to invalidate cache after successful creation
   */
  protected onSuccess(data: Project, response: Response): void {
    this.invalidateCache('/projects');
  }

  /**
   * Override onError to add context-specific logging
   */
  protected async onError(message: string, response: Response): Promise<void> {
    console.error('Error creating project:', message);
  }
}

/**
 * Create a new project
 * Example of using fetchWithUserId to automatically include user_id in requests
 *
 * Usage:
 *   import { useActiveUserId } from "@/hooks/useActiveUserId";
 *   const activeUserId = useActiveUserId();
 *   await createProject(projectData, activeUserId);
 */
export const createProject = async (
  projectData: CreateProjectData,
  userId: string | null
): Promise<Project> => {
  return new CreateProjectCall(projectData, userId).execute();
};