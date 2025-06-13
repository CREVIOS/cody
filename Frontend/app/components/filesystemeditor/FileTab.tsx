import React from 'react';
import { getTabIcon } from './getTabIcon';

interface FileTabProps {
  path: string;
  fileName: string;
  isActive: boolean;
  isModified: boolean;
  onTabClick: (path: string) => void;
  onTabClose: (e: React.MouseEvent, path: string) => void;
  isDark: boolean;
}

export function FileTab({ 
  path, 
  fileName, 
  isActive, 
  isModified, 
  onTabClick, 
  onTabClose, 
  isDark 
}: FileTabProps) {
  return (
    <div
      className={`flex items-center px-3 py-2 min-w-0 cursor-pointer border-r group ${
        isActive
          ? (isDark ? 'bg-gray-900 text-white border-gray-600' : 'bg-white text-black border-gray-300')
          : (isDark ? 'bg-gray-800 text-gray-300 border-gray-700 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-50 border-gray-200')
      }`}
      onClick={() => onTabClick(path)}
    >
      <span className="mr-2 text-sm">
        {getTabIcon(fileName)}
      </span>
      
      <span className="text-sm truncate max-w-32">
        {fileName}
      </span>
      
      {isModified && (
        <span className="ml-1 text-orange-500 text-xs">●</span>
      )}
      
      <button
        className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-opacity-80 ${
          isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-100 text-red-600'
        }`}
        onClick={(e) => onTabClose(e, path)}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}
