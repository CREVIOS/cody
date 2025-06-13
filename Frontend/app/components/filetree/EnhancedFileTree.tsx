import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { useFileSystem } from '@/context/FileSystemContext';
import { FileSystemItem } from '@/types/fileSystem';
import { FileTreeHeader } from './FileTreeHeader';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { FileTreeItem } from './FileTreeItem';
import { EmptyState } from './EmptyState';
import { ContextMenu } from './ContextMenu';

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
        break;
      case 'delete':
        if (confirm(`Are you sure you want to delete "${item.name}"?`)) {
          await deleteItem(item.path);
        }
        break;
      case 'newFile':
        const fileName = prompt('Enter file name:');
        if (fileName) {
          const basePath = item.path === '' ? '' : (item.type === 'folder' ? item.path : item.path.split('/').slice(0, -1).join('/'));
          const filePath = basePath ? `${basePath}/${fileName}` : fileName;
          await createFile(filePath);
        }
        break;
      case 'newFolder':
        const folderName = prompt('Enter folder name:');
        if (folderName) {
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
      let basePath = '';
      if (selectedFile) {
        if (selectedFile.type === 'folder') {
          basePath = selectedFile.path;
        } else {
          const pathParts = selectedFile.path.split('/');
          pathParts.pop();
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
      let basePath = '';
      if (selectedFile) {
        if (selectedFile.type === 'folder') {
          basePath = selectedFile.path;
        } else {
          const pathParts = selectedFile.path.split('/');
          pathParts.pop();
          basePath = pathParts.join('/');
        }
      }
      
      const folderPath = basePath ? `${basePath}/${folderName}` : folderName;
      await createFolder(folderPath);
    }
  };

  const handleEmptySpaceClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      selectFile(null);
    }
  }, [selectFile]);

  return (
    <div className={`flex flex-col h-full ${className} ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <FileTreeHeader
        projectName={projectName}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onRefresh={loadFileTree}
        isDark={isDark}
      />

      {!isCollapsed && (
        <>
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isSearching={isSearching}
            isDark={isDark}
          />

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
              <SearchResults
                searchQuery={searchQuery}
                searchResults={searchResults}
                isSearching={isSearching}
                onContextMenu={handleContextMenu}
                onRename={handleRename}
                isDark={isDark}
              />
            )}

            {!searchQuery && !isLoading && fileTree.length > 0 && (
              <div 
                className="pb-4 flex-1 min-h-[200px] cursor-default"
                onClick={handleEmptySpaceClick}
                onContextMenu={(e) => {
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
              <EmptyState 
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                isDark={isDark}
              />
            )}
          </div>
        </>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
          isDark={isDark}
        />
      )}
    </div>
  );
}

// Utility function
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}