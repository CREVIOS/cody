"use client";

import { useState } from "react";
import EntryPageComponent from "@/components/Entrypage";
import ProjectPromptComponent from "@/components/ProjectPrompt";
import LayoutComponent from "@/components/Layout";

export default function NavigationWrapper() {
  const [currentView, setCurrentView] = useState("entry");
  const [projectName, setProjectName] = useState("");
  const [showTerminal, setShowTerminal] = useState(false); // ✅ NEW

  const goToPrompt = () => setCurrentView("prompt");
  const goToEntry = () => setCurrentView("entry");
  const goToLayout = (name: string) => {
    setProjectName(name);
    setCurrentView("layout");
  };

  switch (currentView) {
    case "prompt":
      return <ProjectPromptComponent onCancel={goToEntry} onSubmit={goToLayout} />;
    case "layout":
      return (
        <LayoutComponent
          projectName={projectName}
          onHome={goToEntry}
          onTerminalClick={() => setShowTerminal((prev) => !prev)} // ✅ pass handler
          showTerminal={showTerminal} // ✅ pass toggle state
        />
      );
    case "entry":
    default:
      return <EntryPageComponent onNewProject={goToPrompt} />;
  }
}
