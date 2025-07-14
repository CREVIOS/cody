import { useState, useEffect } from "react";
import { Theme } from "@/context/ThemeContext";
import { useRoles } from "@/context/RolesContext";
import { ProjectInvitation } from "@/lib/projectAPI/TypeDefinitions";
import { ModalHeader } from "./ModalHeader";
import { InviteTabs } from "./InviteTabs";
import { InviteForm } from "./InviteForm";
import { PendingInvitations } from "./PendingInvitations";

export interface InviteModalProps {
  projectId?: string;
  projectName: string;
  onClose: () => void;
  onInviteSent: () => void;
  theme: Theme;
  user?: { user_id: string };
  pendingInvitations?: ProjectInvitation[];
}

export default function InviteModal({
  projectId,
  projectName,
  onClose,
  onInviteSent,
  theme,
  user,
  pendingInvitations = []
}: InviteModalProps) {
  const { roles } = useRoles();
  const [activeTab, setActiveTab] = useState<"invite" | "pending">("invite");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [deletingInvitations, setDeletingInvitations] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [localPendingInvitations, setLocalPendingInvitations] = useState<ProjectInvitation[]>(pendingInvitations);

  // Update local state when prop changes
  useEffect(() => {
    setLocalPendingInvitations(pendingInvitations);
  }, [pendingInvitations]);

  // Set default role when roles are available
  useEffect(() => {
    if (roles.length > 0 && !selectedRoleId) {
      const editorRole = roles.find(r => r.role_name.toLowerCase() === 'editor');
      setSelectedRoleId(editorRole?.role_id || roles[0].role_id);
    }
  }, [roles, selectedRoleId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!projectId) {
      setError(null);
      setActiveTab("invite");
    }
  }, [projectId]);

  const handleInvitationCanceled = () => {
    setLocalPendingInvitations(current => 
      current.filter(inv => !deletingInvitations.has(inv.invitation_id))
    );
    if (onInviteSent) {
      onInviteSent();
    }
  };

  const handleDeletingChange = (invitationId: string, isDeleting: boolean) => {
    setDeletingInvitations(prev => {
      const newSet = new Set(prev);
      if (isDeleting) {
        newSet.add(invitationId);
      } else {
        newSet.delete(invitationId);
      }
      return newSet;
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

  if (!projectId) return null;

  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={modalClass} onClick={(e) => e.stopPropagation()}>
        <ModalHeader onClose={onClose} theme={theme} />
        
        <InviteTabs 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
          theme={theme} 
        />

        <div className="p-4 max-h-96 overflow-y-auto">
          {activeTab === "invite" ? (
            <InviteForm
              projectId={projectId}
              projectName={projectName}
              roles={roles}
              selectedRoleId={selectedRoleId}
              onRoleChange={setSelectedRoleId}
              onInviteSent={onInviteSent}
              theme={theme}
              user={user!}
            />
          ) : (
            <PendingInvitations
              invitations={localPendingInvitations}
              roles={roles}
              loading={false}
              error={error}
              theme={theme}
              onInvitationCanceled={handleInvitationCanceled}
              deletingInvitations={deletingInvitations}
              onDeletingChange={handleDeletingChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}