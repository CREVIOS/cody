import { useTheme } from "@/context/ThemeContext";
import { ProjectInvitationWithDetails } from "@/lib/projectAPI/TypeDefinitions";
import { Project } from "@/lib/projectAPI/TypeDefinitions";
import { NotificationModalHeader } from "./NotificationModalHeader";
import { NotificationContent } from "./NotificationContent";


interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  invitations: ProjectInvitationWithDetails[];
  loading: boolean;
  error: string | null;
  onInvitationAccepted?: (projectId: string, projectData?: { project: Project; role: string }) => void;
  onRefreshData?: () => void;
}

export default function NotificationModal({
  isOpen,
  onClose,
  userId,
  invitations,
  loading,
  error,
  onInvitationAccepted,
  onRefreshData
}: NotificationModalProps) {
  const { theme } = useTheme();

  if (!isOpen) return null;

  const overlayClass = "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4";
  
  const modalClass = `
    relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl
    ${theme === "dark" 
      ? "bg-[#212124] border border-[#3A3A3E] text-[#E0E0E0]" 
      : "bg-white border border-gray-200 text-[#2D2D2D]"
    }
  `;

  const handleInvitationAccepted = (projectId: string, projectData?: { project: Project; role: string }) => {
    if (onInvitationAccepted) {
      onInvitationAccepted(projectId, projectData);
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
          invitationCount={invitations.length}
          loading={loading}
          onClose={onClose}
          theme={theme}
        />

        <div className="max-h-96 overflow-y-auto">
          <NotificationContent
            loading={loading}
            error={error}
            invitations={invitations}
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