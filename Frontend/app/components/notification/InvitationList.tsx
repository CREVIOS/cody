import { InvitationNotification } from "@/lib/projectAPI/TypeDefinitions";
import { InvitationItem } from "./InvitationItem";

interface InvitationListProps {
    notifications: InvitationNotification[];
    userId: string;
    onInvitationAccepted: () => Promise<void> | void;
    onRefreshData: () => void;
    theme: string;
  }
  
export function InvitationList({ 
    notifications, 
    userId, 
    onInvitationAccepted, 
    onRefreshData, 
    theme 
  }: InvitationListProps) {
    return (
      <div>
        {notifications.map((notification) => (
          <InvitationItem
            key={notification.notification_id}
            notification={notification}
            userId={userId}
            onAccepted={onInvitationAccepted}
            onRefreshData={onRefreshData}
            theme={theme}
          />
        ))}
      </div>
    );
  }

  
