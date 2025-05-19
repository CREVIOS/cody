"use client";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import CodeEditor from "@/components/Editor";
import Collaborators from "@/components/Collaborators";
import { useTheme } from "@/context/ThemeContext";
import { useState, useRef, useEffect } from "react";

export default function Layout() {
  const { theme } = useTheme();
  const [language, setLanguage] = useState("javascript");
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const collaboratorsRef = useRef<HTMLDivElement | null>(null);

  const backgroundClass =
    theme === "dark"
      ? "bg-[#212124] text-[#E0E0E0]"
      : "bg-[#F5F5F0] text-[#2D2D2D]";

  const borderClass =
    theme === "dark" ? "border-[#2A2A2E]" : "border-[#D1D1CC]";

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
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Add the event listeners
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      className={`h-screen w-screen grid grid-cols-[250px_1fr] grid-rows-[60px_1fr] ${backgroundClass}`}
    >
      {/* Sidebar */}
      <div className={`row-span-2 border-r p-4 flex flex-col ${borderClass}`}>
        <Sidebar />
      </div>

      {/* Topbar */}
      <div
        className={`col-span-1 flex items-center justify-between border-b px-6 ${borderClass}`}
      >
        <Topbar
          language={language}
          setLanguage={setLanguage}
          onCollaboratorsClick={() => setShowCollaborators(true)}
        />
      </div>

      {/* Main content with editor and draggable box */}
      <div className="col-span-1 row-span-1 flex flex-col min-h-0 overflow-hidden p-4 relative">
        <CodeEditor theme={theme} language={language} />

        {showCollaborators && (
          <div
            ref={collaboratorsRef}
            style={{
              left: "100px",
              top: "100px",
              position: "absolute",
            }}
            className={`w-64 select-none ${isDragging ? "shadow-2xl scale-[1.02] transition-transform" : "transition-transform"}
              ${theme === "dark"
                ? "bg-[#212124]/40 backdrop-blur-md border border-[#ffffff20] text-[#E0E0E0]"
                : "bg-[#F0F0F0]/40 backdrop-blur-md border border-[#ffffff50] text-[#2D2D2D]"
              }
              rounded-xl shadow-lg p-4 font-sans text-sm
              before:absolute before:inset-0 before:rounded-xl before:bg-gradient-to-b
              ${theme === "dark"
                ? "before:from-[#ffffff15] before:to-transparent"
                : "before:from-[#ffffff80] before:to-transparent"}
              before:z-[-1]
            `}
          >
            <div className="relative z-10">
              {/* Header with drag handle and close button */}
              <div className="flex justify-between items-center mb-2 font-semibold">
                <div 
                  className="flex items-center"
                >
                  {/* Clear drag handle with text label */}
                  <div 
                    onMouseDown={handleDragMouseDown}
                    className={`group relative mr-2 px-2 py-1 flex items-center justify-center rounded cursor-move
                      ${theme === "dark" 
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
                      <span className={`ml-2 text-xs font-normal py-0.5 px-1.5 rounded-full
                        ${theme === "dark" 
                          ? "bg-indigo-500/30 text-indigo-200" 
                          : "bg-indigo-100 text-indigo-800"
                        }`}>
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
    </div>
  );
}