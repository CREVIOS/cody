import React, { useState, useRef } from 'react';
import Collaborators from "@/components/Collaborators";
import { ProjectMemberWithDetails } from "@/lib/projectAPI/TypeDefinitions";

interface DraggableCollaboratorsProps {
  projectMembers: ProjectMemberWithDetails[];
  membersLoading: boolean;
  membersError: string | null;
  onClose: () => void;
  theme: string;
}

export function DraggableCollaborators({ 
  projectMembers, 
  membersLoading, 
  membersError, 
  onClose, 
  theme 
}: DraggableCollaboratorsProps) {
  const [isDragging, setIsDragging] = useState(false);
  const collaboratorsRef = useRef<HTMLDivElement | null>(null);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();

    const box = collaboratorsRef.current;
    if (!box) return;

    setIsDragging(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const boxLeft = parseInt(box.style.left) || 100;
    const boxTop = parseInt(box.style.top) || 100;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;

      box.style.left = `${boxLeft + dx}px`;
      box.style.top = `${boxTop + dy}px`;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
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
            onClick={onClose}
            className="text-lg font-bold hover:opacity-70 w-6 h-6 flex items-center justify-center rounded-full"
          >
            ✖
          </button>
        </div>
        <Collaborators 
          members={projectMembers}
          loading={membersLoading}
          error={membersError}
        />
      </div>
    </div>
  );
}

