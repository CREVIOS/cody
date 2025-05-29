"use client";

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import { useRef } from "react";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";

interface EntryPageProps {
  onNewProject: () => void;
}

export default function EntryPage({ onNewProject }: EntryPageProps) {
  const { theme, toggleTheme } = useTheme();
  const name = "Moumita"; // Replace with dynamic value
  const [projects] = useState([
    "Project Alpha",
    "Beta Testing",
    "Gamma UI Revamp",
    "Delta Refactor",
    "Echo Prototype",
    "Figma Redesign",
    "GraphQL Migration",
    "HTTP Logger Tool",
    "Internal Dashboard",
    "JSON Formatter",
  ]);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1500); // simulate 1.5s delay
    return () => clearTimeout(timer);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Apply theme classes
  const backgroundClass =
    theme === "dark"
      ? "bg-[#212124] text-[#E0E0E0]"
      : "bg-[#F5F5F0] text-[#2D2D2D]";

  const borderClass =
    theme === "dark" ? "border-[#2A2A2E]" : "border-[#D1D1CC]";

  const cardBgClass = theme === "dark" ? "bg-[#2A2A2E]" : "bg-white";

  const buttonClass =
    theme === "dark"
      ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40"
      : "bg-indigo-500/80 text-white hover:bg-indigo-600";

  const menuBgClass =
    theme === "dark"
      ? "bg-[#2A2A2E] text-[#E0E0E0]"
      : "bg-white text-[#2D2D2D]";

  const menuHoverClass =
    theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-100";

  const projectItemClass =
    theme === "dark"
      ? "border border-[#3A3A3E] hover:bg-[#3A3A3E] hover:shadow-[0_0_10px_rgba(139,92,246,0.3)] transition-all duration-300"
      : "border hover:bg-gray-100 hover:shadow-[0_0_10px_rgba(79,70,229,0.2)] transition-all duration-300";

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
          title={
            theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"
          }
        >
          {theme === "dark" ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                clipRule="evenodd"
              ></path>
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path>
            </svg>
          )}
        </button>

        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-opacity-20 hover:bg-gray-500 transition-colors"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5.121 17.804A4 4 0 017 17h10a4 4 0 011.879.804M15 11a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {menuOpen && (
          <div
            ref={menuRef}
            className={`absolute top-16 right-6 w-48 ${menuBgClass} border ${borderClass} rounded-xl shadow-lg z-10 overflow-hidden
              before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b
              ${
                theme === "dark"
                  ? "before:from-[#ffffff15] before:to-transparent"
                  : "before:from-[#ffffff80] before:to-transparent"
              }
              before:z-[-1]`}
          >
            <ul className="text-sm relative z-10">
              <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>
                Profile
              </li>
              <li className={`px-4 py-3 ${menuHoverClass} cursor-pointer`}>
                Settings
              </li>
              <li
                className={`px-4 py-3 ${
                  theme === "dark"
                    ? "hover:bg-red-900/30 text-red-400"
                    : "hover:bg-red-100 text-red-600"
                } cursor-pointer`}
              >
                Log out
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Main content - Two Column Layout */}
      <div className="flex flex-1 px-8 py-8 gap-8 space-y-7 ml-35">
        {/* Left Column - Welcome & Button */}
        <div className="w-1/2 flex flex-col justify-center items-start">
          <h1
            className={`text-7xl font-bold mb-8 transition-colors ${
              theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"
            }`}
            style={{
              textShadow:
                theme === "dark"
                  ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)"
                  : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)",
            }}
          >
            Welcome back,
          </h1>
          <h1
            className={`text-5xl font-bold mb-8 transition-colors ${
              theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"
            }`}
            style={{
              textShadow:
                theme === "dark"
                  ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)"
                  : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)",
            }}
          >
            {name}
          </h1>
          <button
            onClick={onNewProject}
            className={`mt-4 px-6 py-4 ${buttonClass} rounded-xl hover:shadow-lg transition-all w-fit text-sm font-medium flex items-center gap-2`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            Create New Project
          </button>
        </div>

        
        
        {/* Right Column - Projects */}
        <div className="w-1/2 flex flex-col">
          <h1
            className="text-2xl font-semibold mb-3 mx-auto"
            style={{
              textShadow:
                theme === "dark"
                  ? "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.4)"
                  : "0 0 10px rgba(240, 239, 248, 0.6), 0 0 20px rgba(241, 240, 245, 0.3)",
            }}
          >
            Your Projects
          </h1>
          <div
            className={`w-full ${cardBgClass} rounded-2xl shadow-lg p-6 overflow-y-auto max-h-[70vh] border ${borderClass}`}
          >
            {loading ? (
              <ul className="space-y-2">
                {[...Array(10)].map((_, index) => (
                  <li
                    key={index}
                    className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass}`}
                  >
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-2">
                {projects.map((project, index) => (
                  <li
                    key={index}
                    className={`flex items-center gap-4 p-4 rounded-full ${projectItemClass} transition-colors cursor-pointer`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        theme === "dark"
                          ? "bg-indigo-500/30 text-indigo-200 hover:bg-indigo-500/40"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="truncate">{project}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
