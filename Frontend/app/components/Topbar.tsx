"use client";
import { useTheme } from "@/context/ThemeContext";
import { Theme } from '@/context/ThemeContext';
import { useState } from "react";
import {  Play, TerminalSquare, Users  } from 'lucide-react';

export interface TopbarProps {
  projectName: string;
  projectId?: string;
  theme: Theme;
  onCollaboratorsClick: () => void;
  onTerminalClick: () => void;
}

export default function Topbar({
  projectName,
  projectId,
  theme,
  onCollaboratorsClick,
  onTerminalClick,
}: TopbarProps) {
  const { toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const [showTerminal] = useState(false);

  const iconColor = isDark ? "text-white" : "text-black";

  const runButtonClass = isDark
    ? "bg-[#4D4D7F] hover:bg-[#3F3F6A] text-white"
    : "bg-[#A78BFA] hover:bg-[#8B5CF6] text-white";

  const themeToggleClass = isDark ? "bg-[#2A2A2E]" : "bg-[#D1D1CC]";

  const thumbClass = isDark
    ? "translate-x-7 bg-[#4A6B82] text-white"
    : "translate-x-1 bg-white text-[#AD6800]";

  return (
    <>
      <div className="w-full flex items-center justify-end px-4 py-2">


        {/* Right: Run + Terminal + Theme Toggle + Collaborators */}
        <div className="flex items-center space-x-6">
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

        
          {/* Run */}
          <button 
            className={`p-2 rounded-md transition-colors ${ isDark ? "hover:bg-[#3F3F6A]" : "hover:bg-gray-200"} ${iconColor}`}
            title="Run"
          >
            <Play className={`w-5 h-5 ${iconColor}`} />
          </button>
          
          
          {/* Terminal Button */}
          <button
            onClick={onTerminalClick}
            className={`p-2 rounded-md transition-colors ${ isDark ? "hover:bg-[#3F3F6A]" : "hover:bg-gray-200"} ${iconColor}`}
            title="Terminal"
          >
            <TerminalSquare className={`w-5 h-5 ${iconColor}`} />
          </button>

          {/* Collaborators Button */}
          <button
            onClick={onCollaboratorsClick}
            className={`p-2 rounded-md transition-colors ${ isDark ? "hover:bg-[#3F3F6A]" : "hover:bg-gray-200"} ${iconColor}`}
            title="Collaborators"
          >
            <Users className={`w-5 h-5 ${iconColor}`} />
          </button>
        </div>
      </div>

      {/* Terminal panel is managed by Layout/MainContentArea to avoid overlap and enable resizing */}
    </>
  );
}
