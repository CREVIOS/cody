"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useRef } from "react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteProject, getUserProjects, User, Project, ProjectWithRole } from "@/lib/projectApi";
import { Bell } from "lucide-react";
import NotificationModal from "@/components/NotificationModal";

interface EntryPageProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string) => void;
  user: User;
}

export default function EntryPage({ onNewProject, onOpenProject, user }: EntryPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [ownedProjects, setOwnedProjects] = useState<Project[]>([]);
  const [memberProjects, setMemberProjects] = useState<ProjectWithRole[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; projectId: string | null }>({
    show: false,
    projectId: null
  });
  
  // Load projects on component mount or user change
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const projectData = await getUserProjects(user.user_id);
        setOwnedProjects(projectData.owned_projects);
        setMemberProjects(projectData.member_projects);
      } catch (err) {
        console.error('Failed to load projects:', err);
        setError('Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadProjects();
    }
  }, [user]);

  // Handle project deletion
  const handleDeleteProject = async (projectId: string) => {
    try {
      setLoading(true);
      await deleteProject(projectId);
      // Reload projects after deletion
      const projectData = await getUserProjects(user.user_id);
      setOwnedProjects(projectData.owned_projects);
      setMemberProjects(projectData.member_projects);
      setDeleteConfirm({ show: false, projectId: null });
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError('Failed to delete project');
    } finally {
      setLoading(false);
    }
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
  const borderClass = theme === "dark" ? "border-[#2A2A2E]" : "border-[#D1D1CC]";
  const cardBgClass = theme === "dark" ? "bg-[#2A2A2E]" : "bg-white";
  const buttonClass = theme === "dark" ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40" : "bg-indigo-500/80 text-white hover:bg-indigo-600";
  const menuBgClass = theme === "dark" ? "bg-[#2A2A2E] text-[#E0E0E0]" : "bg-white text-[#2D2D2D]";
  const menuHoverClass = theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-100";
  const projectItemClass = theme === "dark" 
    ? "border border-[#3A3A3E] hover:bg-[#3A3A3E] hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] transition-all duration-300"
    : "border hover:bg-gray-100 hover:shadow-[0_0_10px_rgba(79,70,229,0.2)] transition-all duration-300";

  // Handle notification actions
  const handleAcceptInvitation = (invitationId: string) => {
    console.log(`Accepted invitation: ${invitationId}`);
    setShowNotifications(false);
  };

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
            
            {/* Notification badge */}
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
              <span className="text-[10px] text-white font-bold">3</span>
            </div>

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Notifications
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

      {/* Main content - Two Column Layout */}
      <div className="flex flex-1 px-8 py-8 gap-8 space-y-7 ml-35">
        {/* Left Column - Welcome & Button */}
        <div className="w-1/2 flex flex-col justify-center items-start">
          <h1 className={`text-7xl font-bold mb-8 transition-colors ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
            Welcome back,
          </h1>
          <h1 className={`text-5xl font-bold mb-8 transition-colors ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
            {user.username}
          </h1>
          <button onClick={onNewProject} className={`mt-4 px-6 py-4 ${buttonClass} rounded-xl hover:shadow-lg transition-all w-fit text-sm font-medium flex items-center gap-2`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Create New Project
          </button>
        </div>

        {/* Right Column - Projects */}
        <div className="w-1/2 flex flex-col">
          <h1 className="text-2xl font-semibold mb-3 mx-auto" style={{ textShadow: theme === "dark" ? "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.4)" : "0 0 10px rgba(240, 239, 248, 0.6), 0 0 20px rgba(241, 240, 245, 0.3)" }}>
            Your Projects
          </h1>
          <div className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-6 overflow-y-auto max-h-[70vh] border ${borderClass}`}>
            {loading ? (
              <ul className="space-y-2">
                {[...Array(5)].map((_, index) => (
                  <li key={index} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass}`}>
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </li>
                ))}
              </ul>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-red-500 mb-4">{error}</p>
                <button onClick={() => window.location.reload()} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Retry</button>
              </div>
            ) : ownedProjects.length === 0 && memberProjects.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p className="mb-4">No projects found</p>
                <button onClick={onNewProject} className={`px-4 py-2 ${buttonClass} rounded-lg text-sm`}>Create Your First Project</button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Owned Projects */}
                {ownedProjects.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-3">Owned Projects</h2>
                    <ul className="space-y-2">
                      {ownedProjects.map((project) => (
                        <li key={project.project_id} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass} transition-colors cursor-pointer group`} onClick={() => onOpenProject(project.project_id)}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700"}`}>
                            {project.project_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="truncate block font-medium">{project.project_name}</span>
                            <span className="text-xs opacity-70">Last modified: {new Date(project.modified_at || project.created_at).toLocaleDateString()}</span>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, projectId: project.project_id }); }} className={`opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full ${theme === "dark" ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-100 text-red-600"}`} title="Delete project">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Member Projects */}
                {memberProjects.length > 0 && (
                  <div>
                    <h2 className="text-lg font-medium mb-3">Collaborated Projects</h2>
                    <ul className="space-y-2">
                      {memberProjects.map(({ project, role }) => (
                        <li key={project.project_id} className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass} transition-colors cursor-pointer group`} onClick={() => onOpenProject(project.project_id)}>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${theme === "dark" ? "bg-indigo-500/30 text-indigo-200" : "bg-indigo-100 text-indigo-700"}`}>
                            {project.project_name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="truncate block font-medium">{project.project_name}</span>
                            <span className="text-xs opacity-70">Role: {role} • Last modified: {new Date(project.modified_at || project.created_at).toLocaleDateString()}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`${cardBgClass} p-6 rounded-xl shadow-xl border ${borderClass} max-w-md w-full mx-4`}>
            <h3 className="text-lg font-semibold mb-4">Delete Project</h3>
            <p className="mb-6 opacity-80">Are you sure you want to delete this project? This action cannot be undone and will permanently remove all files and folders.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteConfirm({ show: false, projectId: null })} className={`px-4 py-2 rounded-lg border ${borderClass} ${theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-100"} transition-colors`}>Cancel</button>
              <button onClick={() => deleteConfirm.projectId && handleDeleteProject(deleteConfirm.projectId)} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      <NotificationModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        userEmail={user.email}
        userId={user.user_id}
        onInvitationAccepted={(projectId) => {
          // Refresh projects when invitation is accepted
          console.log('Invitation accepted for project:', projectId);
        }}
      />
    </div>
  );
}