import { Trash2, Loader2, AlertCircle, Clock } from "lucide-react";
import { ProjectInvitation } from "@/lib/projectAPI/TypeDefinitions";
import { Theme } from "@/context/ThemeContext";
import { Role } from "@/lib/projectAPI/TypeDefinitions";
import { deleteInvitation } from "@/lib/projectAPI/InvitationAPI";

interface PendingInvitationsProps {
  invitations: ProjectInvitation[];
  roles: Role[];
  loading: boolean;
  error: string | null;
  theme: Theme;
  onInvitationCanceled: () => void;
  deletingInvitations: Set<string>;
  onDeletingChange: (invitationId: string, isDeleting: boolean) => void;
}

export function PendingInvitations({ 
  invitations, 
  roles, 
  loading, 
  error, 
  theme, 
  onInvitationCanceled,
  deletingInvitations,
  onDeletingChange
}: PendingInvitationsProps) {
  const cancelButtonClass = `
    p-1.5 rounded-md text-sm transition-colors
    ${theme === "dark"
      ? "text-red-400 hover:bg-red-500/20 hover:text-red-300"
      : "text-red-600 hover:bg-red-50 hover:text-red-700"
    }
  `;

  const pendingItemClass = `
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

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      onDeletingChange(invitationId, true);
      await deleteInvitation(invitationId);
      onInvitationCanceled();
    } catch (err) {
      console.error('Error canceling invitation:', err);
    } finally {
      onDeletingChange(invitationId, false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="w-6 h-6 mx-auto mb-2" />
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  if (invitations.length === 0) {
    return (
      <div className="p-8 text-center">
        <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          No pending invitations
        </p>
      </div>
    );
  }

  return (
    <div>
      {invitations.map((invitation) => (
        <div key={invitation.invitation_id} className={pendingItemClass}>
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm mb-1">{invitation.email}</p>
              <p className={`text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                Role: {roles.find(r => r.role_id === invitation.role_id)?.role_name || 'Unknown Role'}
              </p>
              <p className={`text-xs ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                Expires: {formatDate(invitation.expires_at)}
              </p>
            </div>
            <button
              onClick={() => handleCancelInvitation(invitation.invitation_id)}
              disabled={deletingInvitations.has(invitation.invitation_id)}
              className={cancelButtonClass}
              title="Cancel Invitation"
            >
              {deletingInvitations.has(invitation.invitation_id) ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
