"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";

// Define props with callback functions
interface ProjectPromptProps {
  onCancel: () => void;
  onSubmit: (projectName: string) => void;
}

export default function ProjectPrompt({ onCancel, onSubmit }: ProjectPromptProps) {
  // All hooks are called first, unconditionally
  const { theme } = useTheme();
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState("");

  // Apply theme classes
  const backgroundClass = theme === "dark" 
    ? "bg-[#212124] text-[#E0E0E0]" 
    : "bg-[#F5F5F0] text-[#2D2D2D]";

  const glassClass = theme === "dark"
    ? "bg-[#212124]/40 backdrop-blur-md border border-[#ffffff20]"
    : "bg-[#F0F0F0]/40 backdrop-blur-md border border-[#ffffff50]";

  const inputClass = theme === "dark"
    ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500/50 text-[#E0E0E0]"
    : "bg-white border-gray-300 focus:border-indigo-500 text-[#2D2D2D]";

  const buttonPrimaryClass = theme === "dark"
    ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40"
    : "bg-indigo-500/80 text-white hover:bg-indigo-600";

  const buttonSecondaryClass = theme === "dark"
    ? "bg-[#2A2A2E]/80 text-[#E0E0E0] hover:bg-[#3A3A3E]"
    : "bg-gray-200 text-gray-700 hover:bg-gray-300";

  // Handle project creation
  const handleCreateProject = () => {
    if (projectName.trim()) {
      onSubmit(projectName.trim());
    } else {
      setError("Project name cannot be empty");
    }
  };

  // Handle key press in input - for Enter key to create project
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCreateProject();
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center ${backgroundClass}`}>
      {/* Glass morphic container */}
      <div
        className={`w-full max-w-md rounded-xl p-8 shadow-xl ${glassClass}
          before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b
          ${theme === "dark"
            ? "before:from-[#ffffff15] before:to-transparent"
            : "before:from-[#ffffff80] before:to-transparent"}
          before:z-[-1] relative overflow-hidden`}
      >
        {/* Glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl opacity-20 blur-xl"></div>

        {/* Content */}
        <div className="relative z-10">
          <h2
            className="text-2xl font-bold mb-6 text-center"
            style={{
              textShadow:
                theme === "dark"
                  ? "0 0 10px rgba(139, 92, 246, 0.6)"
                  : "0 0 10px rgba(79, 70, 229, 0.4)"
            }}
          >
            Create New Project
          </h2>

          <label className="block mb-2 text-sm font-medium">
            Project Name
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter project name..."
            className={`w-full px-4 py-2 rounded-lg border ${inputClass} focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all mb-6`}
            autoFocus
          />

          {error && (
            <p className="text-red-500 text-xs mb-4">{error}</p>
          )}

          <div className="flex justify-between gap-4">
            <button
              onClick={onCancel}
              className={`px-4 py-2 rounded-lg ${buttonSecondaryClass} transition-all w-1/2`}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateProject}
              disabled={!projectName.trim()}
              className={`px-4 py-2 rounded-lg ${buttonPrimaryClass} transition-all w-1/2 ${!projectName.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}