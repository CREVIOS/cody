import React, { useRef, useEffect } from 'react';
import { UserPlus } from "lucide-react";

interface SidebarHeaderProps {
  isEditingName: boolean;
  currentProjectName: string;
  onProjectNameChange: (value: string) => void;
  onEditClick: () => void;
  onNameSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onHome: () => void;
  canInviteUsers: boolean;
  onInviteClick: () => void;
  borderClass: string;
  inputClass: string;
  iconHoverClass: string;
}

export function SidebarHeader({
  isEditingName,
  currentProjectName,
  onProjectNameChange,
  onEditClick,
  onNameSubmit,
  onKeyDown,
  onHome,
  canInviteUsers,
  onInviteClick,
  borderClass,
  inputClass,
  iconHoverClass,
}: SidebarHeaderProps) {
  const projectNameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingName && projectNameInputRef.current) {
      projectNameInputRef.current.focus();
    }
  }, [isEditingName]);

  return (
    <div className={`p-3 border-b flex flex-col ${borderClass}`}>
      {/* Top row with home and invite icons */}
      <div className="flex items-center mb-3">
        <button
          onClick={onHome}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${iconHoverClass} transition-all duration-200 group relative`}
          title="Back to Home"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
          </svg>

          {/* Tooltip */}
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
            Back to Home
          </div>
        </button>

        <div className="flex-1"></div> {/* Spacer */}

        {/* Invite Users Icon - Only show if user has permission */}
        {canInviteUsers && (
          <button
            onClick={onInviteClick}
            className={`w-8 h-8 rounded-full flex items-center justify-center ${iconHoverClass} transition-all duration-200 group relative`}
            title="Invite Users"
          >
            <UserPlus className="w-4 h-4" />

            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              Invite Users
            </div>
          </button>
        )}
      </div>

      {/* Project name section */}
      <div className="flex items-center">
        {isEditingName ? (
          <input
            ref={projectNameInputRef}
            type="text"
            value={currentProjectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            onBlur={onNameSubmit}
            onKeyDown={onKeyDown}
            className={`w-full px-2 py-1 rounded border ${inputClass} focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-sm font-medium`}
          />
        ) : (
          <div
            className="flex items-center group cursor-pointer w-full"
            onClick={onEditClick}
          >
            <h2 className="text-sm font-medium truncate flex-1">
              {currentProjectName}
            </h2>
            <svg
              className="w-3 h-3 ml-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
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
    </div>
  );
}