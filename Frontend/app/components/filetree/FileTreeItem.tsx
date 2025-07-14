import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useFileSystem } from '@/context/FileSystemContext';
import { FileSystemItem } from '@/types/fileSystem';
import { useFileIcon } from './getFileIcon';

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface FileTreeItemProps {
  item: FileSystemItem;
  level: number;
  onContextMenu: (event: React.MouseEvent, item: FileSystemItem) => void;
  onRename?: (item: FileSystemItem) => void;
}

export function FileTreeItem({ item, level, onContextMenu, onRename }: FileTreeItemProps) {
  const { theme } = useTheme();
  const { selectedFile, openFile, selectFile } = useFileSystem();
  const [isExpanded, setIsExpanded] = useState(item.isExpanded || false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [isAnimating, setIsAnimating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const childrenRef = useRef<HTMLDivElement>(null);
  
  // Get the icon synchronously with the hook
  const icon = useFileIcon(item.name, item.type === 'folder', isExpanded);

  const isDark = theme === 'dark';
  const isSelected = selectedFile?.path === item.path;
  const hasChildren = item.children && item.children.length > 0;
  const indentWidth = 12;

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (item.type === 'folder') {
      setIsAnimating(true);
      setIsExpanded(!isExpanded);
      selectFile(item);
      
      // Reset animation state after animation completes
      setTimeout(() => setIsAnimating(false), 200);
    } else {
      openFile(item);
      selectFile(item);
    }
  }, [item, isExpanded, openFile, selectFile]);

  const handleExpanderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAnimating(true);
    setIsExpanded(!isExpanded);
    
    // Reset animation state after animation completes
    setTimeout(() => setIsAnimating(false), 200);
  }, [isExpanded]);

  const handleRename = async () => {
    if (newName.trim() && newName !== item.name && onRename) {
      onRename({ ...item, name: newName });
    }
    setIsRenaming(false);
    setNewName(item.name);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(item.name);
    }
  };

  const startRename = () => {
    setIsRenaming(true);
    setNewName(item.name);
  };

  // VSCode-like styling with smooth transitions
  const itemClasses = `
    group flex items-center h-[22px] px-1 cursor-pointer relative
    transition-all duration-150 ease-out
    ${isSelected 
      ? (isDark 
          ? 'bg-[#094771] text-[#cccccc]' // VSCode dark selection
          : 'bg-[#e8f4fd] text-[#000000]'  // VSCode light selection
        ) 
      : (isDark 
          ? 'text-[#cccccc] hover:bg-[#2a2d2e]' // VSCode dark hover
          : 'text-[#383838] hover:bg-[#f3f3f3]'  // VSCode light hover
        )
    }
  `;

  return (
    <div>
      <div
        className={itemClasses}
        style={{ paddingLeft: `${level * indentWidth + 4}px` }}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, item)}
        title={item.path}
      >
        {/* Folder expander */}
        {item.type === 'folder' && (
          <div 
            className={`w-4 h-4 flex items-center justify-center mr-1 transition-all duration-150 ${
              hasChildren ? 'cursor-pointer hover:bg-black/10 rounded' : 'cursor-default'
            }`}
            onClick={handleExpanderClick}
          >
            {hasChildren && (
              <span 
                className={`text-xs transition-all duration-200 ease-out ${
                  isExpanded ? 'rotate-90' : ''
                } ${isDark ? 'text-[#cccccc]' : 'text-[#646465]'} ${
                  isAnimating ? 'scale-110' : ''
                }`}
              >
                ▶
              </span>
            )}
          </div>
        )}
        
        {/* Empty space for files to align with folders */}
        {item.type === 'file' && <div className="w-4 mr-1" />}
        
        {/* File/Folder icon */}
        <span className={`text-sm mr-2 flex-shrink-0 transition-all duration-150 ${
          isSelected ? 'scale-105' : ''
        }`}>
          {/* Display the icon directly */}
          {icon.startsWith('http') ? (
            <img src={icon} alt="" className="w-4 h-4 inline" />
          ) : (
            icon
          )}
        </span>
        
        {/* File/Folder name */}
        {isRenaming ? (
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={handleKeyDown}
            className={`flex-1 px-1 py-0 text-sm rounded border ${
              isDark 
                ? 'bg-[#3c3c3c] border-[#007acc] text-[#cccccc] focus:border-[#007acc] focus:ring-1 focus:ring-[#007acc]' 
                : 'bg-white border-[#007acc] text-[#000000] focus:border-[#005a9e] focus:ring-1 focus:ring-[#005a9e]'
            } outline-none`}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className={`text-sm truncate flex-1 select-none transition-all duration-150 ${
              isSelected ? 'font-medium' : ''
            }`}
            onDoubleClick={startRename}
          >
            {item.name}
          </span>
        )}
        
        {/* File size for files */}
        {item.type === 'file' && item.size !== undefined && (
          <span className={`ml-auto text-xs flex-shrink-0 transition-all duration-150 ${
            isDark ? 'text-[#858585]' : 'text-[#6c6c6c]'
          } ${isSelected ? 'opacity-100' : 'opacity-70'}`}>
            {formatFileSize(item.size)}
          </span>
        )}
      </div>
      
      {/* Children with smooth expand/collapse animation */}
      {item.type === 'folder' && hasChildren && (
        <div 
          ref={childrenRef}
          className={`overflow-hidden transition-all duration-200 ease-out ${
            isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className={`transition-all duration-200 ${
            isExpanded ? 'transform translate-y-0' : 'transform -translate-y-2'
          }`}>
            {item.children!.map((child) => (
              <FileTreeItem
                key={child.path}
                item={child}
                level={level + 1}
                onContextMenu={onContextMenu}
                onRename={onRename}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
