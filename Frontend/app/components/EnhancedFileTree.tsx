// Enhanced VSCode-like File Tree Component
"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useFileSystem } from '@/context/FileSystemContext';
import { FileSystemItem } from '@/types/fileSystem';

// Enhanced file type icons with proper VSCode-like styling
const getFileIcon = (fileName: string, isFolder: boolean = false, isExpanded: boolean = false) => {
  if (isFolder) {
    return isExpanded ? '📂' : '📁';
  }
  
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    // Programming languages
    'js': '🟨',
    'jsx': '⚛️', 
    'ts': '🔷',
    'tsx': '⚛️',
    'vue': '💚',
    'py': '🐍',
    'java': '☕',
    'cpp': '⚙️',
    'c': '⚙️',
    'go': '🐹',
    'rs': '🦀',
    'php': '🐘',
    'rb': '💎',
    'swift': '🦉',
    'kt': '🟣',
    
    // Web technologies
    'html': '🌐',
    'css': '🎨',
    'scss': '🎨',
    'sass': '🎨',
    'less': '🎨',
    
    // Data formats
    'json': '📋',
    'xml': '📄',
    'yaml': '📄',
    'yml': '📄',
    'toml': '📄',
    'ini': '🔧',
    'env': '🔧',
    
    // Documentation
    'md': '📝',
    'mdx': '📝',
    'txt': '📄',
    'rst': '📝',
    
    // Images
    'png': '🖼️',
    'jpg': '🖼️',
    'jpeg': '🖼️',
    'gif': '🖼️',
    'svg': '🖼️',
    'ico': '🖼️',
    'webp': '🖼️',
    
    // Config files
    'gitignore': '🚫',
    'dockerfile': '🐳',
    'dockerignore': '🐳',
    'npmrc': '📦',
    'yarnrc': '🧶',
    
    // Special files
    'lock': '🔒',
    'log': '📜',
    'sql': '🗄️',
  };
  
  // Handle special cases
  if (fileName === 'package.json') return '📦';
  if (fileName === 'tsconfig.json') return '🔷';
  if (fileName === 'README.md') return '📖';
  if (fileName === 'LICENSE') return '📄';
  if (fileName.startsWith('.env')) return '🔧';
  if (fileName.startsWith('Dockerfile')) return '🐳';
  
  return iconMap[ext || ''] || '📄';
};

interface FileTreeItemProps {
  item: FileSystemItem;
  level: number;
  onContextMenu: (event: React.MouseEvent, item: FileSystemItem) => void;
  onRename?: (item: FileSystemItem) => void;
}

function FileTreeItem({ item, level, onContextMenu, onRename }: FileTreeItemProps) {
  const { theme } = useTheme();
  const { selectedFile, openFile, selectFile } = useFileSystem();
  const [isExpanded, setIsExpanded] = useState(item.isExpanded || false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDark = theme === 'dark';
  const isSelected = selectedFile?.path === item.path;
  const hasChildren = item.children && item.children.length > 0;
  const indentWidth = 12; // VSCode-like indentation

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
      // For folders, we still select them for visual feedback but don't open content
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

  // VSCode-like styling
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
          {getFileIcon(item.name, item.type === 'folder', isExpanded)}
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

// Enhanced Context Menu
interface ContextMenuProps {
  x: number;
  y: number;
  item: FileSystemItem;
  onClose: () => void;
  onAction: (action: string, item: FileSystemItem) => void;
}

function ContextMenu({ x, y, item, onClose, onAction }: ContextMenuProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuItems = [
    { label: 'Rename', action: 'rename', icon: '✏️' },
    { label: 'Delete', action: 'delete', icon: '🗑️', danger: true },
    { type: 'separator' },
    { 
      label: item.type === 'folder' ? 'New File' : 'New File Here', 
      action: 'newFile', 
      icon: '📄' 
    },
    { 
      label: item.type === 'folder' ? 'New Folder' : 'New Folder Here', 
      action: 'newFolder', 
      icon: '📁' 
    },
    { type: 'separator' },
    { label: 'Copy Path', action: 'copyPath', icon: '📋' },
    { label: 'Copy Relative Path', action: 'copyRelativePath', icon: '📋' },
  ];

  return (
    <div
      ref={menuRef}
      className={`fixed z-50 py-1 rounded-md shadow-lg border min-w-[180px] ${
        isDark 
          ? 'bg-gray-800 border-gray-600 text-white' 
          : 'bg-white border-gray-300 text-black'
      }`}
      style={{ 
        left: Math.min(x, window.innerWidth - 200), 
        top: Math.min(y, window.innerHeight - 200) 
      }}
    >
      {menuItems.map((menuItem, index) => {
        if (menuItem.type === 'separator') {
          return (
            <div key={index} className={`h-px mx-2 my-1 ${
              isDark ? 'bg-gray-600' : 'bg-gray-200'
            }`} />
          );
        }
        
        return (
          <button
            key={index}
            className={`w-full flex items-center px-3 py-1.5 text-sm transition-colors ${
              menuItem.danger 
                ? (isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-600')
                : (isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100')
            }`}
            onClick={() => {
              if (menuItem.action) {
                onAction(menuItem.action, item);
              }
              onClose();
            }}
          >
            <span className="mr-2 text-xs">{menuItem.icon}</span>
            <span>{menuItem.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Main FileTree Component
interface FileTreeProps {
  className?: string;
}

export default function EnhancedFileTree({ className = '' }: FileTreeProps) {
  const { theme } = useTheme();
  const { 
    fileTree, 
    isLoading, 
    error, 
    loadFileTree, 
    createFile, 
    createFolder, 
    deleteItem, 
    renameItem,
    searchFiles,
    selectedFile,
    selectFile,
    projectName
  } = useFileSystem();

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: FileSystemItem;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FileSystemItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isDark = theme === 'dark';

  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  // Enhanced search with debouncing
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (searchQuery.trim()) {
        setIsSearching(true);
        try {
          const results = await searchFiles(searchQuery);
          // Convert SearchResult[] to FileSystemItem[]
          const fileSystemItems: FileSystemItem[] = results.map(result => ({
            name: result.name,
            path: result.path,
            type: 'file' as const,
            size: result.size,
            lastModified: result.lastModified,
          }));
          setSearchResults(fileSystemItems);
        } catch (error) {
          console.error('Search failed:', error);
        }
        setIsSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, searchFiles]);

  const handleContextMenu = (event: React.MouseEvent, item: FileSystemItem) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      item
    });
  };

  const handleContextAction = async (action: string, item: FileSystemItem) => {
    switch (action) {
      case 'rename':
        // This is handled by FileTreeItem
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
          await deleteItem(item.path);
        }
        break;
      case 'newFile':
        const fileName = prompt('Enter file name:');
        if (fileName) {
          // Handle root directory creation (when item.path is empty)
          const basePath = item.path === '' ? '' : (item.type === 'folder' ? item.path : item.path.split('/').slice(0, -1).join('/'));
          const filePath = basePath ? `${basePath}/${fileName}` : fileName;
          await createFile(filePath);
        }
        break;
      case 'newFolder':
        const folderName = prompt('Enter folder name:');
        if (folderName) {
          // Handle root directory creation (when item.path is empty)
          const basePath = item.path === '' ? '' : (item.type === 'folder' ? item.path : item.path.split('/').slice(0, -1).join('/'));
          const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
          await createFolder(folderPath);
        }
        break;
      case 'copyPath':
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(item.path);
        }
        break;
      case 'copyRelativePath':
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(item.path);
        }
        break;
    }
  };

  const handleRename = async (item: FileSystemItem) => {
    const parentPath = item.path.split('/').slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${item.name}` : item.name;
    await renameItem(item.path, newPath);
  };

  const handleCreateFile = async () => {
    const fileName = prompt('Enter file name:');
    if (fileName) {
      // If a folder is selected, create the file inside it
      let basePath = '';
      if (selectedFile) {
        if (selectedFile.type === 'folder') {
          basePath = selectedFile.path;
        } else {
          // If a file is selected, create in its parent directory
          const pathParts = selectedFile.path.split('/');
          pathParts.pop(); // Remove the file name
          basePath = pathParts.join('/');
        }
      }
      
      const filePath = basePath ? `${basePath}/${fileName}` : fileName;
      await createFile(filePath);
    }
  };

  const handleCreateFolder = async () => {
    const folderName = prompt('Enter folder name:');
    if (folderName) {
      // If a folder is selected, create the new folder inside it
      let basePath = '';
      if (selectedFile) {
        if (selectedFile.type === 'folder') {
          basePath = selectedFile.path;
        } else {
          // If a file is selected, create in its parent directory
          const pathParts = selectedFile.path.split('/');
          pathParts.pop(); // Remove the file name
          basePath = pathParts.join('/');
        }
      }
      
      const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
      await createFolder(folderPath);
    }
  };

  // Handle empty space clicks to deselect
  const handleEmptySpaceClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on the container, not on child elements
    if (e.target === e.currentTarget) {
      selectFile(null);
    }
  }, [selectFile]);

  return (
    <div className={`flex flex-col h-full ${className} ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Enhanced Header */}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${
        isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-100'
      }`}>
        <div className="flex items-center">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
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
            onClick={handleCreateFile}
            className={`p-1.5 rounded text-sm ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="New File"
          >
            📄
          </button>
          <button
            onClick={handleCreateFolder}
            className={`p-1.5 rounded text-sm ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="New Folder"
          >
            📁
          </button>
          <button
            onClick={loadFileTree}
            className={`p-1.5 rounded text-sm ${
              isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
            }`}
            title="Refresh Explorer"
          >
            🔄
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Enhanced Search */}
          <div className="p-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-8 pr-3 py-1.5 text-sm rounded border transition-colors ${
                  isDark 
                    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500' 
                    : 'bg-white border-gray-300 text-black placeholder-gray-500 focus:border-blue-500'
                } outline-none focus:ring-1 focus:ring-blue-500/20`}
              />
              <span className={`absolute left-2.5 top-1/2 transform -translate-y-1/2 text-sm ${
                isDark ? 'text-gray-400' : 'text-gray-500'
              }`}>
                🔍
              </span>
              {isSearching && (
                <span className={`absolute right-2.5 top-1/2 transform -translate-y-1/2 text-sm ${
                  isDark ? 'text-gray-400' : 'text-gray-500'
                }`}>
                  ⏳
                </span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="p-3 text-sm text-red-500 border-l-2 border-red-500 bg-red-500/5 mx-2">
                <div className="font-medium">Error</div>
                <div className="text-xs mt-1">{error}</div>
              </div>
            )}

            {isLoading && (
              <div className="p-3 text-sm text-gray-500 flex items-center">
                <span className="animate-spin mr-2">⏳</span>
                Loading...
              </div>
            )}

            {searchQuery && (
              <div>
                <div className={`px-3 py-2 text-xs font-medium uppercase tracking-wider border-b ${
                  isDark ? 'text-gray-400 border-gray-700' : 'text-gray-600 border-gray-200'
                }`}>
                  Search Results ({searchResults.length})
                </div>
                {searchResults.length > 0 ? (
                  searchResults.map((result) => (
                    <FileTreeItem
                      key={result.path}
                      item={result}
                      level={0}
                      onContextMenu={handleContextMenu}
                      onRename={handleRename}
                    />
                  ))
                ) : !isSearching ? (
                  <div className="px-3 py-2 text-sm text-gray-500">
                    No results found for &quot;{searchQuery}&quot;
                  </div>
                ) : null}
              </div>
            )}

            {!searchQuery && !isLoading && fileTree.length > 0 && (
              <div 
                className="pb-4 flex-1 min-h-[200px] cursor-default"
                onClick={handleEmptySpaceClick}
                onContextMenu={(e) => {
                  // Handle right-click on empty space for root-level creation
                  if (e.target === e.currentTarget) {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      item: { 
                        name: '', 
                        path: '', 
                        type: 'folder', 
                        children: [] 
                      } as FileSystemItem
                    });
                  }
                }}
              >
                {fileTree.map((item) => (
                  <FileTreeItem
                    key={item.path}
                    item={item}
                    level={0}
                    onContextMenu={handleContextMenu}
                    onRename={handleRename}
                  />
                ))}
              </div>
            )}

            {!searchQuery && !isLoading && fileTree.length === 0 && !error && (
              <div className="p-4 text-center">
                <div className="text-4xl mb-2">📁</div>
                <div className="text-sm text-gray-500 mb-3">
                  No files found
                </div>
                <div className="space-y-2">
                  <button
                    onClick={handleCreateFile}
                    className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
                      isDark 
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-800' 
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Create your first file
                  </button>
                  <button
                    onClick={handleCreateFolder}
                    className={`block w-full text-sm px-3 py-2 rounded border transition-colors ${
                      isDark 
                        ? 'border-gray-600 text-gray-300 hover:bg-gray-800' 
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Create a folder
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}
    </div>
  );
}

// Utility function
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}