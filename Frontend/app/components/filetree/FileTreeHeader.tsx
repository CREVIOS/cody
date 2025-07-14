import React from 'react';

interface FileTreeHeaderProps {
  projectName?: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onRefresh: () => void;
  isDark: boolean;
}

export function FileTreeHeader({ 
  projectName, 
  isCollapsed, 
  onToggleCollapse, 
  onCreateFile, 
  onCreateFolder, 
  onRefresh, 
  isDark 
}: FileTreeHeaderProps) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b ${
      isDark 
        ? 'border-[#3e3e42] bg-[#252526]' 
        : 'border-[#e5e5e5] bg-[#f3f3f3]'
    }`}>
      <div className="flex items-center">
        <button
          onClick={onToggleCollapse}
          className={`p-1 rounded mr-2 transition-all duration-200 ${
            isDark 
              ? 'hover:bg-[#2a2d2e] text-[#cccccc]' 
              : 'hover:bg-[#e8e8e8] text-[#383838]'
          }`}
          title={isCollapsed ? 'Expand Explorer' : 'Collapse Explorer'}
        >
          <span className={`text-xs transition-transform duration-200 ease-in-out ${
            isCollapsed ? '' : 'rotate-90'
          } ${isDark ? 'text-[#cccccc]' : 'text-[#646465]'}`}>
            ▶
          </span>
        </button>
        <h3 className={`text-xs font-medium uppercase tracking-wider ${
          isDark ? 'text-[#cccccc]' : 'text-[#383838]'
        }`}>
          Explorer
        </h3>
      </div>
      
      <div className="flex items-center space-x-1">
        <button
          onClick={onCreateFile}
          className={`p-1.5 rounded text-sm transition-all duration-200 transform hover:scale-110 ${
            isDark 
              ? 'hover:bg-[#2a2d2e] text-[#cccccc]' 
              : 'hover:bg-[#e8e8e8] text-[#383838]'
          }`}
          title="New File"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.5 1.5v4h4l-4-4zM8.5 1H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5.5L9.5 1.5z"/>
          </svg>
        </button>
        <button
          onClick={onCreateFolder}
          className={`p-1.5 rounded text-sm transition-all duration-200 transform hover:scale-110 ${
            isDark 
              ? 'hover:bg-[#2a2d2e] text-[#cccccc]' 
              : 'hover:bg-[#e8e8e8] text-[#383838]'
          }`}
          title="New Folder"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M7 2L6 3H2v10h12V4H7V2z"/>
          </svg>
        </button>
        <button
          onClick={onRefresh}
          className={`p-1.5 rounded text-sm transition-all duration-200 transform hover:scale-110 ${
            isDark 
              ? 'hover:bg-[#2a2d2e] text-[#cccccc]' 
              : 'hover:bg-[#e8e8e8] text-[#383838]'
          }`}
          title="Refresh Explorer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.5a6.5 6.5 0 1 0 6.5 6.5h-1.5a5 5 0 1 1-5-5V1.5z"/>
            <path d="M11 1v4h4l-4-4z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}