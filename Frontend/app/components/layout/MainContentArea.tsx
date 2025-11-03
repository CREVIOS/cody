'use client';

import { useState, useRef, useEffect } from "react";
import FileSystemEditor from "@/components/filesystemeditor/FileSystemEditor";
import Terminal from "@/components/Terminal";
import { RealtimeCursors } from "@/components/realtime-cursors";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { useTheme } from "@/context/ThemeContext";

interface MainContentAreaProps {
  showTerminal: boolean;
  onTerminalClose: () => void;
  showCollaborators: boolean;
  collaboratorsComponent: React.ReactNode;
  projectId?: string;
  user?: User;
  userRole?: string; // Add userRole prop
}

export function MainContentArea({ 
  showTerminal, 
  onTerminalClose, 
  showCollaborators, 
  collaboratorsComponent,
  projectId,
  user,
  userRole = "editor" // Default to editor if not provided
}: MainContentAreaProps) {
  const { theme } = useTheme();
  const [terminalHeight, setTerminalHeight] = useState(300);
  const [isResizingTerminal, setIsResizingTerminal] = useState(false);
  const terminalResizeRef = useRef<HTMLDivElement>(null);

  // Terminal height resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingTerminal) return;
      const container = terminalResizeRef.current?.closest('.col-span-1');
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      
      // Min height: 150px, Max height: 80% of container
      if (newHeight >= 150 && newHeight <= containerRect.height * 0.8) {
        setTerminalHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setIsResizingTerminal(false);
    };

    if (isResizingTerminal) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingTerminal]);

  return (
    <div className="col-span-1 row-span-1 flex flex-col min-h-0 overflow-hidden relative">
      <FileSystemEditor 
        projectId={projectId} 
        user={user} 
        userRole={userRole} 
      />
      
      {/* Realtime Cursors - Only show if we have both projectId and user */}
      {projectId && user && (
        <RealtimeCursors 
          roomName={`project-${projectId}`}
          username={user.full_name || user.username}
          throttleMs={50}
          staleTimeout={5000}
        />
      )}
      
      {showTerminal && (
        <div 
          ref={terminalResizeRef}
          className="absolute bottom-0 left-0 right-0 z-20 flex flex-col"
          style={{ height: `${terminalHeight}px` }}
        >
          {/* Resize handle - VSCode style */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingTerminal(true);
            }}
            className={`h-1 w-full cursor-row-resize transition-colors duration-150 ${
              isResizingTerminal 
                ? 'bg-[#007acc]' 
                : 'bg-[#3e3e42] hover:bg-[#007acc]/50'
            }`}
            style={{ zIndex: 11 }}
          />
          
          <div className="flex-1 overflow-hidden border-t border-l border-r border-[#3e3e42] bg-[#1e1e1e]">
            <Terminal 
              projectId={projectId || 'default-project'} 
              onClose={onTerminalClose}
              theme={theme}
            />
          </div>
        </div>
      )}
      
      {showCollaborators && collaboratorsComponent}
    </div>
  );
}
