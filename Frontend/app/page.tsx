"use client";

import { useState } from "react";
import EntryPage from "@/components/Entrypage";
import ProjectPrompt from "@/components/ProjectPrompt";
import Layout from "@/components/Layout";
import AppWrapper from "@/components/AppWrapper";
import { User, getUserProjects, Project } from "@/lib/projectApi";

// This is the navigation controller component that handles the routing
export default function Home() {
  const [currentView, setCurrentView] = useState("userSelection");
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Navigation handlers
  const goToPrompt = () => setCurrentView("prompt");
  const goToEntry = () => {
    if (selectedUser) {
      setCurrentView("entry");
    } else {
      setCurrentView("userSelection");
    }
  };
  const goToUserSelection = () => {
    setSelectedUser(null);
    setCurrentView("userSelection");
  };
  
  const goToLayout = (name: string, id?: string) => {
    setProjectName(name);
    if (id) setProjectId(id);
    setCurrentView("layout");
  };

  // Handler for opening an existing project
  const handleOpenProject = async (projectId: string) => {
    if (!selectedUser) return;
    try {
      const projectsData = await getUserProjects(selectedUser.user_id);
      const found = projectsData.items.find(p => p.project_id === projectId);
      if (!found) {
        console.warn('Project not found in user projects:', projectId);
        goToLayout("Untitled Project", projectId);
        return;
      }
      
      // Ensure we have a valid project name
      const projectName = found.project_name?.trim() || "Untitled Project";
      goToLayout(projectName, projectId);
    } catch (e) {
      console.error('Error fetching project:', e);
      goToLayout("Untitled Project", projectId);
    }
  };

  // Handler for creating a new project
  const handleNewProject = () => {
    goToPrompt();
  };

  // Handler for user selection
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setCurrentView("entry");
  };

  // Render the appropriate component based on currentView
  if (currentView === "userSelection" || !selectedUser) {
    return <AppWrapper onNewProject={handleNewProject} onOpenProject={handleOpenProject} onSelectUser={handleSelectUser} />;
  }

  if (currentView === "prompt") {
    return (
      <ProjectPrompt 
        onCancel={goToEntry} 
        onSubmit={(name) => goToLayout(name)} 
      />
    );
  }
  
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
      onNewProject={handleNewProject}
      onOpenProject={handleOpenProject}
    />
  );
}