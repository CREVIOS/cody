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
  const inputRef = useRef<HTMLInputElement>(null);
  
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
      setIsExpanded(!isExpanded);
      selectFile(item);
    } else {
      openFile(item);
      selectFile(item);
    }
  }, [item, isExpanded, openFile, selectFile]);

  const handleExpanderClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
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

  const itemClasses = `
    group flex items-center h-[22px] px-1 cursor-pointer relative
    hover:bg-opacity-10 transition-colors duration-150
    ${isSelected 
      ? (isDark ? 'bg-blue-600/20 text-blue-200' : 'bg-blue-100 text-blue-900') 
      : (isDark ? 'text-gray-200 hover:bg-white/5' : 'text-gray-800 hover:bg-black/5')
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
            className={`w-4 h-4 flex items-center justify-center mr-1 ${
              hasChildren ? 'cursor-pointer' : 'cursor-default'
            }`}
            onClick={handleExpanderClick}
          >
            {hasChildren && (
              <span 
                className={`text-xs transition-transform duration-150 ${
                  isExpanded ? 'rotate-90' : ''
                } ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
              >
                ▶
              </span>
            )}
          </div>
        )}
        
        {/* Empty space for files to align with folders */}
        {item.type === 'file' && <div className="w-4 mr-1" />}
        
        {/* File/Folder icon */}
        <span className="text-sm mr-2 flex-shrink-0">
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
            className={`flex-1 px-1 py-0 text-sm bg-transparent border rounded ${
              isDark 
                ? 'border-blue-500 text-white focus:border-blue-400' 
                : 'border-blue-500 text-black focus:border-blue-600'
            } outline-none`}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span 
            className="text-sm truncate flex-1 select-none"
            onDoubleClick={startRename}
          >
            {item.name}
          </span>
        )}
        
        {/* File size for files */}
        {item.type === 'file' && item.size !== undefined && (
          <span className={`ml-auto text-xs flex-shrink-0 ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`}>
            {formatFileSize(item.size)}
          </span>
        )}
      </div>
      
      {/* Children */}
      {item.type === 'folder' && isExpanded && hasChildren && (
        <div>
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
      )}
    </div>
  );
}
