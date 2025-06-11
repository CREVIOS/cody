"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useRoles } from "@/context/RolesContext";
import { useRef } from "react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteProject, getUserProjects, User, Project, ProjectWithRole, getPendingInvitationsByEmail, ProjectInvitationWithDetails } from "@/lib/projectApi";
import { Bell } from "lucide-react";
import NotificationModal from "@/components/NotificationModal";

interface EntryPageProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
  user: User;
}

export default function EntryPage({ onNewProject, onOpenProject, user }: EntryPageProps) {
  const { theme, toggleTheme } = useTheme();
  const { getRoleNameById, loading: rolesLoading } = useRoles();
  const [projects, setProjects] = useState<ProjectWithRole[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [invitationsData, setInvitationsData] = useState<ProjectInvitationWithDetails[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [invitationCount, setInvitationCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && event.target instanceof Node && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      {/* Top bar with user icon and theme toggle */}
      <div className={`flex justify-between p-6 relative ${borderClass}`}>
        {/* Theme Toggle Button */}
        <button
          onClick={toggleTheme}
          className={`flex items-center justify-center w-10 h-10 rounded-full hover:bg-opacity-20 hover:bg-gray-500 transition-colors ${
            theme === "dark" ? "bg-[#2A2A2E]/50" : "bg-white/50"
          }`}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd"></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
            </svg>
          )}
        </button>

        <div className="flex items-center gap-2">
          {/* Notification Icon */}
          <button
            onClick={() => setShowNotifications(true)}
            className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-200"} transition-colors group relative`}
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            
            {/* Notification badge - only show if there are invitations */}
            {invitationCount > 0 && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] text-white font-bold">
                  {invitationCount > 99 ? '99+' : invitationCount}
                </span>
              </div>
            )}

            {/* Loading indicator for invitations */}
            {loadingInvitations && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-400 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Notifications{invitationCount > 0 ? ` (${invitationCount})` : ''}
            </div>
          </button>

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-opacity-20 hover:bg-gray-500 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A4 4 0 017 17h10a4 4 0 011.879.804M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div ref={menuRef} className={`absolute top-16 right-6 w-48 ${menuBgClass} border ${borderClass} rounded-xl shadow-lg z-10 overflow-hidden before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b ${theme === "dark" ? "before:from-[#ffffff15] before:to-transparent" : "before:from-[#ffffff80] before:to-transparent"} before:z-[-1]`}>
            <ul className="text-sm relative z-10">
              <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>Profile</li>
              <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>Settings</li>
              <li className={`px-4 py-3 ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"} cursor-pointer`}>Log out</li>
            </ul>
          </div>
        )}
      </div>

      {/* Main content - Responsive Welcome & Projects Layout */}
      <div className="flex flex-1 flex-col md:flex-row px-4 md:px-8 py-8 gap-8 md:gap-12 w-full">
        {/* Left Column - Welcome & Button */}
        <div className="flex-1 flex flex-col justify-center items-center md:items-start text-center md:text-left min-w-0">
          <h1 className={`text-5xl md:text-7xl font-bold mb-4 md:mb-8 transition-colors leading-tight break-words w-full ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
            Welcome back,
          </h1>
          <h1 className={`text-3xl md:text-5xl font-bold mb-6 md:mb-8 transition-colors leading-tight break-words w-full ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
            {user.username}
          </h1>
          <button onClick={onNewProject} className={`mt-2 md:mt-4 px-4 md:px-6 py-3 md:py-4 ${buttonClass} rounded-xl hover:shadow-lg transition-all w-full md:w-fit text-base md:text-sm font-medium flex items-center justify-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create New Project
          </button>
        </div>

        {/* Right Column - Projects */}
        <div className="flex-1 flex flex-col w-full min-w-0 mt-8 md:mt-0">
          <h1 className="text-xl md:text-2xl font-semibold mb-3 mx-auto md:mx-0" style={{ textShadow: theme === "dark" ? "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.4)" : "0 0 10px rgba(240, 239, 248, 0.6), 0 0 20px rgba(241, 240, 245, 0.3)" }}>
            Your Projects
          </h1>
          <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-4 md:p-6 overflow-y-auto max-h-[60vh] md:max-h-[70vh] border ${borderClass}`}>
            {loadingProjects || rolesLoading ? (
              <ul className="space-y-2">
                {[...Array(5)].map((_, index) => (
                  <li key={index} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass}`}>
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </li>
                ))}
              </ul>
            ) : projectsError ? (
              <div className="text-center py-8">
                <p className="text-red-500 mb-4">{projectsError}</p>
                <button onClick={() => window.location.reload()} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Retry</button>
              </div>
            ) : (projects?.length === 0) ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">No projects found</p>
                <button onClick={onNewProject} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Create Your First Project</button>
              </div>
            ) : (
              <div className="space-y-6">
                {projects?.map((project) => {
                  if (!project?.project_id || !project?.role_id) {
                    console.warn('Invalid project data:', project);
                    return null;
                  }
                  
                  return (
                    <div key={project.project_id} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass} transition-colors cursor-pointer group`} onClick={() => onOpenProject(project.project_id)}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700"}`}>
                        {(project.project_name || 'Untitled').charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="truncate block font-medium">{project.project_name || 'Untitled Project'}</span>
                        <span className="text-xs opacity-70">
                          Role: {project.role_id === 'unknown' ? 'Unknown Role' : getRoleNameById(project.role_id)} • 
                          Last modified: {new Date(project.modified_at || project.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {/* Only show delete button for owners */}
                      {project.owner_id === user.user_id && (
                        <button 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleDeleteProject(project.project_id); 
                          }} 
                          className={`opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"}`} 
                          title="Delete project"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
          // Refresh projects when invitation is accepted
          console.log('Invitation accepted for project:', projectId);
          // Refresh invitation data  
          handleInvitationAccepted(projectId, projectData);
        }}
        onRefreshData={refreshInvitationData}
      />
    </div>
  );
}