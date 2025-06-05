import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { X, UserPlus, Mail, Users, Clock, Trash2 } from "lucide-react";

interface Role {
  id: string;
  name: string;
  label: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  roleId: string;
  roleName: string;
  invitedAt: string;
  expiresAt: string;
}

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName: string;
  onSendInvitation?: (email: string, role: string) => void;
  onCancelInvitation?: (invitationId: string) => void;
  pendingInvitations?: PendingInvitation[];
}

const roleOptions: Role[] = [
  { id: "role_001", name: "admin", label: "Admin" },
  { id: "role_002", name: "editor", label: "Editor" },
  { id: "role_003", name: "viewer", label: "Viewer" }
];

// Create a map for quick role lookup
const roleMap = new Map(roleOptions.map(role => [role.id, role]));

// Mock pending invitations for demonstration
const mockPendingInvitations: PendingInvitation[] = [
  {
    id: "inv_001",
    email: "alice@example.com",
    roleId: "role_002",
    roleName: "Editor",
    invitedAt: "2024-06-03",
    expiresAt: "2024-06-10"
  },
  {
    id: "inv_002",
    email: "bob@example.com",
    roleId: "role_003",
    roleName: "Viewer",
    invitedAt: "2024-06-04",
    expiresAt: "2024-06-11"
  },
  {
    id: "inv_003",
    email: "charlie@example.com",
    roleId: "role_001",
    roleName: "Admin",
    invitedAt: "2024-06-05",
    expiresAt: "2024-06-12"
  }
];

export default function InviteModal({
  isOpen,
  onClose,
  projectName,
  onSendInvitation,
  onCancelInvitation,
  pendingInvitations = mockPendingInvitations
}: InviteModalProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<"invite" | "pending">("invite");
  const [email, setEmail] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("role_002"); // Default to Editor
  const [pendingList, setPendingList] = useState<PendingInvitation[]>(pendingInvitations);

  // Sync pendingList with prop changes
  useEffect(() => {
    setPendingList(pendingInvitations);
  }, [pendingInvitations]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setEmail("");
      setSelectedRoleId("role_002");
      setActiveTab("invite");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendInvitation = () => {
    if (!email.trim()) return;

    const selectedRole = roleMap.get(selectedRoleId);
    if (!selectedRole) return;

    const newInvitation: PendingInvitation = {
      id: `inv_${Date.now()}`,
      email: email.trim(),
      roleId: selectedRoleId,
      roleName: selectedRole.label,
      invitedAt: new Date().toISOString().split('T')[0],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    // Update local state immediately for UI responsiveness
    setPendingList(prev => [...prev, newInvitation]);

    if (onSendInvitation) {
      onSendInvitation(email, selectedRole.name);
    } else {
      // Default behavior - log the invitation
      console.log(`Sent invitation to ${email.trim()} with role ${selectedRole.label} for project ${projectName}`);
    }

    // Reset form
    setEmail("");
    setSelectedRoleId("role_002");
    
    // Switch to pending tab to show the new invitation
    setActiveTab("pending");
  };

  const handleCancelInvitation = (invitationId: string) => {
    // Update local state immediately for UI responsiveness
    setPendingList(prev => prev.filter(inv => inv.id !== invitationId));

    if (onCancelInvitation) {
      onCancelInvitation(invitationId);
    } else {
      // Default behavior - log the cancellation
      console.log(`Cancelled invitation: ${invitationId}`);
    }
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
            Pending ({pendingList.length})
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
                <select
                  value={selectedRoleId}
                  onChange={(e) => setSelectedRoleId(e.target.value)}
                  className={inputClass}
                >
                  {roleOptions.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSendInvitation}
                disabled={!email.trim()}
                className={`${buttonClass} ${!email.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Send Invitation
              </button>
            </div>
          ) : (
            <div>
              {pendingList.length === 0 ? (
                <div className="text-center py-8">
                  <Users className={`w-12 h-12 mx-auto mb-3 
                    ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`} />
                  <p className={`text-sm 
                    ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    No pending invitations
                  </p>
                </div>
              ) : (
                pendingList.map((invitation) => (
                  <div key={invitation.id} className={pendingItemClass}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate mb-1">
                          {invitation.email}
                        </h3>
                        <p className={`text-xs mb-2 
                          ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                          Role: <span className="font-medium">{invitation.roleName}</span>
                        </p>
                        <p className={`text-xs 
                          ${theme === "dark" ? "text-gray-500" : "text-gray-500"}`}>
                          Invited: {invitation.invitedAt} • Expires: {invitation.expiresAt}
                        </p>
                      </div>
                      <button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className={cancelButtonClass}
                        title="Cancel invitation"
                      >
                        <Trash2 className="w-4 h-4" />
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