import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X, UserPlus, Mail, Users, Clock, Trash2, Loader2, AlertCircle } from "lucide-react";
import { 
  createInvitation, 
  getProjectInvitations, 
  deleteInvitation, 
  getRoles,
  ProjectInvitation,
  Role,
  testBackendConnection
} from "@/lib/projectApi";

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  currentUserId: string;
  onInvitationSent?: () => void;
}

export default function InviteModal({
  isOpen,
  onClose,
  projectId,
  projectName,
  currentUserId,
  onInvitationSent
}: InviteModalProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"invite" | "pending">("invite");
  const [email, setEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [deletingInvitations, setDeletingInvitations] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [invitationError, setInvitationError] = useState<string | null>(null);

  // Fetch roles when modal opens
  useEffect(() => {
    if (isOpen) {
      // Test backend connection first
      testBackendConnection().then(isConnected => {
        console.log('Backend connection test:', isConnected ? 'SUCCESS' : 'FAILED');
        if (!isConnected) {
          setInvitationError('Unable to connect to backend server. Please check if the server is running.');
        }
      });
      
      fetchRoles();
      fetchPendingInvitations();
    }
  }, [isOpen, projectId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setError(null);
      setInvitationError(null);
      setActiveTab("invite");
    }
  }, [isOpen]);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const fetchedRoles = await getRoles();
      setRoles(fetchedRoles);
      // Set default role if available
      if (fetchedRoles.length > 0 && !selectedRoleId) {
        // Try to find "Editor" role as default, otherwise use first role
        const editorRole = fetchedRoles.find(r => r.role_name.toLowerCase() === 'editor');
        setSelectedRoleId(editorRole?.role_id || fetchedRoles[0].role_id);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
      setError('Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingInvitations = async () => {
    try {
      setLoadingInvitations(true);
      const invitations = await getProjectInvitations(projectId, 'pending');
      // Filter to show only pending invitations that haven't expired
      const now = new Date();
      const validInvitations = invitations.filter(inv => {
        const expiresAt = new Date(inv.expires_at);
        return expiresAt >= now;
      });
      setPendingInvitations(validInvitations);
    } catch (err) {
      console.error('Error fetching invitations:', err);
    } finally {
      setLoadingInvitations(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!email.trim() || !selectedRoleId) return;

    try {
      setSendingInvitation(true);
      setInvitationError(null);

      // Debug: Log the data being sent
      const invitationData = {
        project_id: projectId,
        email: email.trim(),
        role_id: selectedRoleId,
        invited_by: currentUserId
      };
      
      console.log('Sending invitation with data:', invitationData);
      
      // Validate required fields before sending
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      if (!currentUserId) {
        throw new Error('User ID is required');
      }
      if (!selectedRoleId) {
        throw new Error('Role ID is required');
      }

      await createInvitation(invitationData);

      // Reset form
      setEmail("");
      
      // Refresh pending invitations
      await fetchPendingInvitations();
      
      // Switch to pending tab to show the new invitation
      setActiveTab("pending");

      // Notify parent component
      if (onInvitationSent) {
        onInvitationSent();
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
      
      // Remove from local state immediately for better UX
      setPendingInvitations(prev => prev.filter(inv => inv.invitation_id !== invitationId));
    } catch (err) {
      console.error('Error canceling invitation:', err);
      // Refresh the list in case of error
      await fetchPendingInvitations();
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

  if (!isOpen) return null;

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
            Pending ({pendingInvitations.length})
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
              {loadingInvitations ? (
                <div className="flex flex-col items-center py-8">
                  <Loader2 className={`w-8 h-8 animate-spin mb-3
                    ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`} />
                  <p className={`text-sm 
                    ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Loading invitations...
                  </p>
                </div>
              ) : pendingInvitations.length === 0 ? (
                <div className="text-center py-8">
                  <Users className={`w-12 h-12 mx-auto mb-3 
                    ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`} />
                  <p className={`text-sm 
                    ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    No pending invitations
                  </p>
                </div>
              ) : (
                pendingInvitations.map((invitation) => (
                  <div key={invitation.invitation_id} className={pendingItemClass}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate mb-1">
                          {invitation.email}
                        </h3>
                        <p className={`text-xs mb-2 
                          ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Role: <span className="font-medium">
                            {roles.find(r => r.role_id === invitation.role_id)?.role_name || 'Unknown'}
                          </span>
                        </p>
                        <p className={`text-xs 
                          ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                          Invited: {formatDate(invitation.created_at)} • Expires: {formatDate(invitation.expires_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(invitation.invitation_id)}
                        className={cancelButtonClass}
                        title="Cancel invitation"
                        disabled={deletingInvitations.has(invitation.invitation_id)}
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