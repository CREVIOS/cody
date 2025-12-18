import { BaseAPITemplate, BaseAPITemplateSilentFail } from "./BaseAPITemplate";
import {
  PaginatedResponse,
  ProjectInvitation,
  ProjectInvitationCreate,
  ProjectInvitationUpdate,
  ProjectInvitationWithDetails,
} from "./TypeDefinitions";
import { findUserByEmail } from "./UserAPI";
import { ProjectMember } from "./TypeDefinitions";



/**
 * Get pending invitations for a user by email
 * Returns invitations with full project, role, and inviter details
 */
export const getPendingInvitationsByEmail = async (email: string): Promise<ProjectInvitationWithDetails[]> => {
  class GetPendingInvitationsByEmailCall extends BaseAPITemplate<ProjectInvitationWithDetails[]> {
    constructor(private email: string) {
      super();
    }

    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/project-invitations/by-email/${encodeURIComponent(this.email)}`;
    }

    protected buildOptions(): RequestInit {
      return { method: "GET" };
    }

    protected async parseResponse(response: Response): Promise<ProjectInvitationWithDetails[]> {
      const invitations: ProjectInvitationWithDetails[] = await response.json();

      // Filter only pending invitations that haven't expired (server should already do this)
      const now = new Date();
      return invitations.filter((inv) => {
        const expiresAt = new Date(inv.expires_at);
        return inv.status === "pending" && expiresAt >= now;
      });
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error fetching pending invitations:", message);
    }
  }

  return new GetPendingInvitationsByEmailCall(email).execute();
};
  
  /**
   * Get all invitations for a specific project
   * Can filter by status
   */
  export const getProjectInvitations = async (
    projectId: string, 
    status?: string,
    skip: number = 0,
    limit: number = 100
  ): Promise<ProjectInvitation[]> => {
    class GetProjectInvitationsCall extends BaseAPITemplateSilentFail<ProjectInvitation[]> {
      protected buildURL(): string {
        const params = new URLSearchParams({
          skip: skip.toString(),
          limit: limit.toString(),
        });

        if (projectId) params.append("project_id", projectId);
        if (status) params.append("status", status);

        return `${this.getBaseURL()}/api/v1/project-invitations/?${params}`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      protected async parseResponse(response: Response): Promise<ProjectInvitation[]> {
        const data: PaginatedResponse<ProjectInvitation> = await response.json();
        return data.items || [];
      }

      protected getFallbackValue(): ProjectInvitation[] {
        return [];
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error fetching project invitations:", message);
      }
    }

    return new GetProjectInvitationsCall().execute();
  };
  
  /**
   * Create a new invitation
   * Automatically looks up user by email and sets expiration to 7 days
   */
  export const createInvitation = async (invitation: {
    project_id: string;
    email: string;
    role_id: string;
    invited_by: string;
  }): Promise<ProjectInvitation> => {
    console.log("Creating invitation - input:", invitation);

    // First find the user by email
    const user = await findUserByEmail(invitation.email);
    if (!user) {
      throw new Error(`No user found with email: ${invitation.email}`);
    }

    // Prepare invitation data with user_id
    const invitationData: ProjectInvitationCreate = {
      project_id: invitation.project_id,
      email: invitation.email,
      role_id: invitation.role_id,
      invited_by: invitation.invited_by,
      user_id: user.user_id, // Include the user_id from found user
      token: `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    class CreateInvitationCall extends BaseAPITemplate<ProjectInvitation> {
      protected buildURL(): string {
        const url = `${this.getBaseURL()}/api/v1/project-invitations/`;
        console.log("Create invitation API call:", {
          url,
          method: "POST",
          payload: invitationData,
        });
        return url;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Add token if you have auth
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify(invitationData),
        };
      }

      protected onSuccess(): void {
        // Keep existing debug logging behavior
        console.log("Create invitation succeeded");
      }

      protected async onError(message: string, response: Response): Promise<void> {
        console.error("Error creating invitation:", message, {
          status: response.status,
          statusText: response.statusText,
        });
      }
    }

    return new CreateInvitationCall().execute();
  };
  
  /**
   * Accept an invitation
   * Creates a project member and deletes the invitation
   */
  export const acceptInvitation = async (invitationId: string, userId: string): Promise<ProjectMember> => {
    const payload = { user_id: userId };

    class AcceptInvitationCall extends BaseAPITemplate<ProjectMember> {
      protected buildURL(): string {
        const url = `${this.getBaseURL()}/api/v1/project-invitations/${invitationId}/accept`;
        console.log("Accept invitation API call:", {
          url,
          method: "POST",
          payload,
        });
        return url;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        };
      }

      protected async onError(message: string, response: Response): Promise<void> {
        console.error("Error accepting invitation:", message, {
          status: response.status,
          statusText: response.statusText,
        });
      }
    }

    return new AcceptInvitationCall().execute();
  };
  
  /**
   * Decline an invitation
   * Updates the invitation status to 'declined'
   */
  export const declineInvitation = async (invitationId: string): Promise<ProjectInvitation> => {
    class DeclineInvitationCall extends BaseAPITemplate<ProjectInvitation> {
      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/project-invitations/${invitationId}/decline`;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error declining invitation:", message);
      }
    }

    return new DeclineInvitationCall().execute();
  };
  
  /**
   * Delete an invitation
   * Permanently removes the invitation from the database
   */
  export const deleteInvitation = async (invitationId: string): Promise<void> => {
    class DeleteInvitationCall extends BaseAPITemplate<void> {
      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/project-invitations/${invitationId}`;
      }

      protected buildOptions(): RequestInit {
        return { method: "DELETE" };
      }

      protected async parseResponse(): Promise<void> {
        return;
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error deleting invitation:", message);
      }
    }

    return new DeleteInvitationCall().execute();
  };
  
  /**
   * Get invitation by token
   * Used for invitation links
   */
  export const getInvitationByToken = async (token: string): Promise<ProjectInvitation> => {
    class GetInvitationByTokenCall extends BaseAPITemplate<ProjectInvitation> {
      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/project-invitations/token/${encodeURIComponent(token)}`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error fetching invitation by token:", message);
      }
    }

    return new GetInvitationByTokenCall().execute();
  };
  
  /**
   * Update an invitation
   * Can update status, user_id, or accepted_at
   */
  export const updateInvitation = async (
    invitationId: string,
    update: ProjectInvitationUpdate
  ): Promise<ProjectInvitation> => {
    class UpdateInvitationCall extends BaseAPITemplate<ProjectInvitation> {
      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/project-invitations/${invitationId}`;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(update),
        };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error updating invitation:", message);
      }
    }

    return new UpdateInvitationCall().execute();
  };
  