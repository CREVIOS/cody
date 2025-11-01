import { API_BASE_URL } from "./APIConfiguration";
import { ProjectInvitation } from "./TypeDefinitions";

/**
 * Test backend connection using health endpoint
 */
export const testBackendConnection = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`, {
        signal: AbortSignal.timeout(3000) // 3 second timeout
      });
      return response.ok;
    } catch (error) {
      // Network errors are expected when backend is down - log at debug level
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.debug('Backend health check failed: Server is not available');
      } else {
        console.debug('Backend health check failed:', error);
      }
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