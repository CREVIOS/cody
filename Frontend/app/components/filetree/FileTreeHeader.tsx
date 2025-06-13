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
      isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100'
    }`}>
      <div className="flex items-center">
        <button
          onClick={onToggleCollapse}
          className={`p-1 rounded mr-2 ${
            isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          }`}
          title={isCollapsed ? 'Expand Explorer' : 'Collapse Explorer'}
        >
          <span className={`text-sm transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
            ▶
          </span>
        </button>
        <h3 className="text-sm font-medium">{projectName || 'Untitled Project'}</h3>
      </div>
      
      <div className="flex items-center space-x-1">
        <button
          onClick={onCreateFile}
          className={`p-1.5 rounded text-sm ${
            isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          }`}
          title="New File"
        >
          📄
        </button>
        <button
          onClick={onCreateFolder}
          className={`p-1.5 rounded text-sm ${
            isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          }`}
          title="New Folder"
        >
          📁
        </button>
        <button
          onClick={onRefresh}
          className={`p-1.5 rounded text-sm ${
            isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
          }`}
          title="Refresh Explorer"
        >
          🔄
        </button>
      </div>
    </div>
  );
}