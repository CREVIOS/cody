"use client";

import { useState, useEffect } from "react";
import EntryPage from "@/components/welcomepage/EntryPage";
import Layout from "@/components/layout/Layout";
import AppWrapper from "@/components/AppWrapper";
import { User, Project } from '@/lib/projectAPI/TypeDefinitions';
import { getProjects } from "@/lib/projectAPI/ProjectAPI";

// This is the navigation controller component that handles the routing
export default function Home() {
  const [currentView, setCurrentView] = useState("userSelection");
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Local storage keys
  const SELECTED_USER_KEY = "app-selected-user";
  const CURRENT_VIEW_KEY = "app-current-view";
  const CURRENT_PROJECT_ID_KEY = "app-current-project-id";
  const CURRENT_PROJECT_NAME_KEY = "app-current-project-name";

  // Rehydrate state from localStorage on first load
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem(SELECTED_USER_KEY);
      const storedView = localStorage.getItem(CURRENT_VIEW_KEY);
      const storedProjectId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
      const storedProjectName = localStorage.getItem(CURRENT_PROJECT_NAME_KEY);

      if (storedUser) {
        const parsedUser: User = JSON.parse(storedUser);
        setSelectedUser(parsedUser);
      }

      if (storedView) {
        setCurrentView(storedView);
      }

      if (storedProjectId) {
        setProjectId(storedProjectId);
      }
      if (storedProjectName) {
        setProjectName(storedProjectName);
      }
    } catch (e) {
      // If parsing fails, clear invalid data
      localStorage.removeItem(SELECTED_USER_KEY);
      localStorage.removeItem(CURRENT_VIEW_KEY);
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist selected user
  useEffect(() => {
    if (!hydrated) return;
    if (selectedUser) {
      localStorage.setItem(SELECTED_USER_KEY, JSON.stringify(selectedUser));
    } else {
      localStorage.removeItem(SELECTED_USER_KEY);
    }
  }, [selectedUser, hydrated]);

  // Persist current view
  useEffect(() => {
    if (!hydrated) return;
    if (currentView) {
      localStorage.setItem(CURRENT_VIEW_KEY, currentView);
    }
  }, [currentView, hydrated]);

  // Persist project context when on layout
  useEffect(() => {
    if (!hydrated) return;
    if (currentView === "layout") {
      if (projectId) localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
      if (projectName) localStorage.setItem(CURRENT_PROJECT_NAME_KEY, projectName);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
    }
  }, [currentView, projectId, projectName, hydrated]);

  // Navigation handlers
  const goToEntry = () => {
    if (selectedUser) {
      setCurrentView("entry");
    } else {
      setCurrentView("userSelection");
    }
  };
  
  const goToLayout = (name: string, id?: string) => {
    setProjectName(name);
    if (id) setProjectId(id);
    setCurrentView("layout");
  };

  // Handler for opening an existing project
  const handleOpenProject = async (projectId: string, projectName?: string) => {
    if (!selectedUser) return;
    
    // If we have the project name, use it directly
    if (projectName) {
      goToLayout(projectName.trim() || "Untitled Project", projectId);
      return;
    }

    // Otherwise fetch the project details
    try {
      const projectsData = await getProjects(0, 100, selectedUser.user_id);
      const found = projectsData.find((p: Project) => p.project_id === projectId);
      if (!found) {
        console.warn('Project not found in user projects:', projectId);
        goToLayout("Untitled Project", projectId);
        return;
      }
      
      // Ensure we have a valid project name
      const name = found.project_name?.trim();
      if (!name) {
        console.warn('Project name is empty for project:', projectId);
        goToLayout("Untitled Project", projectId);
        return;
      }
      
      goToLayout(name, projectId);
    } catch (e) {
      console.error('Error fetching project:', e);
      goToLayout("Untitled Project", projectId);
    }
  };

  // Handler for creating a new project
  const handleNewProject = () => {
    // Instead of going to the simple prompt, we'll handle this in the EntryPage
    // which has the proper ProjectCreateModal
    goToEntry();
  };

  // Handler for user selection
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setCurrentView("entry");
  };

  // Handler for logout
  const handleLogout = () => {
    setSelectedUser(null);
    setCurrentView("userSelection");
    // Clear persisted state
    localStorage.removeItem(SELECTED_USER_KEY);
    localStorage.removeItem(CURRENT_VIEW_KEY);
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
  };

  // Avoid flicker/mismatch before hydration
  if (!hydrated) {
    return null;
  }

  // Render the appropriate component based on currentView
  if (currentView === "userSelection" || !selectedUser) {
    return <AppWrapper onOpenProject={handleOpenProject} onSelectUser={handleSelectUser} onLogout={handleLogout} />;
  }

  // Remove the old ProjectPrompt flow since we're using ProjectCreateModal now
  // if (currentView === "prompt") {
  //   return (
  //     <ProjectPrompt 
  //       onCancel={goToEntry} 
  //       onSubmit={(name) => goToLayout(name)} 
  //     />
  //   );
  // }
  
  if (currentView === "layout") {
    return (
      <Layout 
        projectName={projectName}
        projectId={projectId}
        onHome={goToEntry}
        onTerminalClick={() => {}}
        onExport={() => { /* some function here */ }}
        showTerminal={false}
        user={selectedUser || undefined}
      />
    );
  }

  // Default to entry page with user selection
  return (
    <EntryPage
      user={selectedUser!}
      onOpenProject={handleOpenProject}
      onLogout={handleLogout}
    />
  );
}