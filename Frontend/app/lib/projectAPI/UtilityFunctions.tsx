import { ProjectInvitation } from "./TypeDefinitions";
import { BaseAPITemplateSilentFail } from "./BaseAPITemplate";

/**
 * Test backend connection using health endpoint
 */
export const testBackendConnection = async (): Promise<boolean> => {
  class TestBackendConnectionCall extends BaseAPITemplateSilentFail<boolean> {
    protected buildURL(): string {
      return `${this.getBaseURL()}/health`;
    }

    protected buildOptions(): RequestInit {
      return {
        method: "GET",
        // 3 second timeout
        signal: AbortSignal.timeout(3000),
      };
    }

    protected async parseResponse(response: Response): Promise<boolean> {
      // For /health we only care whether it's OK
      return response.ok;
    }

    protected getFallbackValue(): boolean {
      return false;
    }

    protected async onError(message: string): Promise<void> {
      // Keep noise low; this is often expected in dev when backend is down
      console.debug("Backend health check failed:", message);
    }
  }

  return new TestBackendConnectionCall().execute();
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