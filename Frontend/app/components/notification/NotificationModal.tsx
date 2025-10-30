import { useTheme } from "@/context/ThemeContext";
import { InvitationNotification } from "@/lib/projectAPI/TypeDefinitions";
import { NotificationModalHeader } from "./NotificationModalHeader";
import { NotificationContent } from "./NotificationContent";


interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  notifications: InvitationNotification[];
  loading: boolean;
  error: string | null;
  onInvitationAccepted?: () => void;
  onRefreshData?: () => void;
}

export default function NotificationModal({
  isOpen,
  onClose,
  userId,
  notifications,
  loading,
  error,
  onInvitationAccepted,
  onRefreshData
}: NotificationModalProps) {
  const { theme } = useTheme();

  if (!isOpen) return null;

  const pendingNotifications = notifications.filter(
    (notification) => (notification.payload?.status ?? "pending").toLowerCase() === "pending"
  );

  const overlayClass = "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4";
  
  const modalClass = `
    relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl
    ${theme === "dark" 
      ? "bg-[#212124] border border-[#3A3A3E] text-[#E0E0E0]" 
      : "bg-white border border-gray-200 text-[#2D2D2D]"
    }
  `;

  const handleInvitationAccepted = () => {
    if (onInvitationAccepted) {
      onInvitationAccepted();
    }
  };

  const handleRefreshData = () => {
    if (onRefreshData) {
      onRefreshData();
    }
  };

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        <NotificationModalHeader
          invitationCount={pendingNotifications.length}
          loading={loading}
          onClose={onClose}
          theme={theme}
        />

        <div className="max-h-96 overflow-y-auto">
          <NotificationContent
            loading={loading}
            error={error}
            notifications={notifications}
            userId={userId}
            onInvitationAccepted={handleInvitationAccepted}
            onRefreshData={handleRefreshData}
            theme={theme}
          />
        </div>
      </div>
    </div>
  );
}
