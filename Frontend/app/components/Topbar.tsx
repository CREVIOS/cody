"use client";
import { useTheme } from "@/context/ThemeContext";
import { User } from '@/lib/projectApi';
import { Theme } from '@/context/ThemeContext';
import Terminal from "@/components/Terminal";
import { useState } from "react";

const languages = [
  { label: "JavaScript", value: "javascript" },
  { label: "Python", value: "python" },
  { label: "C++", value: "cpp" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "JSON", value: "json" },
  { label: "Markdown", value: "markdown" },
  { label: "Java", value: "java" },
];

export interface TopbarProps {
  projectName: string;
  isEditingName: boolean;
  setIsEditingName: (value: boolean) => void;
  onNameChange: (value: string) => void;
  onNameSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onHome: () => void;
  canEditName: boolean;
  canInviteUsers: boolean;
  onInviteClick: () => void;
  pendingInvitationsCount: number;
  theme: Theme;
  user?: User;
  onNewProject: () => void;
  language: string;
  setLanguage: (value: string) => void;
}

export default function Topbar({
  projectName,
  isEditingName,
  setIsEditingName,
  onNameChange,
  onNameSubmit,
  onKeyDown,
  inputRef,
  onHome,
  canEditName,
  canInviteUsers,
  onInviteClick,
  pendingInvitationsCount,
  theme,
  user,
  onNewProject,
  language,
  setLanguage,
}: TopbarProps) {
  const { toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [showTerminal, setShowTerminal] = useState(false);

  // Ensure we have a valid project name for display
  const displayName = projectName?.trim() || "Untitled Project";

  const runButtonClass = isDark
    ? "bg-[#4D4D7F] hover:bg-[#3F3F6A] text-white"
    : "bg-[#A78BFA] hover:bg-[#8B5CF6] text-white";

  const selectClass = isDark
    ? "bg-[#212124] text-[#E0E0E0] border border-[#2A2A2E]"
    : "bg-[#F0F0F0] text-[#2D2D2D] border border-[#D1D1CC]";

  const themeToggleClass = isDark
    ? "bg-[#2A2A2E]"
    : "bg-[#D1D1CC]";

  const thumbClass = isDark
    ? "translate-x-7 bg-[#4A6B82] text-white"
    : "translate-x-1 bg-white text-[#AD6800]";

  return (
    <>
      <div className="w-full flex items-center justify-between">
        {/* Left: Run + Language */}
        <div className="flex items-center space-x-4">
          <button className={`px-4 py-2 rounded ${runButtonClass}`}>
            Run
          </button>
        </div>

        {/* Right: Terminal + Theme Toggle + Collaborators */}
        <div className="flex items-center space-x-6">
          {/* ✅ Terminal Button */}
          <button
            onClick={() => setShowTerminal(!showTerminal)}
            className={`px-4 py-2 ${runButtonClass} rounded`}
          >
            Terminal
          </button>

          {/* Theme Toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm">{isDark ? "Dark" : "Light"} Mode</span>
            <button
              onClick={toggleTheme}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 ${themeToggleClass}`}
            >
              <span
                className={`inline-block h-6 w-6 rounded-full shadow-lg transform transition-transform duration-300 flex items-center justify-center text-sm ${thumbClass}`}
              >
                {isDark ? "🌙" : "☀️"}
              </span>
            </button>
          </div>

          <button
            onClick={onInviteClick}
            className={`px-4 py-2 ${runButtonClass} rounded`}
          >
            Collaborators
          </button>
        </div>
      </div>

      {/* Terminal Panel */}
      {showTerminal && (
        <div className="fixed bottom-0 left-[240px] right-0 h-1/3 bg-black shadow-lg z-50">
          <Terminal onClose={() => setShowTerminal(false)} />
        </div>
      )}
    </>
  );
}
