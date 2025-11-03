import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { FileSystemProvider } from "@/context/FileSystemContext";
import Sidebar from "@/components/Sidebar";
import InviteModal from "@/components/invitation/InviteModal";
import { User, ProjectMemberWithDetails, ProjectInvitation } from "@/lib/projectAPI/TypeDefinitions";
import { getProjectMembers } from "@/lib/projectAPI/ProjectMembersAPI";
import { getProjectInvitations } from "@/lib/projectAPI/InvitationAPI";
import { usePermissions } from '@/hooks/usePermissions';
import { useRoles } from '@/context/RolesContext';
import { SidebarHeader } from "./SidebarHeader";
import { LayoutTopBar } from "./LayoutTopBar";
import { MainContentArea } from "./MainContentArea";
import { DraggableCollaborators } from "./DraggableCollaborators";

interface LayoutProps {
  projectName: string;
  projectId?: string;
  onHome: () => void;
  onTerminalClick: () => void;
  showTerminal: boolean;
  onExport: () => void;
  user?: User;
}

export default function Layout({
  projectName = "Untitled Project",
  projectId,
  onHome,
  user,
}: LayoutProps) {
  const { theme } = useTheme();
  useRoles();
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState(projectName);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberWithDetails[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitation[]>([]);
  const [userRoleId, setUserRoleId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  // Use the new permissions hook
  usePermissions({
    roleId: userRoleId,
  });

  // Fetch project data when project opens
  useEffect(() => {
    const fetchProjectData = async () => {
      if (!projectId) return;

      const fetchMembers = async () => {
        try {
          setMembersLoading(true);
          setMembersError(null);
          const members = await getProjectMembers(projectId);
          if (members && members.length > 0) {
            setProjectMembers(members);
            
            if (user) {
              const currentUserMember = members.find(member => member.user_id === user.user_id);
              if (currentUserMember) {
                setUserRoleId(currentUserMember.role_id);
              } else {
                setUserRoleId(null);
              }
            }
          } else {
            console.log('No members returned or API error occurred');
          }
        } catch (err) {
          console.error('Failed to load project members:', err);
          setMembersError('Failed to load collaborators');
        } finally {
          setMembersLoading(false);
        }
      };

      const fetchPendingInvitations = async () => {
        try {
          const invitations = await getProjectInvitations(projectId, 'pending');
          if (invitations && Array.isArray(invitations)) {
            const now = new Date();
            const validInvitations = invitations.filter(inv => {
              const expiresAt = new Date(inv.expires_at);
              return inv.status === 'pending' && expiresAt >= now;
            });
            setPendingInvitations(validInvitations);
          }
        } catch (err) {
          console.error('Failed to load pending invitations:', err);
          setPendingInvitations([]);
        }
      };

      try {
        await fetchMembers();
      } catch (e) {
        console.error('Error in fetchMembers:', e);
      }
      
      try {
        await fetchPendingInvitations();
      } catch (e) {
        console.error('Error in fetchPendingInvitations:', e);
      }
    };

    if (projectId && user) {
      fetchProjectData();
      const refreshInterval = setInterval(fetchProjectData, 30000);
      return () => clearInterval(refreshInterval);
    }
  }, [projectId, user]);

  // Function to refresh project data
  const refreshProjectData = async () => {
    if (!projectId) return;
    
    try {
      const members = await getProjectMembers(projectId);
      setProjectMembers(members);
      
      if (user) {
        const currentUserMember = members.find(member => member.user_id === user.user_id);
        if (currentUserMember) {
          setUserRoleId(currentUserMember.role_id);
        }
      }
    } catch (err) {
      console.error('Failed to refresh project data:', err);
    }
  };

  // Update currentProjectName when projectName prop changes
  useEffect(() => {
    if (projectName && projectName !== currentProjectName) {
      setCurrentProjectName(projectName);
    }
  }, [projectName, currentProjectName]);

  // Handle project name edit submission
  const handleNameSubmit = () => {
    setIsEditingName(false);
    const trimmedName = currentProjectName.trim();
    if (!trimmedName) {
      setCurrentProjectName(projectName || "Untitled Project");
    }
  };

  // Handle key press in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setCurrentProjectName(projectName);
    }
  };

  // Function to check if user is owner/admin
  const isOwnerOrAdmin = () => {
    const userMember = projectMembers.find(member => member.user_id === user?.user_id);
    return userMember?.role.role_name.toLowerCase() === 'owner' || 
           userMember?.role.role_name.toLowerCase() === 'admin';
  };

  // Get user's role name for the lock system
  const getUserRoleName = (): string => {
    if (!user || projectMembers.length === 0) return "editor";
    const userMember = projectMembers.find(member => member.user_id === user.user_id);
    return userMember?.role.role_name.toLowerCase() || "editor";
  };

  const backgroundClass = theme === "dark" ? "bg-[#212124] text-[#E0E0E0]" : "bg-[#F5F5F0] text-[#2D2D2D]";
  const borderClass = theme === "dark" ? "border-[#2A2A2E]" : "border-[#D1D1CC]";
  const inputClass = theme === "dark" ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500/50 text-[#E0E0E0]" : "bg-white/80 border-gray-300 focus:border-indigo-500 text-[#2D2D2D]";
  const iconHoverClass = theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-200";

  return (
    <FileSystemProvider projectId={projectId || currentProjectName}>
      <div className={`h-screen w-screen grid grid-cols-[250px_1fr] grid-rows-[60px_1fr] ${backgroundClass}`}>
        {/* Sidebar with project name */}
        <div className={`row-span-2 border-r flex flex-col ${borderClass}`}>
          <SidebarHeader
            isEditingName={isEditingName}
            currentProjectName={currentProjectName}
            onProjectNameChange={setCurrentProjectName}
            onEditClick={() => setIsEditingName(true)}
            onNameSubmit={handleNameSubmit}
            onKeyDown={handleKeyDown}
            onHome={onHome}
            canInviteUsers={isOwnerOrAdmin() && !!user && !!projectId}
            onInviteClick={() => setShowInviteModal(true)}
            borderClass={borderClass}
            inputClass={inputClass}
            iconHoverClass={iconHoverClass}
          />

          <div className="flex-1 overflow-y-auto">
            <Sidebar />
          </div>
        </div>

        {/* Topbar */}
        <LayoutTopBar
          currentProjectName={currentProjectName}
          projectId={projectId}
          theme={theme}
          onCollaboratorsClick={() => setShowCollaborators(!showCollaborators)}
        />

        {/* Main content with editor and draggable box */}
        <MainContentArea
          showTerminal={showTerminal}
          onTerminalClose={() => setShowTerminal(false)}
          showCollaborators={showCollaborators}
          projectId={projectId}
          user={user}
          userRole={getUserRoleName()}
          collaboratorsComponent={
            <DraggableCollaborators
              projectMembers={projectMembers}
              membersLoading={membersLoading}
              membersError={membersError}
              onClose={() => setShowCollaborators(false)}
              theme={theme}
            />
          }
        />

        {/* Invite Modal */}
        {showInviteModal && user && projectId && isOwnerOrAdmin() && (
          <InviteModal
            onClose={() => setShowInviteModal(false)}
            projectId={projectId}
            projectName={currentProjectName}
            onInviteSent={refreshProjectData}
            theme={theme}
            user={user}
            pendingInvitations={pendingInvitations}
          />
        )}
      </div>
    </FileSystemProvider>
  );
}