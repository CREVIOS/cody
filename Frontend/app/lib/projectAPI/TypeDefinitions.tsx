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
    project_settings?: Record<string, unknown>;
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
    project_settings?: Record<string, unknown>;
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