import { useState } from "react";
import { ProjectInvitationWithDetails, Project } from "@/lib/projectAPI/TypeDefinitions";
import { Loader2 } from "lucide-react";
import { acceptInvitation } from "@/lib/projectAPI/InvitationAPI";


interface InvitationItemProps {
  invitation: ProjectInvitationWithDetails;
  userId: string;
  onAccepted: (projectId: string, projectData?: { project: Project; role: string }) => void;
  onRefreshData: () => void;
  theme: string;
}

export function InvitationItem({ 
  invitation, 
  userId, 
  onAccepted, 
  onRefreshData, 
  theme 
}: InvitationItemProps) {
  const [isAccepted, setIsAccepted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAccept = async () => {
    if (isProcessing || isAccepted) return;

    try {
      setIsProcessing(true);

      console.log('Accepting invitation:', {
        invitationId: invitation.invitation_id,
        userId: userId,
        projectId: invitation.project_id
      });

      if (!invitation.invitation_id) {
        throw new Error('Invitation ID is required');
      }
      if (!userId) {
        throw new Error('User ID is required');
      }

      await acceptInvitation(invitation.invitation_id, userId);
      setIsAccepted(true);

      setTimeout(() => {
        onRefreshData();
      }, 500);

      onAccepted(invitation.project_id, { 
        project: invitation.project, 
        role: invitation.role.role_name 
      });
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      const errorMessage = err?.message || 'Failed to accept invitation. Please try again.';
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const getButtonClass = () => {
    const baseClass = "px-3 py-1.5 rounded-md text-sm font-medium transition-colors";
    
    if (isAccepted) {
      return `${baseClass} cursor-not-allowed
        ${theme === "dark"
          ? "bg-transparent border border-gray-600 text-gray-400"
          : "bg-transparent border border-gray-300 text-gray-500"
        }`;
    } else if (isProcessing) {
      return `${baseClass} cursor-not-allowed
        ${theme === "dark"
          ? "bg-indigo-600/50 text-white/70"
          : "bg-indigo-600/50 text-white/70"
        }`;
    } else {
      return `${baseClass} cursor-pointer
        ${theme === "dark"
          ? "bg-indigo-600 hover:bg-indigo-700 text-white"
          : "bg-indigo-600 hover:bg-indigo-700 text-white"
        }`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
    <div className={invitationItemClass}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-sm truncate mb-1">
            {invitation.project?.project_name || 'Unknown Project'}
          </h3>
          <p className={`text-xs mb-2 
            ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
            Role: <span className="font-medium">{invitation.role?.role_name || 'Unknown Role'}</span>
          </p>
          <p className={`text-xs 
            ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
            Invited by {invitation.inviter?.full_name || invitation.inviter?.username || 'Unknown User'} • {formatDate(invitation.created_at)}
          </p>
        </div>
        <button
          onClick={handleAccept}
          className={getButtonClass()}
          disabled={isAccepted || isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isAccepted ? (
            "Accepted"
          ) : (
            "Accept"
          )}
        </button>
      </div>
    </div>
  );
}
