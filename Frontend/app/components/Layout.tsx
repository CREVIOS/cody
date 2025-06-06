"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { FileSystemProvider } from "@/context/FileSystemContext";
import { UserPlus } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import FileSystemEditor from "@/components/FileSystemEditor";
import Collaborators from "@/components/Collaborators";
import Terminal from "@/components/Terminal";
import InviteModal from "@/components/InviteModal";

interface LayoutProps {
  projectName: string;
  projectId?: string;
  onHome: () => void;
  onTerminalClick: () => void;
  showTerminal: boolean;
  onExport: () => void;
}

export default function Layout({
  projectName = "Untitled Project",
  projectId,
  onHome,
}: LayoutProps) {
  const { theme } = useTheme();
  const [language, setLanguage] = useState("javascript");
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [currentProjectName, setCurrentProjectName] = useState(projectName);
  const collaboratorsRef = useRef<HTMLDivElement | null>(null);
  const projectNameInputRef = useRef<HTMLInputElement | null>(null);

  // Permission to invite users (condition will be decided later)
  const canInviteUsers = true;

  const backgroundClass = theme === "dark" ? "bg-[#212124] text-[#E0E0E0]" : "bg-[#F5F5F0] text-[#2D2D2D]";
  const borderClass = theme === "dark" ? "border-[#2A2A2E]" : "border-[#D1D1CC]";
  const inputClass = theme === "dark" ? "bg-[#2A2A2E] border-[#3A3A3E] focus:border-indigo-500/50 text-[#E0E0E0]" : "bg-white/80 border-gray-300 focus:border-indigo-500 text-[#2D2D2D]";
  const iconHoverClass = theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-200";

  // Focus input when editing starts
  const [showTerminal, setShowTerminal] = useState(false);

  useEffect(() => {
    if (isEditingName && projectNameInputRef.current) {
      projectNameInputRef.current.focus();
    }
  }, [isEditingName]);

  // Handle project name edit submission
  const handleNameSubmit = () => {
    setIsEditingName(false);
    // If project name is empty, reset to previous value
    if (!currentProjectName.trim()) {
      setCurrentProjectName(projectName);
    }
  };

  // Handle key press in input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleNameSubmit();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
      setCurrentProjectName(projectName);
    }
  };

  // Handle invite modal actions
  const handleSendInvitation = (email: string, role: string) => {
    // You can implement the actual logic here
    console.log(`Sent invitation to ${email} with role ${role} for project ${currentProjectName}`);
  };

  const handleCancelInvitation = (invitationId: string) => {
    // You can implement the actual logic here
    console.log(`Cancelled invitation: ${invitationId}`);
  };

  // Simple drag implementation
  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();

    const box = collaboratorsRef.current;
    if (!box) return;

    // Set dragging state to true
    setIsDragging(true);

    // Get the current positions
    const startX = e.clientX;
    const startY = e.clientY;
    const boxLeft = parseInt(box.style.left) || 100;
    const boxTop = parseInt(box.style.top) || 100;

    // Function to handle mouse movement
    const handleMouseMove = (moveEvent: MouseEvent) => {
      // Calculate the new position
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      // Set the new position
      box.style.left = `${boxLeft + dx}px`;
      box.style.top = `${boxTop + dy}px`;
    };

    // Function to remove event listeners
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    // Add the event listeners
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <FileSystemProvider projectId={projectId || currentProjectName}>
      <div className={`h-screen w-screen grid grid-cols-[250px_1fr] grid-rows-[60px_1fr] ${backgroundClass}`}>
        {/* Sidebar with project name */}
        <div className={`row-span-2 border-r flex flex-col ${borderClass}`}>
          {/* Home icon and Invite icon */}
          <div className={`p-2 border-b flex items-center ${borderClass}`}>
            <button
              onClick={onHome}
              className={`w-8 h-8 rounded-full flex items-center justify-center ${iconHoverClass} transition-colors group relative`}
              title="Back to Home"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
              </svg>

              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                Back to Home
              </div>
            </button>

            {/* Invite Users Icon - Only show if user has permission */}
            {canInviteUsers && (
              <button
                onClick={() => setShowInviteModal(true)}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${iconHoverClass} transition-colors group relative ml-2`}
                title="Invite Users"
              >
                <UserPlus className="w-4 h-4" />

                {/* Tooltip */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Invite Users
                </div>
              </button>
            )}
            
            <div className="flex-1"></div> {/* Empty space */}
          </div>

          {/* Project name section */}
          <div className={`p-4 border-b ${borderClass}`}>
            {isEditingName ? (
              <div className="flex items-center">
                <input
                  ref={projectNameInputRef}
                  type="text"
                  value={currentProjectName}
                  onChange={(e) => setCurrentProjectName(e.target.value)}
                  onBlur={handleNameSubmit}
                  onKeyDown={handleKeyDown}
                  className={`w-full px-2 py-1 rounded border ${inputClass} focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-base font-medium`}
                />
              </div>
            ) : (
              <div
                className="flex items-center group cursor-pointer"
                onClick={() => setIsEditingName(true)}
              >
                <h2
                  className="text-base font-medium truncate"
                  
                >
                  {currentProjectName}
                </h2>
                <svg
                  className="w-4 h-4 ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Regular sidebar content */}
          <div className="p-4 flex-1 overflow-y-auto">
            <Sidebar />
          </div>
        </div>

        {/* Topbar */}
        <div
          className={`col-span-1 flex items-center justify-between border-b px-6 ${borderClass}`}
        >
          <Topbar
            language={language}
            setLanguage={setLanguage}
            onCollaboratorsClick={() => setShowCollaborators(true)}
            onTerminalClick={() => setShowTerminal((prev) => !prev)}
          />
        </div>

        {/* Main content with editor and draggable box */}
        <div className="col-span-1 row-span-1 flex flex-col min-h-0 overflow-hidden p-4 relative">
          <FileSystemEditor />
          {showTerminal && (
            <div className="absolute bottom-0 left-0 right-0 h-60 z-20 px-4">
              <div className="h-full rounded-md overflow-hidden border border-gray-700 bg-[#1e1e1e]">
                <Terminal onClose={() => setShowTerminal(false)} />
              </div>
            </div>
          )}
          

          {showCollaborators && (
            <div
              ref={collaboratorsRef}
              style={{
                left: "100px",
                top: "100px",
                position: "absolute",
              }}
              className={`w-64 select-none ${
                isDragging
                  ? "shadow-2xl scale-[1.02] transition-transform"
                  : "transition-transform"
              }
                ${
                  theme === "dark"
                    ? "bg-[#212124]/40 backdrop-blur-md border border-[#ffffff20] text-[#E0E0E0]"
                    : "bg-[#F0F0F0]/40 backdrop-blur-md border border-[#ffffff50] text-[#2D2D2D]"
                }
                rounded-xl shadow-lg p-4 font-sans text-sm
                before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b
                ${
                  theme === "dark"
                    ? "before:from-[#ffffff15] before:to-transparent"
                    : "before:from-[#ffffff80] before:to-transparent"
                }
                before:z-[-1]
              `}
            >
              <div className="relative z-10">
                {/* Header with drag handle and close button */}
                <div className="flex justify-between items-center mb-2 font-semibold">
                  <div className="flex items-center">
                    {/* Clear drag handle with text label */}
                    <div
                      onMouseDown={handleDragMouseDown}
                      className={`group relative mr-2 px-2 py-1 flex items-center justify-center rounded cursor-move
                        ${
                          theme === "dark"
                            ? "bg-white/20 hover:bg-white/30 text-white"
                            : "bg-gray-400/40 hover:bg-gray-400/60 text-gray-800"
                        }
                        ${isDragging ? "bg-opacity-60" : ""}
                        transition-colors
                      `}
                      title="Click and drag to move"
                    >
                      <span className="mr-1">⠿</span>
                      <span className="text-xs font-normal">Drag</span>

                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        Click and drag to move
                      </div>
                    </div>
                    <h3 className="text-base font-medium">
                      Collaborators
                      {isDragging && (
                        <span
                          className={`ml-2 text-xs font-normal py-0.5 px-1.5 rounded-full
                          ${
                            theme === "dark"
                              ? "bg-indigo-500/30 text-indigo-200"
                              : "bg-indigo-100 text-indigo-800"
                          }`}
                        >
                          Moving...
                        </span>
                      )}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowCollaborators(false)}
                    className="text-lg font-bold hover:opacity-70 w-6 h-6 flex items-center justify-center rounded-full"
                  >
                    ✖
                  </button>
                </div>
                <Collaborators />
              </div>
            </div>
          )}
        </div>

        {/* Invite Modal */}
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          projectName={currentProjectName}
          onSendInvitation={handleSendInvitation}
          onCancelInvitation={handleCancelInvitation}
        />
      </div>
    </FileSystemProvider>
  );
}
