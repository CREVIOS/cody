import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useRoles } from "@/context/RolesContext";
import {  User, Project, ProjectWithRole,  ProjectInvitationWithDetails } from "@/lib/projectAPI/TypeDefinitions";
import { deleteProject } from "@/lib/projectAPI/ProjectAPI";
import { getPendingInvitationsByEmail } from "@/lib/projectAPI/InvitationAPI";
import { getUserProjects } from "@/lib/projectAPI/UserAPI";
import NotificationModal from "@/components/notification/NotificationModal";
import { TopBar } from "./TopBar";
import { ThemeToggle } from "./ThemeToggle";
import { NotificationButton } from "./NotificationButton";
import { UserMenu } from "./UserMenu";
import { MainContent } from "./MainContent";
import { WelcomeSection } from "./WelcomeSection";
import { ProjectsSection } from "./ProjectsSection";
import { ProjectList } from "./ProjectList";




interface EntryPageProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string, projectName?: string) => void;
  user: User;
}

export default function EntryPage({ onNewProject, onOpenProject, user }: EntryPageProps) {
  const { theme, toggleTheme } = useTheme();
  const { loading: rolesLoading } = useRoles();
  const [projects, setProjects] = useState<ProjectWithRole[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [invitationsData, setInvitationsData] = useState<ProjectInvitationWithDetails[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [invitationCount, setInvitationCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  // Load projects on component mount
  useEffect(() => {
    const loadProjects = async () => {
      if (!user?.user_id) {
        console.log('No user_id available, skipping project load');
        return;
      }
      
      try {
        console.log('Loading projects for user:', user.user_id);
        setLoadingProjects(true);
        setProjectsError(null);
        const response = await getUserProjects(user.user_id);
        console.log('Projects response:', response);
        console.log('Response items:', response?.items);
        console.log('Response items length:', response?.items?.length);
        
        if (!response?.items) {
          console.warn('No items array in response');
          setProjects([]);
          return;
        }
        
        setProjects(response.items);
      } catch (err) {
        console.error('Failed to load projects:', err);
        setProjectsError('Failed to load projects');
        setProjects([]);
      } finally {
        setLoadingProjects(false);
      }
    };

    if (user?.user_id) {
      loadProjects();
    }
  }, [user?.user_id]);

  // Load invitation data on component mount or user change
  useEffect(() => {
    const loadInvitationData = async () => {
      if (!user?.email) return;
      
      try {
        setLoadingInvitations(true);
        setInvitationsError(null);
        const invitations = await getPendingInvitationsByEmail(user.email);
        setInvitationsData(invitations);
        setInvitationCount(invitations.length);
      } catch (err) {
        console.error('Failed to load invitations:', err);
        setInvitationsError('Failed to load invitations');
        setInvitationsData([]);
        setInvitationCount(0);
      } finally {
        setLoadingInvitations(false);
      }
    };

    if (user?.email) {
      loadInvitationData();
    }
  }, [user?.email]);

  // Function to refresh invitation data
  const refreshInvitationData = async () => {
    if (!user?.email) return;
    
    try {
      const invitations = await getPendingInvitationsByEmail(user.email);
      setInvitationsData(invitations);
      setInvitationCount(invitations.length);
    } catch (err) {
      console.error('Failed to refresh invitations:', err);
    }
  };

  // Function to handle project deletion
  const handleDeleteProject = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      setProjects(projects.filter(p => p.project_id !== projectId));
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert('Failed to delete project. Please try again.');
    }
  };

  // Function to handle invitation acceptance
  const handleInvitationAccepted = (projectId: string, projectData?: { project: Project; role: string }) => {
    // Add the new project to the list
    if (projectData?.project) {
      const newProject: ProjectWithRole = {
        project_id: projectData.project.project_id,
        project_name: projectData.project.project_name,
        description: projectData.project.description,
        visibility: projectData.project.visibility,
        created_at: projectData.project.created_at,
        modified_at: projectData.project.modified_at,
        owner_id: projectData.project.owner_id,
        is_active: projectData.project.is_active,
        project_settings: projectData.project.project_settings,
        role_id: projectData.role
      };
      setProjects(prev => [...prev, newProject]);
    }
    // Refresh invitations
    refreshInvitationData();
  };

  // Function to handle opening a project
  const handleProjectOpen = (project: ProjectWithRole) => {
    if (project.project_id) {
      onOpenProject(project.project_id, project.project_name);
    }
  };

  // Apply theme classes
  const backgroundClass = theme === "dark" ? "bg-[#212124] text-[#E0E0E0]" : "bg-[#F5F5F0] text-[#2D2D2D]";
  const borderClass = theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200";
  const cardBgClass = theme === "dark" ? "bg-[#212124]" : "bg-white";
  const buttonClass = theme === "dark" ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40" : "bg-indigo-500/80 text-white hover:bg-indigo-600";
  const menuBgClass = theme === "dark" ? "bg-[#2A2A2E] text-[#E0E0E0]" : "bg-white text-[#2D2D2D]";
  const menuHoverClass = theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-100";
  const projectItemClass = theme === "dark" 
    ? "border border-[#3A3A3E] hover:bg-[#3A3A3E] hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] transition-all duration-300"
    : "border hover:bg-gray-100 hover:shadow-[0_0_10px_rgba(79,70,229,0.2)] transition-all duration-300";

  return (
    <div className={`min-h-screen flex flex-col ${backgroundClass}`}>
      <TopBar borderClass={borderClass}>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />

        <div className="flex items-center gap-2">
          <NotificationButton
            invitationCount={invitationCount}
            loadingInvitations={loadingInvitations}
            theme={theme}
            onNotificationClick={() => setShowNotifications(true)}
          />

          <UserMenu
            menuOpen={menuOpen}
            onToggleMenu={() => setMenuOpen(!menuOpen)}
            theme={theme}
            borderClass={borderClass}
            menuBgClass={menuBgClass}
            menuHoverClass={menuHoverClass}
          />
        </div>
      </TopBar>

      <MainContent>
        <WelcomeSection
          username={user.username}
          theme={theme}
          onNewProject={onNewProject}
          buttonClass={buttonClass}
        />

        <ProjectsSection theme={theme}>
          <ProjectList
            projects={projects}
            loadingProjects={loadingProjects}
            rolesLoading={rolesLoading}
            projectsError={projectsError}
            user={user}
            onOpenProject={handleProjectOpen}
            onDeleteProject={handleDeleteProject}
            onNewProject={onNewProject}
            theme={theme}
            cardBgClass={cardBgClass}
            borderClass={borderClass}
            buttonClass={buttonClass}
            projectItemClass={projectItemClass}
          />
        </ProjectsSection>
      </MainContent>

      {/* Notification Modal */}
      <NotificationModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        userEmail={user.email}
        userId={user.user_id}
        invitations={invitationsData}
        loading={loadingInvitations}
        error={invitationsError}
        onInvitationAccepted={(projectId, projectData) => {
          console.log('Invitation accepted for project:', projectId);
          handleInvitationAccepted(projectId, projectData);
        }}
        onRefreshData={refreshInvitationData}
      />
    </div>
  );
}