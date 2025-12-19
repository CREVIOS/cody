import { BaseAPITemplate, BaseAPITemplateSilentFail } from "./BaseAPITemplate";
import { ProjectMemberWithDetails, ProjectMember } from "./TypeDefinitions";

/**
 * Get project members with full user and role details by project ID
 */
export const getProjectMembers = async (projectId: string): Promise<ProjectMemberWithDetails[]> => {
  class GetProjectMembersCall extends BaseAPITemplateSilentFail<ProjectMemberWithDetails[]> {
    constructor(private projectId: string) {
      super();
    }

    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/project-members/by-project/${this.projectId}`;
    }

    protected buildOptions(): RequestInit {
      return { method: "GET" };
    }

    protected async parseResponse(response: Response): Promise<ProjectMemberWithDetails[]> {
      return response.json();
    }

    protected getFallbackValue(): ProjectMemberWithDetails[] {
      return [];
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error fetching project members:", message);
    }
  }

  return new GetProjectMembersCall(projectId).execute();
};

/**
 * Create a new project member
 */
export const createProjectMember = async (
  memberData: {
    project_id: string;
    user_id: string;
    role_id: string;
    invited_by?: string;
  },
  actorId: string
): Promise<ProjectMember> => {
  class CreateProjectMemberCall extends BaseAPITemplate<ProjectMember> {
    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/project-members/?actor_id=${encodeURIComponent(actorId)}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(memberData),
      };
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error creating project member:", message);
    }
  }

  return new CreateProjectMemberCall().execute();
};

/**
 * Update a project member (e.g., change role)
 */
export const updateProjectMember = async (
  memberId: string,
  memberUpdate: {
    role_id?: string;
    is_active?: boolean;
  },
  actorId: string
): Promise<ProjectMember> => {
  class UpdateProjectMemberCall extends BaseAPITemplate<ProjectMember> {
    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/project-members/${encodeURIComponent(memberId)}?actor_id=${encodeURIComponent(actorId)}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(memberUpdate),
      };
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error updating project member:", message);
    }
  }

  return new UpdateProjectMemberCall().execute();
};

/**
 * Delete a project member
 */
export const deleteProjectMember = async (
  memberId: string,
  actorId: string
): Promise<void> => {
  class DeleteProjectMemberCall extends BaseAPITemplate<void> {
    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/project-members/${encodeURIComponent(memberId)}?actor_id=${encodeURIComponent(actorId)}`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    protected async parseResponse(): Promise<void> {
      return;
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error deleting project member:", message);
    }
  }

  return new DeleteProjectMemberCall().execute();
};
  