"use client";

import { useState } from "react";
import EntryPage from "@/components/Entrypage";
import ProjectPrompt from "@/components/ProjectPrompt";
import Layout from "@/components/Layout";

// This is the navigation controller component that handles the routing
export default function Home() {
  const [currentView, setCurrentView] = useState("entry");
  const [projectName, setProjectName] = useState("");

  // Navigation handlers
  const goToPrompt = () => setCurrentView("prompt");
  const goToEntry = () => setCurrentView("entry");
  interface GoToLayout {
    (name: string): void;
  }

  const goToLayout: GoToLayout = (name) => {
    setProjectName(name);
    setCurrentView("layout");
  };

  // Render the appropriate component based on currentView
  if (currentView === "prompt") {
    return <ProjectPrompt 
      onCancel={goToEntry} 
      onSubmit={goToLayout} 
    />;
  }
  
  if (currentView === "layout") {
    return <Layout 
  projectName={projectName} 
  onHome={goToEntry}
  onTerminalClick={() => { /* some function here */ }}
  showTerminal={false} // or true, depending on your logic
/>;

  }

  // Default to entry page
  return <EntryPage onNewProject={goToPrompt} onOpenProject={goToLayout} />;
}