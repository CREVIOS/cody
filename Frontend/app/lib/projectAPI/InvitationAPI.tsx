import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { ProjectInvitation, ProjectInvitationCreate, ProjectInvitationUpdate, ProjectInvitationWithDetails, PaginatedResponse } from "./TypeDefinitions";
import { findUserByEmail } from "./UserAPI";
import { ProjectMember } from "./TypeDefinitions";



/**
 * Get pending invitations for a user by email
 * Returns invitations with full project, role, and inviter details
 */
export const getPendingInvitationsByEmail = async (email: string): Promise<ProjectInvitationWithDetails[]> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-invitations/by-email/${encodeURIComponent(email)}`
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const invitations: ProjectInvitationWithDetails[] = await response.json();
      
      // Filter only pending invitations that haven't expired (server should already do this)
      const now = new Date();
      return invitations.filter(inv => {
        const expiresAt = new Date(inv.expires_at);
        return inv.status === 'pending' && expiresAt >= now;
      });
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
      throw error;
    }
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
    try {
      const params = new URLSearchParams({
        skip: skip.toString(),
        limit: limit.toString()
      });
      
      if (projectId) params.append('project_id', projectId);
      if (status) params.append('status', status);
      
      const response = await fetch(`${API_BASE_URL}/api/v1/project-invitations?${params}`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<ProjectInvitation> = await response.json();
      return data.items || [];
    } catch (error) {
      console.error('Error fetching project invitations:', error);
      throw error;
    }
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
    try {
      console.log('Creating invitation - input:', invitation);
      
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
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
  
      const url = `${API_BASE_URL}/api/v1/project-invitations`;
      
      console.log('Create invitation API call:', {
        url,
        method: 'POST',
        payload: invitationData
      });
  
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}` // Add token if you have auth
        },
        body: JSON.stringify(invitationData)
      });
      
      console.log('Create invitation response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating invitation:', error);
      throw error;
    }
  };
  
  /**
   * Accept an invitation
   * Creates a project member and deletes the invitation
   */
  export const acceptInvitation = async (invitationId: string, userId: string): Promise<ProjectMember> => {
    try {
      const url = `${API_BASE_URL}/api/v1/project-invitations/${invitationId}/accept`;
      const payload = { user_id: userId };
      
      console.log('Accept invitation API call:', {
        url,
        method: 'POST',
        payload,
        API_BASE_URL
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });
      
      console.log('Accept invitation response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error accepting invitation:', error);
      
      // Provide more specific error messages
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        throw new Error('Unable to connect to server. Please check if the backend is running and accessible.');
      }
      
      throw error;
    }
  };
  
  /**
   * Decline an invitation
   * Updates the invitation status to 'declined'
   */
  export const declineInvitation = async (invitationId: string): Promise<ProjectInvitation> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-invitations/${invitationId}/decline`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error declining invitation:', error);
      throw error;
    }
  };
  
  /**
   * Delete an invitation
   * Permanently removes the invitation from the database
   */
  export const deleteInvitation = async (invitationId: string): Promise<void> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-invitations/${invitationId}`,
        {
          method: 'DELETE'
        }
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Error deleting invitation:', error);
      throw error;
    }
  };
  
  /**
   * Get invitation by token
   * Used for invitation links
   */
  export const getInvitationByToken = async (token: string): Promise<ProjectInvitation> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-invitations/token/${encodeURIComponent(token)}`
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching invitation by token:', error);
      throw error;
    }
  };
  
  /**
   * Update an invitation
   * Can update status, user_id, or accepted_at
   */
  export const updateInvitation = async (
    invitationId: string,
    update: ProjectInvitationUpdate
  ): Promise<ProjectInvitation> => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/v1/project-invitations/${invitationId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(update)
        }
      );
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating invitation:', error);
      throw error;
    }
  };
  