'use client';

import { useState, useRef, useEffect } from "react";
import FileSystemEditor from "@/components/filesystemeditor/FileSystemEditor";
import Terminal from "@/components/Terminal";
import { RealtimeCursors } from "@/components/realtime-cursors";
import { User } from "@/lib/projectAPI/TypeDefinitions";

interface MainContentAreaProps {
  showTerminal: boolean;
  onTerminalClose: () => void;
  showCollaborators: boolean;
  collaboratorsComponent: React.ReactNode;
  projectId?: string;
  user?: User;
}

export function MainContentArea({ 
  showTerminal, 
  onTerminalClose, 
  showCollaborators, 
  collaboratorsComponent,
  projectId,
  user
}: MainContentAreaProps) {
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
      <FileSystemEditor />
      
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
          {/* Resize handle */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingTerminal(true);
            }}
            className={`h-1 w-full cursor-row-resize hover:bg-indigo-500/50 transition-colors ${
              isResizingTerminal ? 'bg-indigo-500' : 'bg-gray-700'
            }`}
            style={{ zIndex: 11 }}
          />
          
          <div className="flex-1 rounded-t-md overflow-hidden border-t border-l border-r border-gray-700 bg-[#1e1e1e]">
            <Terminal 
              projectId={projectId || 'default-project'} 
              onClose={onTerminalClose} 
            />
          </div>
        </div>
      )}
      
      {showCollaborators && collaboratorsComponent}
    </div>
  );
}
