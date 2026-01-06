import { BaseAPITemplate } from "./BaseAPITemplate";
import { User, PaginatedResponse, UserProjectsResponse } from "./TypeDefinitions";
import { getRoles } from "./RoleAPI";
import { Project } from "./TypeDefinitions";


/**
 * List all users
 */
export const listUsers = async (): Promise<User[]> => {
  class ListUsersCall extends BaseAPITemplate<User[]> {
    protected buildURL(): string {
      return `${this.getBaseURL()}/api/v1/users`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      };
    }

    protected async parseResponse(response: Response): Promise<User[]> {
      const data: PaginatedResponse<User> = await response.json();
      return data.items || [];
    }

    protected async onError(message: string): Promise<void> {
      console.error("Error listing users:", message);
    }
  }

  return new ListUsersCall().execute();
};
  
  /**
   * Find user by email
   * Note: This is a workaround since the backend doesn't have email filtering
   * In production, add email filtering to the backend API
   */
  export const findUserByEmail = async (email: string): Promise<User | null> => {
    class FindUserByEmailCall extends BaseAPITemplate<User | null> {
      constructor(private email: string) {
        super();
      }

      protected buildURL(): string {
        const baseUrl = this.getBaseURL();
        // When API_BASE_URL is empty in the browser, use relative URL for Next.js rewrites.
        return baseUrl ? `${baseUrl}/api/v1/users` : `/api/v1/users`;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            // Add token if you have auth
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        };
      }

      protected async parseResponse(response: Response): Promise<User | null> {
        const data: PaginatedResponse<User> = await response.json();
        const users = data.items || [];
        const user = users.find((u: User) => u.email.toLowerCase() === this.email.toLowerCase());

        if (!user) {
          console.log("No user found with email:", this.email);
          return null;
        }

        console.log("Found user:", user);
        return user;
      }

      /**
       * Preserve the previous behavior: non-OK throws status-based error (not getErrorMessage()).
       */
      protected async getErrorMessage(response: Response): Promise<string> {
        return `HTTP error! status: ${response.status}`;
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error finding user by email:", message);
      }
    }

    return new FindUserByEmailCall(email).execute();
  };
  
    /**
   * Get user's all projects (owned and member)
   */
  export const getUserProjects = async (userId: string): Promise<UserProjectsResponse> => {
    // First get all roles to find the owner role ID
    const roles = await getRoles();
    const ownerRole = roles.find((role) => role.role_name.toLowerCase() === "owner");
    if (!ownerRole) {
      throw new Error("Owner role not found in the system");
    }
    const ownerRoleId = ownerRole.role_id;

    type RawUserProjectsResponse = {
      owned_projects?: Project[];
      member_projects?: Array<{ project: Project; role: string }>;
    };

    class GetUserProjectsCall extends BaseAPITemplate<UserProjectsResponse> {
      constructor(private userId: string) {
        super();
      }

      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/users/${this.userId}/all-projects`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      /**
       * Preserve the previous behavior: status-based error (not getErrorMessage()).
       */
      protected async getErrorMessage(response: Response): Promise<string> {
        return `HTTP error! status: ${response.status}`;
      }

      protected async parseResponse(response: Response): Promise<UserProjectsResponse> {
        const data: RawUserProjectsResponse = await response.json();
        console.log("API Response:", data); // Debug log

        // Transform the response to match expected structure
        const allProjects = [
          // Handle owned projects
          ...(data.owned_projects || []).map((project: Project) => ({
            ...project,
            role_id: ownerRoleId,
          })),
          // Handle member projects
          ...(data.member_projects || []).map((memberProject) => {
            // Find the role ID that matches the role name
            const roleId = roles.find(
              (r) => r.role_name.toLowerCase() === memberProject.role.toLowerCase()
            )?.role_id;
            if (!roleId) {
              console.warn(`Role not found for name: ${memberProject.role}`);
            }
            return {
              ...memberProject.project,
              role_id: roleId || "unknown",
            };
          }),
        ];

        console.log("Transformed projects:", allProjects); // Debug log

        return {
          items: allProjects,
          total: allProjects.length,
          page: 1,
          size: allProjects.length,
          pages: 1,
        };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error fetching user projects:", message);
      }
    }

    return new GetUserProjectsCall(userId).execute();
  };

  /**
   * Get user by ID
   */
  export const getUser = async (userId: string): Promise<User> => {
    class GetUserCall extends BaseAPITemplate<User> {
      constructor(private userId: string) {
        super();
      }

      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/users/${this.userId}`;
      }

      protected buildOptions(): RequestInit {
        return { method: "GET" };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error fetching user:", message);
      }
    }

    return new GetUserCall(userId).execute();
  };

  /**
   * Get user by ID with retry logic for auth mode
   * Retries multiple times with increasing delays if user is not found (handles trigger timing)
   * This should ONLY be used for authenticated users (auth mode)
   * DO NOT use this for demo mode
   */
  export const getUserWithRetry = async (
    userId: string,
    maxRetries: number = 3,
    initialDelayMs: number = 500
  ): Promise<User> => {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await getUser(userId);
      } catch (error: any) {
        lastError = error;
        
        // Only retry on 404 (user not found) - likely trigger timing issue
        const isNotFound = error.message?.includes('not found') || 
                          error.message?.includes('404') ||
                          error.message?.includes('User not found');
        
        if (isNotFound && attempt < maxRetries) {
          const delay = initialDelayMs * Math.pow(2, attempt); // Exponential backoff: 500ms, 1000ms, 2000ms
          console.log(`User not found (attempt ${attempt + 1}/${maxRetries + 1}), retrying after ${delay}ms (trigger timing)...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // If not 404 or out of retries, throw immediately
        throw error;
      }
    }
    
    // Should never reach here, but TypeScript needs it
    throw lastError;
  };

  /**
   * Update user profile
   */
  export interface UserUpdateData {
    username?: string;
    email?: string;
    full_name?: string;
    avatar_url?: string;
    status?: string;
  }

  export const updateUser = async (userId: string, updateData: UserUpdateData): Promise<User> => {
    class UpdateUserCall extends BaseAPITemplate<User> {
      constructor(
        private userId: string,
        private updateData: UserUpdateData
      ) {
        super();
      }

      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/users/${this.userId}`;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.updateData),
        };
      }

      protected async onError(message: string): Promise<void> {
        console.error("Error updating user:", message);
      }
    }

    return new UpdateUserCall(userId, updateData).execute();
  };

  /**
   * Update user profile with validation
   */
  export interface ProfileUpdateData {
    username?: string;
    email?: string;
    full_name?: string;
    avatar_url?: string;
  }

  export const updateProfile = async (userId: string, profileData: ProfileUpdateData): Promise<User> => {
    try {
      // Validate data before sending
      const validatedData: UserUpdateData = {};
      
      if (profileData.username !== undefined) {
        if (profileData.username.length < 3) {
          throw new Error('Username must be at least 3 characters long');
        }
        validatedData.username = profileData.username;
      }
      
      if (profileData.email !== undefined) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(profileData.email)) {
          throw new Error('Please enter a valid email address');
        }
        validatedData.email = profileData.email;
      }
      
      if (profileData.full_name !== undefined) {
        validatedData.full_name = profileData.full_name;
      }
      
      if (profileData.avatar_url !== undefined) {
        validatedData.avatar_url = profileData.avatar_url;
      }
      
      return await updateUser(userId, validatedData);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  export interface UserCreateData {
    username: string;
    email: string;
    password: string;
    full_name?: string;
    avatar_url?: string;
  }

  export const createUser = async (userData: UserCreateData): Promise<User> => {
    class CreateUserCall extends BaseAPITemplate<User> {
      constructor(private userData: UserCreateData) {
        super();
      }

      protected buildURL(): string {
        return `${this.getBaseURL()}/api/v1/users/`;
      }

      protected buildOptions(): RequestInit {
        return {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(this.userData),
        };
      }

      protected async onError(message: string, response: Response): Promise<void> {
        // Debug details to help diagnose 405 issues (preserve existing behavior)
        console.error("createUser failed:", {
          requestedUrl: `${this.getBaseURL()}/api/v1/users/`,
          resolvedUrl: response.url,
          status: response.status,
          statusText: response.statusText,
          method: "POST",
        });
        console.error("Error creating user:", message);
      }
    }

    return new CreateUserCall(userData).execute();
  };

  /**
   * @deprecated DO NOT USE for auth mode users
   * 
   * This function is deprecated. Auth mode should NEVER call createUser.
   * The database trigger (sync_auth_user_to_public_users) automatically creates
   * users in public.users when they sign up via Supabase Auth.
   * 
   * For auth mode: Use getUserWithRetry() instead, which retries once to handle
   * trigger timing delays.
   * 
   * This function is kept only for reference/documentation purposes.
   * It should NOT be called for authenticated users.
   */
  export const createUserFromAuth = async (
    authUserId: string,
    email: string,
    metadata?: {
      username?: string;
      full_name?: string;
      avatar_url?: string;
    }
  ): Promise<User> => {
    try {
      // Extract username from email if not provided in metadata
      // Ensure username is unique by appending a suffix if needed
      const username = metadata?.username || email.split('@')[0];
      
      // Create user with placeholder password (auth handles authentication)
      const userData: UserCreateData = {
        username,
        email,
        password: 'PLACEHOLDER_AUTH_USER', // Required by API but not used for auth users
        full_name: metadata?.full_name,
        avatar_url: metadata?.avatar_url,
      };

      const user = await createUser(userData);
      
      // Note: The backend generates a new user_id. The SQL trigger should have
      // created the user with authUserId as user_id. If this fallback is used,
      // the user_id may not match authUserId, but the user can still use the app.
      // Consider running the backfill SQL script to sync existing auth users.
      
      return user;
    } catch (error) {
      console.error('Error creating user from auth:', error);
      throw error;
    }
  };
  
