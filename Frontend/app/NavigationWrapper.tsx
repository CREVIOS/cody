"use client";

// NavigationWrapper.tsx
import { useState } from "react";
import EntryPageComponent from "@/components/Entrypage";
import ProjectPromptComponent from "@/components/ProjectPrompt";
import LayoutComponent from "@/components/Layout";

// This is a navigation controller component that doesn't use hooks in conditional logic
export default function NavigationWrapper() {
  const [currentView, setCurrentView] = useState("entry");
  const [projectName, setProjectName] = useState("");

  // Functions to pass down to child components
  const goToPrompt = () => setCurrentView("prompt");
  const goToEntry = () => setCurrentView("entry");
  const goToLayout = (name: string) => {
    setProjectName(name);
    setCurrentView("layout");
  };

  // Render the appropriate component based on currentView
  switch (currentView) {
    case "prompt":
      return <ProjectPromptComponent onCancel={goToEntry} onSubmit={goToLayout} />;
    case "layout":
      return <LayoutComponent projectName={projectName} onHome={goToEntry} />;
    case "entry":
    default:
      return <EntryPageComponent onNewProject={goToPrompt} />;
  }
}