import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X, Users } from "lucide-react";

interface Invitation {
  id: string;
  projectName: string;
  roleName: string;
  inviterName: string;
  invitedAt: string;
}

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  invitations?: Invitation[];
  onAcceptInvitation?: (invitationId: string) => void;
}

// Mock data for demonstration
const mockInvitations: Invitation[] = [
  {
    id: "1",
    projectName: "E-commerce Website",
    roleName: "Frontend Developer",
    inviterName: "John Doe",
    invitedAt: "2024-06-05"
  },
  {
    id: "2",
    projectName: "Mobile App Design",
    roleName: "UI/UX Designer",
    inviterName: "Sarah Smith",
    invitedAt: "2024-06-04"
  },
  {
    id: "3",
    projectName: "API Development",
    roleName: "Backend Developer",
    inviterName: "Mike Johnson",
    invitedAt: "2024-06-03"
  }
];

export default function NotificationModal({
  isOpen,
  onClose,
  invitations = mockInvitations,
  onAcceptInvitation
}: NotificationModalProps) {
  const { theme } = useTheme();
  const [acceptedInvitations, setAcceptedInvitations] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleAccept = (invitationId: string) => {
    // Add to accepted invitations set
    setAcceptedInvitations(prev => new Set(prev).add(invitationId));
    
    if (onAcceptInvitation) {
      onAcceptInvitation(invitationId);
    } else {
      // Default behavior - you can replace this with actual logic
      console.log(`Accepted invitation: ${invitationId}`);
    }
  };

  const isAccepted = (invitationId: string) => acceptedInvitations.has(invitationId);

  const overlayClass = "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4";
  
  const modalClass = `
    relative w-full max-w-md max-h-[80vh] overflow-hidden rounded-xl shadow-2xl
    ${theme === "dark" 
      ? "bg-[#212124] border border-[#3A3A3E] text-[#E0E0E0]" 
      : "bg-white border border-gray-200 text-[#2D2D2D]"
    }
  `;

  const headerClass = `
    flex items-center justify-between p-4 border-b
    ${theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"}
  `;

  const getButtonClass = (invitationId: string) => {
    const baseClass = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
    
    if (isAccepted(invitationId)) {
      // Accepted state - transparent with border
      return `${baseClass} cursor-not-allowed
        ${theme === "dark"
          ? "bg-transparent border border-gray-600 text-gray-400"
          : "bg-transparent border border-gray-300 text-gray-500"
        }`;
    } else {
      // Normal accept button
      return `${baseClass} cursor-pointer
        ${theme === "dark"
          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
          : "bg-indigo-600 hover:bg-indigo-700 text-white"
        }`;
    }
  };

  const invitationItemClass = `
    p-4 border-b last:border-b-0
    ${theme === "dark" 
      ? "border-[#3A3A3E] hover:bg-[#2A2A2E]" 
      : "border-gray-100 hover:bg-gray-50"
    }
    transition-colors
  `;

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={headerClass}>
          <div className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            <h2 className="text-lg font-semibold">Project Invitations</h2>
            {invitations.length > 0 && (
              <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium
                ${theme === "dark" 
                  ? "bg-indigo-500/20 text-indigo-300" 
                  : "bg-indigo-100 text-indigo-800"
                }`}>
                {invitations.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className={`p-1 rounded-full transition-colors
              ${theme === "dark" 
                ? "hover:bg-[#3A3A3E] text-gray-400 hover:text-white" 
                : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
              }`}
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-96 overflow-y-auto">
          {invitations.length === 0 ? (
            <div className="p-8 text-center">
              <Users className={`w-12 h-12 mx-auto mb-3 
                ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`} />
              <p className={`text-sm 
                ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                No new invitations
              </p>
            </div>
          ) : (
            invitations.map((invitation) => (
              <div key={invitation.id} className={invitationItemClass}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate mb-1">
                      {invitation.projectName}
                    </h3>
                    <p className={`text-xs mb-2 
                      ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Role: <span className="font-medium">{invitation.roleName}</span>
                    </p>
                    <p className={`text-xs 
                      ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Invited by {invitation.inviterName} • {invitation.invitedAt}
                    </p>
                  </div>
                  <button
                    onClick={() => !isAccepted(invitation.id) && handleAccept(invitation.id)}
                    className={getButtonClass(invitation.id)}
                    disabled={isAccepted(invitation.id)}
                  >
                    {isAccepted(invitation.id) ? "Accepted" : "Accept"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}