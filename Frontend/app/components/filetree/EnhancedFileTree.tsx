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
import { usePermissions } from '@/hooks/usePermissions';
import { User } from '@/lib/projectAPI/TypeDefinitions';
import CreateFileDialog from './CreateFileDialog';
import CreateFolderDialog from './CreateFolderDialog';
import DeleteConfirmDialog from './DeleteConfirmDialog';

interface FileTreeProps {
  className?: string;
  user?: User;
  userRoleId?: string | null;
}

export default function EnhancedFileTree({ className = '', user, userRoleId }: FileTreeProps) {
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
    projectName,
    projectId
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
  
  // Dialog states
  const [createFileDialog, setCreateFileDialog] = useState<{ isOpen: boolean; basePath: string }>({ isOpen: false, basePath: '' });
  const [createFolderDialog, setCreateFolderDialog] = useState<{ isOpen: boolean; basePath: string }>({ isOpen: false, basePath: '' });
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; item: FileSystemItem | null }>({ isOpen: false, item: null });

  const isDark = theme === 'dark';

  // Permissions: prefer project-specific evaluation; fallback to role-based
  const { hasPermission } = usePermissions({
    roleId: userRoleId ?? null,
    projectId: projectId,
    userId: user?.user_id,
  });
  const canEdit = hasPermission('canEdit');
  const canView = hasPermission('canView');

  useEffect(() => {
    // Debounce loadFileTree to prevent rapid calls
    const timeoutId = setTimeout(() => {
      loadFileTree();
    }, 100);
    
    return () => clearTimeout(timeoutId);
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

  const handleFileOpen = useCallback((item: FileSystemItem) => {
    if (!canView && item.type === 'file') {
      return;
    }
    openFile(item);
  }, [canView, openFile]);

  const handleContextAction = async (action: string, item: FileSystemItem) => {
    if (!canEdit && (action === 'rename' || action === 'delete' || action === 'newFile' || action === 'newFolder')) {
      return;
    }
    switch (action) {
      case 'rename':
        break;
      case 'delete':
        setDeleteDialog({ isOpen: true, item });
        break;
      case 'newFile':
        const basePath = item.path === '' ? '' : (item.type === 'folder' ? item.path : item.path.split('/').slice(0, -1).join('/'));
        setCreateFileDialog({ isOpen: true, basePath });
        break;
      case 'newFolder':
        const folderBasePath = item.path === '' ? '' : (item.type === 'folder' ? item.path : item.path.split('/').slice(0, -1).join('/'));
        setCreateFolderDialog({ isOpen: true, basePath: folderBasePath });
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
    if (!canEdit) return;
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
    setCreateFileDialog({ isOpen: true, basePath });
  };

  const handleCreateFolder = async () => {
    if (!canEdit) return;
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
    setCreateFolderDialog({ isOpen: true, basePath });
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

      <div className={`overflow-hidden transition-all duration-200 ease-out ${
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-full opacity-100'
      }`}>
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isSearching={isSearching}
          isDark={isDark}
        />

        <div className={`flex-1 overflow-y-auto scrollbar-thin ${
          isDark 
            ? 'scrollbar-thumb-[#424242] hover:scrollbar-thumb-[#4e4e4e]' 
            : 'scrollbar-thumb-[#c1c1c1] hover:scrollbar-thumb-[#a8a8a8]'
        } scrollbar-track-transparent`} style={{ scrollbarWidth: 'thin' }}>
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
                onFileClick={handleFileOpen}
                canView={canView}
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
                  onFileClick={handleFileOpen}
                  canView={canView}
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
          canEdit={canEdit}
        />
      )}

      {/* Create File Dialog */}
      <CreateFileDialog
        isOpen={createFileDialog.isOpen}
        onClose={() => setCreateFileDialog({ isOpen: false, basePath: '' })}
        onSubmit={async (fileName) => {
          const filePath = createFileDialog.basePath ? `${createFileDialog.basePath}/${fileName}` : fileName;
          await createFile(filePath);
        }}
        basePath={createFileDialog.basePath}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        isOpen={createFolderDialog.isOpen}
        onClose={() => setCreateFolderDialog({ isOpen: false, basePath: '' })}
        onSubmit={async (folderName) => {
          const folderPath = createFolderDialog.basePath ? `${createFolderDialog.basePath}/${folderName}` : folderName;
          await createFolder(folderPath);
        }}
        basePath={createFolderDialog.basePath}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, item: null })}
        onConfirm={async () => {
          if (deleteDialog.item) {
            await deleteItem(deleteDialog.item.path);
          }
        }}
        itemName={deleteDialog.item?.name || ''}
        itemType={deleteDialog.item?.type || 'file'}
      />
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