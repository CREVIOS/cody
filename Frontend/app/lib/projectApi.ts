// Unified API functions for user, project, and invitation management
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

// Log the API base URL for debugging
console.log('API_BASE_URL:', API_BASE_URL);

// ==================== TYPE DEFINITIONS ====================

// User type (matching backend schema)
export interface User {
  user_id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  status: string;
  created_at: string;
  last_login_at?: string | null;
}

// Project type (matching backend schema)
export interface Project {
  project_id: string;
  project_name: string;
  description: string | null;
  visibility: string;
  created_at: string;
  modified_at: string | null;
  owner_id: string;
  is_active: boolean;
  project_settings?: Record<string, any>;
}

// Role type (matching backend schema)
export interface Role {
  role_id: string;
  role_name: string;
  description: string | null;
  permissions: Record<string, boolean>;
}

// Base ProjectInvitation type (matching backend schema)
export interface ProjectInvitation {
  invitation_id: string;
  project_id: string;
  email: string;
  user_id: string | null;
  role_id: string;
  invited_by: string;
  token: string;
  status: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

// ProjectInvitation with nested details (returned by by-email endpoint)
export interface ProjectInvitationWithDetails extends ProjectInvitation {
  project: Project;
  role: Role;
  inviter: User;
}

// ProjectMember type (returned when accepting invitation)
export interface ProjectMember {
  project_member_id: string;
  project_id: string;
  user_id: string;
  role_id: string;
  invited_by: string | null;
  joined_at: string;
  last_activity: string | null;
  is_active: boolean;
}

// ProjectMember with full details (for collaborators list)
export interface ProjectMemberWithDetails extends ProjectMember {
  user: User;
  role: Role;
  inviter?: User | null;
}

// Request types
export interface ProjectInvitationCreate {
  project_id: string;
  email: string;
  role_id: string;
  invited_by: string;
  user_id?: string | null;
  token?: string;
  expires_at?: string;
}

export interface ProjectInvitationUpdate {
  status?: string;
  user_id?: string;
  accepted_at?: string;
}

// Project with role information
export interface ProjectWithRole {
  project_id: string;
  project_name: string;
  description: string | null;
  visibility: string;
  created_at: string;
  modified_at: string | null;
  owner_id: string;
  is_active: boolean;
  project_settings?: Record<string, any>;
  role_id: string;
}

// User projects response
export interface UserProjectsResponse {
  items: ProjectWithRole[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// Paginated response type (matching backend)
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number;
}

// ==================== HELPER FUNCTIONS ====================

/**
 * Safely extract error message from API response
 */
const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const errorData = await response.json();
    if (typeof errorData === 'object' && errorData !== null) {
      // Handle array of errors (common in validation)
      if (Array.isArray(errorData)) {
        return errorData.map(err => typeof err === 'string' ? err : err.message || err.detail || JSON.stringify(err)).join(', ');
      }
      
      // Try different possible error message fields
      if (typeof errorData.detail === 'string') return errorData.detail;
      if (typeof errorData.message === 'string') return errorData.message;
      if (typeof errorData.error === 'string') return errorData.error;
      
      // Handle validation errors
      if (errorData.detail && Array.isArray(errorData.detail)) {
        return errorData.detail.map((err: any) => err.msg || err.message || JSON.stringify(err)).join(', ');
      }
      
      // Last resort: stringify the object
      return JSON.stringify(errorData);
    }
    return `HTTP error! status: ${response.status}`;
  } catch (parseError) {
    // If JSON parsing fails, return status-based error
    return `HTTP error! status: ${response.status}`;
  }
};

// ==================== USER API FUNCTIONS ====================

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

// ==================== INVITATION API FUNCTIONS ====================

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

// ==================== ROLE API FUNCTIONS ====================

/**
 * Get all available roles
 */
export const getRoles = async (): Promise<Role[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/roles`);
    
    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      throw new Error(errorMessage);
    }
    
    const data: PaginatedResponse<Role> = await response.json();
    return data.items || [];
  } catch (error) {
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

// ==================== PROJECT API FUNCTIONS ====================

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

// ==================== UTILITY FUNCTIONS ====================

/**
 * Test backend connection
 */
export const testBackendConnection = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/users?limit=1`);
    return response.ok;
  } catch (error) {
    console.error('Backend connection test failed:', error);
    return false;
  }
};

/**
 * Check if an invitation is valid (not expired and pending)
 */
export const isInvitationValid = (invitation: ProjectInvitation): boolean => {
  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  return invitation.status === 'pending' && expiresAt >= now;
};

/**
 * Format invitation expiry date for display
 */
export const formatExpiryDate = (expiresAt: string): string => {
  const date = new Date(expiresAt);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'Expired';
  if (diffDays === 0) return 'Expires today';
  if (diffDays === 1) return 'Expires tomorrow';
  return `Expires in ${diffDays} days`;
};

/**
 * Format date for display
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format datetime for display
 */
export const formatDateTime = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// ==================== PROJECT MEMBERS API FUNCTIONS ====================

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

/**
 * Get role permissions by role ID
 */
export const getRolePermissions = async (roleId: string): Promise<string[]> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/roles/${roleId}/permissions`
    );
    
    if (!response.ok) {
      const errorMessage = await getErrorMessage(response);
      throw new Error(errorMessage);
    }
    
    const roleData = await response.json();
    // Extract permissions array from the role data
    return roleData.permissions || [];
  } catch (error) {
    console.error('Error fetching role permissions:', error);
    throw error;
  }
};
