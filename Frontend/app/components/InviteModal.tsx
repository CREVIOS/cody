import { useState, useEffect } from "react";
import { useTheme, Theme } from "@/context/ThemeContext";
import { useRoles } from "@/context/RolesContext";
import { X, UserPlus, Mail, Users, Clock, Trash2, Loader2, AlertCircle } from "lucide-react";
import { 
  createInvitation, 
  deleteInvitation, 
  ProjectInvitation,
  Role,
  testBackendConnection,
  findUserByEmail
} from "@/lib/projectApi";

export interface InviteModalProps {
  projectId?: string;
  projectName: string;
  onClose: () => void;
  onInviteSent: () => void;
  canManageMembers: boolean;
  theme: Theme;
  user?: { user_id: string };
  pendingInvitations?: ProjectInvitation[];
}

export default function InviteModal({
  projectId,
  projectName,
  onClose,
  onInviteSent,
  canManageMembers,
  theme,
  user,
  pendingInvitations = []
}: InviteModalProps) {
  const { theme: contextTheme } = useTheme();
  const { roles, loading: rolesLoading } = useRoles();
  const [activeTab, setActiveTab] = useState<"invite" | "pending">("invite");
  const [email, setEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [deletingInvitations, setDeletingInvitations] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);
  const [localPendingInvitations, setLocalPendingInvitations] = useState<ProjectInvitation[]>(pendingInvitations);

  // Update local state when prop changes
  useEffect(() => {
    setLocalPendingInvitations(pendingInvitations);
  }, [pendingInvitations]);

  // Set default role when roles are available
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      // Try to find "Editor" role as default, otherwise use first role
      const editorRole = roles.find(r => r.role_name.toLowerCase() === 'editor');
      setSelectedRoleId(editorRole?.role_id || roles[0].role_id);
    }
  }, [roles, selectedRoleId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!projectId) {
      setEmail("");
      setError(null);
      setInvitationError(null);
      setActiveTab("invite");
    }
  }, [projectId]);

  const handleSendInvitation = async () => {
    if (!email.trim() || !selectedRoleId || !projectId || !user?.user_id) return;

    try {
      setSendingInvitation(true);
      setInvitationError(null);

      // Debug: Log the data being sent
      const invitationData = {
        project_id: projectId,
        email: email.trim().toLowerCase(), // Ensure email is lowercase
        role_id: selectedRoleId,
        invited_by: user.user_id
      };
      
      console.log('Sending invitation with data:', invitationData);
      
      // Validate required fields before sending
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      if (!selectedRoleId) {
        throw new Error('Role ID is required');
      }
      if (!invitationData.invited_by) {
        throw new Error('Current user information is missing');
      }

      // First try to find if user exists
      const existingUser = await findUserByEmail(invitationData.email);
      console.log('Existing user check:', existingUser);

      if (!existingUser) {
        setInvitationError('User with this email does not exist in the system');
        return;
      }

      await createInvitation(invitationData);

      // Reset form
      setEmail("");

      // Notify parent component to refresh data
      if (onInviteSent) {
        onInviteSent();
      }
    } catch (err: any) {
      console.error('Error sending invitation:', err);
      setInvitationError(err.message || 'Failed to send invitation. Please try again.');
    } finally {
      setSendingInvitation(false);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      setDeletingInvitations(prev => new Set(prev).add(invitationId));
      
      await deleteInvitation(invitationId);
      
      // Update local state immediately
      setLocalPendingInvitations(current => 
        current.filter(inv => inv.invitation_id !== invitationId)
      );
      
      // Notify parent to refresh data
      if (onInviteSent) {
        onInviteSent();
      }
    } catch (err) {
      console.error('Error canceling invitation:', err);
      // Show error message to user
      setError('Failed to cancel invitation. Please try again.');
    } finally {
      setDeletingInvitations(prev => {
        const newSet = new Set(prev);
        newSet.delete(invitationId);
        return newSet;
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const overlayClass = "fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4";
  
  const modalClass = `
    relative w-full max-w-lg max-h-[80vh] overflow-hidden rounded-xl shadow-2xl
    ${theme === "dark" 
      ? "bg-[#212124] border border-[#3A3A3E] text-[#E0E0E0]" 
      : "bg-white border border-gray-200 text-[#2D2D2D]"
    }
  `;

  const headerClass = `
    flex items-center justify-between p-4 border-b
    ${theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"}
  `;

  const tabButtonClass = (isActive: boolean) => `
    px-4 py-2 text-sm font-medium rounded-lg transition-colors
    ${isActive
      ? theme === "dark"
        ? "bg-indigo-600 text-white"
        : "bg-indigo-600 text-white"
      : theme === "dark"
        ? "text-gray-400 hover:text-white hover:bg-[#3A3A3E]"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
    }
  `;

  const inputClass = `
    w-full px-3 py-2 rounded-md border text-sm
    ${theme === "dark"
      ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500 text-[#E0E0E0] placeholder-gray-500"
      : "bg-white border-gray-300 focus:border-indigo-500 text-[#2D2D2D] placeholder-gray-400"
    }
    focus:outline-none focus:ring-1 focus:ring-indigo-500/50
  `;

  const buttonClass = `
    px-4 py-2 rounded-md text-sm font-medium transition-colors
    ${theme === "dark"
      ? "bg-indigo-600 hover:bg-indigo-700 text-white"
      : "bg-indigo-600 hover:bg-indigo-700 text-white"
    }
  `;

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

  if (!projectId) return null;

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={headerClass}>
          <div className="flex items-center">
            <UserPlus className="w-5 h-5 mr-2" />
            <h2 className="text-lg font-semibold">Invite Collaborators</h2>
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

        {/* Tabs */}
        <div className={`flex gap-2 p-4 border-b ${theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"}`}>
          <button
            onClick={() => setActiveTab("invite")}
            className={tabButtonClass(activeTab === "invite")}
          >
            <Mail className="w-4 h-4 inline mr-1" />
            Invite
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={tabButtonClass(activeTab === "pending")}
          >
            <Clock className="w-4 h-4 inline mr-1" />
            Pending
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {activeTab === "invite" ? (
            <div className="space-y-4">
              {/* Project Name Display */}
              <div>
                <label className={`block text-sm font-medium mb-2 
                  ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Project
                </label>
                <div className={`px-3 py-2 rounded-md border text-sm font-medium
                  ${theme === "dark"
                    ? "bg-[#2A2A2E] border-[#3A3A3E] text-[#E0E0E0]"
                    : "bg-gray-50 border-gray-300 text-[#2D2D2D]"
                  }`}>
                  {projectName}
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label className={`block text-sm font-medium mb-2 
                  ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className={inputClass}
                />
              </div>

              {/* Role Selection */}
              <div>
                <label className={`block text-sm font-medium mb-2 
                  ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Role
                </label>
                {loading ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                ) : roles.length > 0 ? (
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className={inputClass}
                  >
                    {roles.map(role => (
                      <option key={role.role_id} value={role.role_id}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    No roles available
                  </div>
                )}
              </div>

              {/* Error Message */}
              {invitationError && (
                <div className={`flex items-center gap-2 p-3 rounded-md text-sm
                  ${theme === "dark"
                    ? "bg-red-500/20 text-red-300"
                    : "bg-red-50 text-red-700"
                  }`}>
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{invitationError}</span>
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSendInvitation}
                disabled={!email.trim() || !selectedRoleId || sendingInvitation}
                className={`${buttonClass} ${(!email.trim() || !selectedRoleId || sendingInvitation) ? 'opacity-50 cursor-not-allowed' : ''} flex items-center justify-center`}
              >
                {sendingInvitation ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Send Invitation'
                )}
              </button>
            </div>
          ) : (
            <div>
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : error ? (
                <div className="p-4 text-center">
                  <AlertCircle className="w-6 h-6 mx-auto mb-2" />
                  <p className="text-sm text-red-500">{error}</p>
                </div>
              ) : localPendingInvitations.length === 0 ? (
                <div className="p-8 text-center">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    No pending invitations
                  </p>
                </div>
              ) : (
                localPendingInvitations.map((invitation) => (
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
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}