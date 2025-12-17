import { API_BASE_URL } from "./APIConfiguration";
import { getErrorMessage } from "./ErrorHandling";
import { User, PaginatedResponse, UserProjectsResponse } from "./TypeDefinitions";
import { getRoles } from "./RoleAPI";
import { Project } from "./TypeDefinitions";


/**
 * List all users
 */
export const listUsers = async (): Promise<User[]> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      const data: PaginatedResponse<User> = await response.json();
      return data.items || [];
    } catch (error) {
      // Handle network errors with a more helpful message
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const networkError = new Error(
          `Unable to connect to backend server at ${API_BASE_URL}. Please ensure the backend is running on port 8000.`
        );
        console.error('Network error listing users:', networkError);
        throw networkError;
      }
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

  /**
   * Get user by ID
   */
  export const getUser = async (userId: string): Promise<User> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`);
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error updating user:', error);
      throw error;
    }
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
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      if (!response.ok) {
        // Debug details to help diagnose 405 issues
        console.error('createUser failed:', {
          requestedUrl: `${API_BASE_URL}/api/v1/users/`,
          resolvedUrl: response.url,
          status: response.status,
          statusText: response.statusText,
          method: 'POST'
        });
        const errorMessage = await getErrorMessage(response);
        throw new Error(errorMessage);
      }
      return await response.json();
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
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
      let username = metadata?.username || email.split('@')[0];
      
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
  