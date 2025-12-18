import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { FileSystemProvider } from "@/context/FileSystemContext";
import Sidebar from "@/components/Sidebar";
import InviteModal from "@/components/invitation/InviteModal";
import MembersManagementModal from "@/components/members/MembersManagementModal";
import LockApprovalModal from "@/components/locks/LockApprovalModal";
import { User, ProjectMemberWithDetails, ProjectInvitation } from "@/lib/projectAPI/TypeDefinitions";
import { getProjectMembers } from "@/lib/projectAPI/ProjectMembersAPI";
import { getProjectInvitations } from "@/lib/projectAPI/InvitationAPI";
import { usePermissions } from '@/hooks/usePermissions';
import { useRoles } from '@/context/RolesContext';
import { SidebarHeader } from "./SidebarHeader";
import { LayoutTopBar } from "./LayoutTopBar";
import { MainContentArea } from "./MainContentArea";
import { DraggableCollaborators } from "./DraggableCollaborators";
import PermissionGate from "@/components/PermissionGate";



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
  const { getRoleNameById } = useRoles();
  const [language, setLanguage] = useState("javascript");
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembersManagementModal, setShowMembersManagementModal] = useState(false);
  const [showLockApprovalModal, setShowLockApprovalModal] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState(projectName);
  const [projectMembers, setProjectMembers] = useState<ProjectMemberWithDetails[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<ProjectInvitation[]>([]);
  const [userRoleId, setUserRoleId] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const sidebarResizeRef = useRef<HTMLDivElement>(null);

  // Always use project-specific permissions (projectId + userId)
  // This ensures owners are handled correctly via backend Strategy pattern
  // The backend checks project.owner_id == user_id first, then uses OwnerPermissionStrategy
  // roleId is only used as fallback if project-specific API fails
  // Permissions are now cached - won't re-fetch unnecessarily
  const { hasPermission, loading: permissionsLoading } = usePermissions({
    roleId: userRoleId, // May be null for owners, but that's OK - project-specific fetch handles it
    projectId: projectId,
    userId: user?.user_id,
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
          // Handle the case where we get an empty array due to API error
          if (members && members.length > 0) {
            setProjectMembers(members);
            
            if (user) {
              // Find current user in members list (owner is always included with is_owner: true)
              const currentUserMember = members.find(member => member.user_id === user.user_id);
              if (currentUserMember) {
                // Set roleId if available (owners might have role_id from Owner role, or it might be null)
                // But permissions will be fetched via project-specific API which handles owners correctly
                setUserRoleId(currentUserMember.role_id || null);
              } else {
                // User not found in members - might be owner not in list (shouldn't happen, but handle gracefully)
                setUserRoleId(null);
              }
            }
          } else {
            console.log('No members returned or API error occurred');
            // Even if no members, set roleId to null - permissions API will handle owner check
            setUserRoleId(null);
          }
        } catch (err) {
          console.error('Failed to load project members:', err);
          setMembersError('Failed to load collaborators');
          // On error, set roleId to null - permissions API will handle owner check
          setUserRoleId(null);
        } finally {
          setMembersLoading(false);
        }
      };

      const fetchPendingInvitations = async () => {
        try {
          const invitations = await getProjectInvitations(projectId, 'pending');
          // Check if we got a valid response
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

      // Execute both API calls but handle errors independently
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
  }, [projectId, user, getRoleNameById]);

  // Function to refresh project data
  const refreshProjectData = async () => {
    if (!projectId) return;
    
    try {
      const [members] = await Promise.all([
        getProjectMembers(projectId)
      ]);
      
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

  // Enhanced permission checking with Chain of Responsibility
  // The new system automatically handles role hierarchy and permissions

  // Sidebar resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar) return;
      const newWidth = e.clientX;
      if (newWidth >= 150 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar]);



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
      <div className={`h-screen w-screen grid grid-rows-[60px_1fr] ${backgroundClass}`} style={{ gridTemplateColumns: `${sidebarWidth}px 1fr` }}>
        {/* Sidebar with project name */}
        <div className={`row-span-2 border-r flex flex-col relative ${borderClass}`} style={{ width: sidebarWidth }}>
          <SidebarHeader
            isEditingName={isEditingName}
            currentProjectName={currentProjectName}
            onProjectNameChange={setCurrentProjectName}
            onEditClick={() => setIsEditingName(true)}
            onNameSubmit={handleNameSubmit}
            onKeyDown={handleKeyDown}
            onHome={onHome}
            // Show buttons based on permissions - don't hide during loading if we have cached permissions
            // Only hide if we're loading AND don't have projectId/userId (initial load)
            canInviteUsers={hasPermission('canInvite') && !!user && !!projectId}
            onInviteClick={() => setShowInviteModal(true)}
            canManageMembers={hasPermission('canManageMembers') && !!user && !!projectId}
            onManageMembersClick={() => setShowMembersManagementModal(true)}
            canApproveLock={hasPermission('canApproveLock') && !!user && !!projectId}
            onApproveLockClick={() => setShowLockApprovalModal(true)}
            borderClass={borderClass}
            inputClass={inputClass}
            iconHoverClass={iconHoverClass}
          />

          {/* Regular sidebar content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <Sidebar user={user} userRoleId={userRoleId} />
          </div>

          {/* Resize handle - VSCode style */}
          <div
            ref={sidebarResizeRef}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingSidebar(true);
            }}
            className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors duration-150 ${
              isResizingSidebar 
                ? 'bg-[#007acc]' 
                : 'bg-transparent hover:bg-[#007acc]/50'
            }`}
            style={{ zIndex: 10 }}
          />
        </div>

        {/* Topbar */}
        <LayoutTopBar
          currentProjectName={currentProjectName}
          projectId={projectId}
          theme={theme}
          onCollaboratorsClick={() => setShowCollaborators(!showCollaborators)}
          onTerminalClick={() => setShowTerminal(prev => !prev)}
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
            projectId && user ? (
              <DraggableCollaborators
                projectMembers={projectMembers}
                membersLoading={membersLoading}
                membersError={membersError}
                onClose={() => setShowCollaborators(false)}
                theme={theme}
                projectId={projectId}
                currentUserId={user.user_id}
                currentUsername={user.username}
              />
            ) : null
          }
        />

          {/* Invite Modal (permission-gated) */}
        {/* Show modal immediately if button is visible (permission already checked) */}
        {showInviteModal && user && projectId && hasPermission('canInvite') && (
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

        {/* Members Management Modal (permission-gated) */}
        {/* Show modal immediately if button is visible (permission already checked) */}
        {showMembersManagementModal && user && projectId && hasPermission('canManageMembers') && (
          <MembersManagementModal
            isOpen={showMembersManagementModal}
            onClose={() => setShowMembersManagementModal(false)}
            projectId={projectId}
            projectName={currentProjectName}
            userId={user.user_id}
            theme={theme}
            onMemberUpdated={refreshProjectData}
          />
        )}

        {/* Lock Approval Modal (permission-gated) */}
        {/* Show modal immediately if button is visible (permission already checked) */}
        {showLockApprovalModal && user && projectId && hasPermission('canApproveLock') && (
          <LockApprovalModal
            isOpen={showLockApprovalModal}
            onClose={() => setShowLockApprovalModal(false)}
            projectId={projectId}
            projectName={currentProjectName}
            userId={user.user_id}
            theme={theme}
            onLockReleased={refreshProjectData}
          />
        )}
      </div>
    </FileSystemProvider>
  );
}