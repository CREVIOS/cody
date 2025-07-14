import { useState, useEffect, useCallback } from 'react';
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
    openFile,
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
    <div className={`flex flex-col h-full ${className} ${
      isDark ? 'bg-[#252526]' : 'bg-[#f3f3f3]'
    }`}>
      <FileTreeHeader
        projectName={projectName}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        onCreateFile={handleCreateFile}
        onCreateFolder={handleCreateFolder}
        onRefresh={loadFileTree}
        isDark={isDark}
      />

      <div className={`overflow-hidden transition-all duration-300 ease-out ${
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-full opacity-100'
      }`}>
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearching={isSearching}
          isDark={isDark}
        />

        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400 hover:scrollbar-thumb-gray-500">
          {error && (
            <div className={`p-3 text-sm border-l-2 mx-2 mb-2 rounded-r transition-all duration-200 ${
              isDark 
                ? 'text-[#f48771] border-[#f48771] bg-[#5a1d1d]' 
                : 'text-[#cd3131] border-[#cd3131] bg-[#f2dede]'
            }`}>
              <div className="font-medium">Error</div>
              <div className="text-xs mt-1">{error}</div>
            </div>
          )}

          {isLoading ? (
            <div className={`flex items-center justify-center p-8 transition-all duration-200 ${
              isDark ? 'text-[#cccccc]' : 'text-[#383838]'
            }`}>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
              <span className="ml-2 text-sm">Loading...</span>
            </div>
          ) : searchQuery ? (
            <div className="animate-fadeIn">
              <SearchResults
                searchResults={searchResults}
                searchQuery={searchQuery}
                isSearching={isSearching}
                onContextMenu={handleContextMenu}
                onRename={handleRename}
                isDark={isDark}
              />
            </div>
          ) : fileTree && fileTree.length > 0 ? (
            <div 
              className="p-1 animate-fadeIn" 
              onClick={handleEmptySpaceClick}
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
          ) : (
            <div className="animate-fadeIn">
              <EmptyState
                onCreateFile={handleCreateFile}
                onCreateFolder={handleCreateFolder}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          item={contextMenu.item}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
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