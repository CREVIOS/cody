import React from 'react';
import { useTabIcon } from './getTabIcon';

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
  // Get the icon synchronously with the hook
  const icon = useTabIcon(fileName);
  
  return (
    <div
      className={`flex items-center px-3 py-2 min-w-0 cursor-pointer border-r group transition-colors duration-100 ${
        isActive
          ? (isDark 
              ? 'bg-[#1e1e1e] text-[#ffffff] border-r-[#3e3e42]' 
              : 'bg-[#ffffff] text-[#333333] border-r-[#e5e5e5]'
            )
          : (isDark 
              ? 'bg-[#2d2d30] text-[#969696] border-r-[#3e3e42] hover:bg-[#1e1e1e] hover:text-[#ffffff]' 
              : 'bg-[#f3f3f3] text-[#333333] hover:bg-[#ffffff] border-r-[#e5e5e5]'
            )
      }`}
      onClick={() => onTabClick(path)}
    >
      <span className="mr-2 text-sm">
        {/* Display the icon directly */}
        {icon.startsWith('http') ? (
          <img src={icon} alt="" className="w-4 h-4 inline" />
        ) : (
          icon
        )}
      </span>
      
      <span className="text-sm truncate max-w-32">
        {fileName}
      </span>
      
      {isModified && (
        <span className={`ml-1 text-xs ${
          isDark ? 'text-[#ffffff]' : 'text-[#005fb8]'
        }`}>●</span>
      )}
      
      <button
        className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
          isDark 
            ? 'hover:bg-[#ffffff]/10 text-[#969696] hover:text-[#ffffff]' 
            : 'hover:bg-[#000000]/10 text-[#616161] hover:text-[#333333]'
        }`}
        onClick={(e) => onTabClose(e, path)}
        title="Close"
      >
        ×
      </button>
    </div>
  );
}
