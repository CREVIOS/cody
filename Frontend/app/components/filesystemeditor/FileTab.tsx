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
      className={`flex items-center px-4 py-2 min-w-0 cursor-pointer border-r group transition-colors duration-150 ${
        isActive
          ? (isDark 
              ? 'bg-[#1e1e1e] text-[#ffffff] border-r-[#3e3e42] border-t-[#007acc] border-t-2' 
              : 'bg-[#ffffff] text-[#333333] border-r-[#e5e5e5] border-t-[#007acc] border-t-2'
            )
          : (isDark 
              ? 'bg-[#2d2d30] text-[#969696] border-r-[#3e3e42] hover:bg-[#2a2d2e] hover:text-[#cccccc] border-t-2 border-t-transparent' 
              : 'bg-[#f3f3f3] text-[#616161] hover:bg-[#ececec] border-r-[#e5e5e5] border-t-2 border-t-transparent'
            )
      }`}
      onClick={() => onTabClick(path)}
      style={{ minWidth: '120px', maxWidth: '240px' }}
    >
      <span className="mr-2 text-sm flex-shrink-0">
        {/* Display the icon directly */}
        {icon.startsWith('http') ? (
          <img src={icon} alt="" className="w-4 h-4 inline" />
        ) : (
          icon
        )}
      </span>
      
      <span className="text-sm truncate flex-1 min-w-0">
        {fileName}
      </span>
      
      {isModified && (
        <span className={`ml-1.5 text-xs flex-shrink-0 ${
          isDark ? 'text-[#cccccc]' : 'text-[#007acc]'
        }`}>●</span>
      )}
      
      <button
        className={`ml-1.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 w-4 h-4 flex items-center justify-center ${
          isDark 
            ? 'hover:bg-[#ffffff]/20 text-[#969696] hover:text-[#ffffff]' 
            : 'hover:bg-[#000000]/10 text-[#616161] hover:text-[#333333]'
        }`}
        onClick={(e) => onTabClose(e, path)}
        title="Close"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10.5 3.5L3.5 10.5M3.5 3.5L10.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}
