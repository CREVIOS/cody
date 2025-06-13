"use client";

import { useState } from "react";
import EntryPageComponent from "@/components/welcomepage/EntryPage";
import ProjectPromptComponent from "@/components/ProjectPrompt";
import LayoutComponent from "@/components/layout/Layout";
import { User } from '@/lib/projectAPI/TypeDefinitions';

export default function NavigationWrapper() {
  const [currentView, setCurrentView] = useState("entry");
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [showTerminal, setShowTerminal] = useState(false); // ✅ NEW

  // Mock user for testing purposes - in real app this would come from authentication
  const mockUser: User = {
    user_id: "mock-user-id",
    username: "testuser",
    email: "test@example.com",
    full_name: "Test User",
    avatar_url: null,
    status: "active",
    created_at: new Date().toISOString(),
    last_login_at: null
  };

  const goToPrompt = () => setCurrentView("prompt");
  const goToEntry = () => setCurrentView("entry");
  const goToLayout = (name: string, id?: string) => {
    setProjectName(name);
    if (id) setProjectId(id);
    setCurrentView("layout");
  };

  const handleOpenProject = (projectIdParam: string) => {
    // For now, use the projectId as the project name
    // In a real app, you'd fetch the project details from an API
    setProjectName(`Project ${projectIdParam}`);
    setProjectId(projectIdParam);
    setCurrentView("layout");
  };

  switch (currentView) {
    case "prompt":
      return <ProjectPromptComponent onCancel={goToEntry} onSubmit={goToLayout} />;
    case "layout":
      return (
        <LayoutComponent
          projectName={projectName}
          projectId={projectId}
          onHome={goToEntry}
          onTerminalClick={() => setShowTerminal((prev) => !prev)} // ✅ pass handler
          showTerminal={showTerminal} // ✅ pass toggle state
          onExport={() => {}}
          user={mockUser}
        />
      );
    case "entry":
    default:
      return <EntryPageComponent user={mockUser} onNewProject={goToPrompt} onOpenProject={handleOpenProject} />;
  }
}
