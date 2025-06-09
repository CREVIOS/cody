import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X, Users, Loader2, AlertCircle } from "lucide-react";
import { getPendingInvitationsByEmail, acceptInvitation, ProjectInvitationWithDetails, testBackendConnection } from "@/lib/projectApi";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userId: string;
  onInvitationAccepted?: (projectId: string) => void;
}

export default function NotificationModal({
  isOpen,
  onClose,
  userEmail,
  userId,
  onInvitationAccepted
}: NotificationModalProps) {
  const { theme } = useTheme();
  const [invitations, setInvitations] = useState<ProjectInvitationWithDetails[]>([]);
  const [acceptedInvitations, setAcceptedInvitations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingInvitations, setProcessingInvitations] = useState<Set<string>>(new Set());

  // Fetch invitations when modal opens
  useEffect(() => {
    if (isOpen && userEmail) {
      // Test backend connection first
      testBackendConnection().then(isConnected => {
        console.log('Backend connection test (Notifications):', isConnected ? 'SUCCESS' : 'FAILED');
        if (!isConnected) {
          setError('Unable to connect to backend server. Please check if the server is running.');
        }
      });
      
      fetchInvitations();
    }
  }, [isOpen, userEmail]);

  const fetchInvitations = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPendingInvitationsByEmail(userEmail);
      setInvitations(data);
    } catch (err) {
      setError('Failed to load invitations. Please try again.');
      console.error('Error fetching invitations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (invitation: ProjectInvitationWithDetails) => {
    if (processingInvitations.has(invitation.invitation_id)) return;

    try {
      // Add to processing set to prevent double clicks
      setProcessingInvitations(prev => new Set(prev).add(invitation.invitation_id));

      // Debug: Log the data being sent
      console.log('Accepting invitation:', {
        invitationId: invitation.invitation_id,
        userId: userId,
        projectId: invitation.project_id
      });

      // Validate required fields
      if (!invitation.invitation_id) {
        throw new Error('Invitation ID is required');
      }
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Call API to accept invitation
      await acceptInvitation(invitation.invitation_id, userId);

      // Add to accepted invitations set for UI feedback
      setAcceptedInvitations(prev => new Set(prev).add(invitation.invitation_id));

      // Remove from invitations list after a short delay
      setTimeout(() => {
        setInvitations(prev => prev.filter(inv => inv.invitation_id !== invitation.invitation_id));
      }, 500);

      // Notify parent component if callback provided
      if (onInvitationAccepted) {
        onInvitationAccepted(invitation.project_id);
      }
    } catch (err: any) {
      console.error('Error accepting invitation:', err);
      // Show more specific error message
      const errorMessage = err?.message || 'Failed to accept invitation. Please try again.';
      alert(errorMessage);
    } finally {
      setProcessingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitation.invitation_id);
        return newSet;
      });
    }
  };

  const isAccepted = (invitationId: string) => acceptedInvitations.has(invitationId);
  const isProcessing = (invitationId: string) => processingInvitations.has(invitationId);

  if (!isOpen) return null;

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
    } else if (isProcessing(invitationId)) {
      // Processing state
      return `${baseClass} cursor-not-allowed
        ${theme === "dark"
          ? "bg-indigo-600/50 text-white/70"
          : "bg-indigo-600/50 text-white/70"
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={headerClass}>
          <div className="flex items-center">
            <Users className="w-5 h-5 mr-2" />
            <h2 className="text-lg font-semibold">Project Invitations</h2>
            {!loading && invitations.length > 0 && (
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
          {loading ? (
            <div className="p-8 flex flex-col items-center">
              <Loader2 className={`w-8 h-8 animate-spin mb-3
                ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`} />
              <p className={`text-sm 
                ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Loading invitations...
              </p>
            </div>
          ) : error ? (
            <div className="p-8 flex flex-col items-center">
              <AlertCircle className={`w-8 h-8 mb-3
                ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
              <p className={`text-sm text-center
                ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
                {error}
              </p>
              <button
                onClick={fetchInvitations}
                className={`mt-3 px-3 py-1.5 rounded-md text-sm font-medium
                  ${theme === "dark"
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
              >
                Retry
              </button>
            </div>
          ) : invitations.length === 0 ? (
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
              <div key={invitation.invitation_id} className={invitationItemClass}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate mb-1">
                      {invitation.project.project_name}
                    </h3>
                    <p className={`text-xs mb-2 
                      ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                      Role: <span className="font-medium">{invitation.role.role_name}</span>
                    </p>
                    <p className={`text-xs 
                      ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                      Invited by {invitation.inviter.full_name || invitation.inviter.username} • {formatDate(invitation.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => !isAccepted(invitation.invitation_id) && !isProcessing(invitation.invitation_id) && handleAccept(invitation)}
                    className={getButtonClass(invitation.invitation_id)}
                    disabled={isAccepted(invitation.invitation_id) || isProcessing(invitation.invitation_id)}
                  >
                    {isProcessing(invitation.invitation_id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : isAccepted(invitation.invitation_id) ? (
                      "Accepted"
                    ) : (
                      "Accept"
                    )}
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