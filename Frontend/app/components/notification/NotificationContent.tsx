import { InvitationNotification } from "@/lib/projectAPI/TypeDefinitions";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";
import { InvitationList } from "./InvitationList";


interface NotificationContentProps {
    loading: boolean;
    error: string | null;
    notifications: InvitationNotification[];
    userId: string;
    onInvitationAccepted: () => void;
    onRefreshData: () => void;
    theme: string;
}
  
export function NotificationContent({ 
    loading, 
    error, 
    notifications, 
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
  
    if (notifications.length === 0) {
      return <EmptyState theme={theme} />;
    }
  
    return (
      <InvitationList
        notifications={notifications}
        userId={userId}
        onInvitationAccepted={onInvitationAccepted}
        onRefreshData={onRefreshData}
        theme={theme}
      />
    );
  }
