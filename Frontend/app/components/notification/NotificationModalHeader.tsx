import React from 'react';
import { X, Users } from "lucide-react";

interface NotificationModalHeaderProps {
  invitationCount: number;
  loading: boolean;
  onClose: () => void;
  theme: string;
}

export function NotificationModalHeader({ 
  invitationCount, 
  loading, 
  onClose, 
  theme 
}: NotificationModalHeaderProps) {
  const headerClass = `
    flex items-center justify-between p-4 border-b
    ${theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"}
  `;

  return (
    <div className={headerClass}>
      <div className="flex items-center">
        <Users className="w-5 h-5 mr-2" />
        <h2 className="text-lg font-semibold">Project Invitations</h2>
        {!loading && invitationCount > 0 && (
          <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium
            ${theme === "dark" 
              ? "bg-indigo-500/20 text-indigo-300" 
              : "bg-indigo-100 text-indigo-800"
            }`}>
            {invitationCount}
          </span>
        )}
      </div>
      <button
        onClick={onClose}
        className={`p-1 rounded-full transition-colors
          ${theme === "dark" 
            ? "hover:bg-[#3A3A3E] text-gray-400 hover:text-white" 
            : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
          }`}
        title="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
