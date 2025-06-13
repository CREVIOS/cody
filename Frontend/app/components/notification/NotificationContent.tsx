import { ProjectInvitationWithDetails } from "@/lib/projectAPI/TypeDefinitions";
import { Project } from "@/lib/projectAPI/TypeDefinitions";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import { InvitationList } from "./InvitationList";


interface NotificationContentProps {
    loading: boolean;
    error: string | null;
    invitations: ProjectInvitationWithDetails[];
    userId: string;
    onInvitationAccepted: (projectId: string, projectData?: { project: Project; role: string }) => void;
    onRefreshData: () => void;
    theme: string;
}
  
export function NotificationContent({ 
    loading, 
    error, 
    invitations, 
    userId, 
    onInvitationAccepted, 
    onRefreshData, 
    theme 
}: NotificationContentProps) {
    if (loading) {
      return <LoadingState theme={theme} />;
    }
  
    if (error) {
      return <ErrorState error={error} onRetry={onRefreshData} theme={theme} />;
    }
  
    if (invitations.length === 0) {
      return <EmptyState theme={theme} />;
    }
  
    return (
      <InvitationList
        invitations={invitations}
        userId={userId}
        onInvitationAccepted={onInvitationAccepted}
        onRefreshData={onRefreshData}
        theme={theme}
      />
    );
  }