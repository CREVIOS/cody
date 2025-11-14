"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { FileSystemItem, FileSystemContextType, SearchResult } from '@/types/fileSystem';
import { ProjectPersistenceService, ProjectSession } from '@/lib/projectPersistence';
import { commandManager, DeleteFileCommand, RenameFileCommand, MoveFileCommand, CopyFileCommand } from '@/lib/commands';

const FileSystemContext = createContext<FileSystemContextType | undefined>(undefined);

export function useFileSystem() {
  const context = useContext(FileSystemContext);
  if (!context) {
    throw new Error('useFileSystem must be used within a FileSystemProvider');
  }
  return context;
}

interface FileSystemProviderProps {
  children: React.ReactNode;
  projectId: string;
  projectName?: string;
}

export function FileSystemProvider({ children, projectId, projectName = '' }: FileSystemProviderProps) {
  const [fileTree, setFileTree] = useState<FileSystemItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileSystemItem | null>(null);
  const [openFiles, setOpenFiles] = useState<Map<string, { item: FileSystemItem; content: string; isDirty: boolean }>>(new Map());
  const [currentFileContent, setCurrentFileContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Store the current project name in state to ensure it's available in context
  const [currentProjectName, setCurrentProjectName] = useState<string>(projectName);
  
  // File system operations are handled by SBackend (Node.js server on port 3001)
  // Use a dedicated FILE_SYSTEM_URL so we don't accidentally point at the Python API backend
  // This avoids 404s when NEXT_PUBLIC_API_URL is set to the FastAPI service.
  const baseUrl = process.env.NEXT_PUBLIC_FILE_SYSTEM_URL || 'http://localhost:3001';
  const lastSavedContent = useRef<string>('');
  const watcherWsRef = useRef<WebSocket | null>(null);

  // Update project name when prop changes
  useEffect(() => {
    setCurrentProjectName(projectName);
  }, [projectName]);

  // Load persisted project state on mount
  useEffect(() => {
    if (projectId) {
      const session = ProjectPersistenceService.loadProjectSession(projectId);
      if (session) {
        // Restore expanded folders
        setExpandedFolders(new Set(session.expandedFolders));
        
        // Update project name if it exists in session and is different
        if (session.projectName && session.projectName !== projectName) {
          setCurrentProjectName(session.projectName);
        }
        
        // Mark current project as active
        ProjectPersistenceService.setCurrentProjectId(projectId);
      } else {
        // Create new session
        const newSession: ProjectSession = {
          projectId,
          projectName: currentProjectName,
          lastAccessed: new Date().toISOString(),
          openFiles: [],
          selectedFile: null,
          expandedFolders: []
        };
        ProjectPersistenceService.saveProjectSession(newSession);
      }
    }
  }, [projectId, projectName, currentProjectName]);

  // Auto-save project state
  useEffect(() => {
    if (!projectId) return;

    const cleanup = ProjectPersistenceService.setupAutoSave(
      projectId,
      () => ({
        openFiles: Array.from(openFiles.keys()),
        selectedFile: selectedFile?.path || null,
        expandedFolders: Array.from(expandedFolders)
      })
    );

    return cleanup;
  }, [projectId, openFiles, selectedFile, expandedFolders]);

  const handleError = (error: Error | unknown, action: string) => {
    console.error(`Error ${action}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    setError(`Failed to ${action}: ${errorMessage}`);
  };

  // Handle external file change notifications and refresh open files as needed
  const handleExternalChanges = useCallback(async (paths: string[]) => {
    if (!projectId || paths.length === 0) return;

    const uniquePaths = Array.from(new Set(paths));

    // For each changed path that is currently open, refetch content
    await Promise.all(
      uniquePaths
        .filter((p) => openFiles.has(p))
        .map(async (p) => {
          try {
            const resp = await fetch(`${baseUrl}/api/projects/${projectId}/files/read?path=${encodeURIComponent(p)}`);
            const data = await resp.json();
            if (data.success && typeof data.content === 'string') {
              setOpenFiles((prev) => {
                const updated = new Map(prev);
                const existing = updated.get(p);
                if (existing) {
                  const updatedItem = { ...existing.item, size: new Blob([data.content]).size };
                  updated.set(p, { item: updatedItem, content: data.content, isDirty: false });
                }
                return updated;
              });

              // If the refreshed file is currently selected, update the editor content as well
              if (selectedFile && selectedFile.path === p) {
                setCurrentFileContent(data.content);
                lastSavedContent.current = data.content;
              }
            }
          } catch (e) {
            console.warn('Failed to refresh changed file', p, e);
          }
        })
    );
  }, [projectId, baseUrl, openFiles, selectedFile]);

  // Project-level watcher WebSocket: listen for file change broadcasts
  useEffect(() => {
    if (!projectId) return;

    try {
      const wsBase = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
      const url = new URL(wsBase);
      url.searchParams.set('type', 'watcher');
      url.searchParams.set('projectId', projectId);

      const ws = new WebSocket(url.toString());
      watcherWsRef.current = ws;

      ws.onopen = () => {
        // Connected to watcher channel
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg && typeof msg.type === 'string') {
            if (msg.type === 'files:changed' && msg.changes) {
              const changed: string[] = [];
              if (Array.isArray(msg.changes.modified)) changed.push(...msg.changes.modified.map((c: any) => c.path));
              if (Array.isArray(msg.changes.added)) changed.push(...msg.changes.added.map((c: any) => c.path));
              if (Array.isArray(msg.changes.deleted)) changed.push(...msg.changes.deleted.map((c: any) => c.path));
              handleExternalChanges(changed);
            } else if (msg.type === 'file:updated' && typeof msg.path === 'string') {
              handleExternalChanges([msg.path]);
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = () => {
        if (watcherWsRef.current === ws) {
          watcherWsRef.current = null;
        }
      };

      ws.onerror = () => {
        // Best-effort; errors will just disable live updates until reload
      };

      return () => {
        try { ws.close(); } catch {}
        if (watcherWsRef.current === ws) {
          watcherWsRef.current = null;
        }
      };
    } catch (e) {
      console.warn('Watcher WebSocket setup failed:', e);
    }
  }, [projectId, handleExternalChanges]);

  const saveProjectState = useCallback(() => {
    if (projectId) {
      ProjectPersistenceService.saveFileState(
        projectId,
        Array.from(openFiles.keys()),
        selectedFile?.path || null,
        Array.from(expandedFolders)
      );
    }
  }, [projectId, openFiles, selectedFile, expandedFolders]);

  const closeFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const newMap = new Map(prev);
      newMap.delete(path);
      return newMap;
    });
    
    if (selectedFile?.path === path) {
      setSelectedFile(null);
      setCurrentFileContent('');
      lastSavedContent.current = '';
    }
  }, [selectedFile]);

  const loadFileTree = useCallback(async () => {
    if (!projectId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`);
      
      // Check if response is OK before parsing JSON
      if (!response.ok) {
        let errorMessage = `Server returned ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // If response is not JSON, use the status text
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setFileTree(data.structure || []);
        
        // Restore previously open files and selected file
        const session = ProjectPersistenceService.loadProjectSession(projectId);
        if (session) {
          // Restore open files
          for (const filePath of session.openFiles) {
            try {
              const fileResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/read?path=${encodeURIComponent(filePath)}`);
              
              if (fileResponse.ok) {
                const fileData = await fileResponse.json();
                
                if (fileData.success) {
                  const fileItem: FileSystemItem = {
                    name: filePath.split('/').pop() || filePath,
                    path: filePath,
                    type: 'file',
                    size: fileData.content.length
                  };
                  
                  setOpenFiles(prev => new Map(prev).set(filePath, {
                    item: fileItem,
                    content: fileData.content,
                    isDirty: false
                  }));
                }
              }
            } catch (error) {
              console.warn(`Failed to restore file: ${filePath}`, error);
            }
          }
          
          // Restore selected file
          if (session.selectedFile && data.structure) {
            const findFileInTree = (items: FileSystemItem[], path: string): FileSystemItem | null => {
              for (const item of items) {
                if (item.path === path) return item;
                if (item.children) {
                  const found = findFileInTree(item.children, path);
                  if (found) return found;
                }
              }
              return null;
            };
            
            const selectedFileItem = findFileInTree(data.structure, session.selectedFile);
            if (selectedFileItem) {
              setSelectedFile(selectedFileItem);
            }
          }
        }
      } else {
        throw new Error(data.error || 'Failed to load file tree');
      }
    } catch (error) {
      // Handle network errors and other fetch errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        handleError(new Error(`Unable to connect to server at ${baseUrl}. Please ensure the backend server is running.`), 'load file tree');
      } else {
        handleError(error, 'load file tree');
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId, baseUrl]);

  const createFile = useCallback(async (path: string, content: string = '') => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path, content })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // If content is provided, set initial file size
        if (content) {
          // Create a new file item with proper size
          const fileItem: FileSystemItem = {
            name: path.split('/').pop() || path,
            path: path,
            type: 'file',
            size: new Blob([content]).size
          };
          
          // Add to open files
          setOpenFiles(prev => new Map(prev).set(path, {
            item: fileItem,
            content: content,
            isDirty: false
          }));
          
          // Set as selected file
          setSelectedFile(fileItem);
          setCurrentFileContent(content);
          lastSavedContent.current = content;
        }
        
        await loadFileTree();
      } else {
        throw new Error(data.error || 'Failed to create file');
      }
    } catch (error) {
      handleError(error, 'create file');
    }
  }, [projectId, baseUrl, loadFileTree]);

  const createFolder = useCallback(async (path: string) => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: path })
      });
      
      const data = await response.json();
      
      if (data.success) {
        await loadFileTree();
      } else {
        throw new Error(data.error || 'Failed to create folder');
      }
    } catch (error) {
      handleError(error, 'create folder');
    }
  }, [projectId, baseUrl, loadFileTree]);

  const openFile = useCallback(async (item: FileSystemItem) => {
    if (!projectId || item.type !== 'file') return;
    
    // Check if file is already open
    if (openFiles.has(item.path)) {
      const openFile = openFiles.get(item.path)!;
      setSelectedFile(item);
      setCurrentFileContent(openFile.content);
      lastSavedContent.current = openFile.content;
      saveProjectState();
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files/read?path=${encodeURIComponent(item.path)}`);
      const data = await response.json();
      
      if (data.success) {
        const content = data.content;
        
        // Update the item with correct size
        const updatedItem = {
          ...item,
          size: new Blob([content]).size
        };
        
        setOpenFiles(prev => new Map(prev.set(item.path, { 
          item: updatedItem, 
          content, 
          isDirty: false 
        })));
        
        setSelectedFile(updatedItem);
        setCurrentFileContent(content);
        lastSavedContent.current = content;
        
        // Also update the file size in the file tree
        setFileTree(prev => {
          const updateFileInTree = (items: FileSystemItem[]): FileSystemItem[] => {
            return items.map(itemInTree => {
              if (itemInTree.path === item.path) {
                return {
                  ...itemInTree,
                  size: new Blob([content]).size
                };
              }
              if (itemInTree.children) {
                return {
                  ...itemInTree,
                  children: updateFileInTree(itemInTree.children)
                };
              }
              return itemInTree;
            });
          };
          
          return updateFileInTree(prev);
        });
        
        saveProjectState();
      } else {
        throw new Error(data.error || 'Failed to open file');
      }
    } catch (error) {
      handleError(error, 'open file');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, baseUrl, openFiles, saveProjectState]);

  const saveFile = useCallback(async (path: string, content: string) => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files/update`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, content })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Update the open file content
        setOpenFiles(prev => {
          const newMap = new Map(prev);
          const openFile = newMap.get(path);
          if (openFile) {
            const updatedItem = {
              ...openFile.item,
              size: new Blob([content]).size // Update file size based on content length
            };
            newMap.set(path, { 
              ...openFile, 
              content, 
              isDirty: false,
              item: updatedItem
            });
          }
          return newMap;
        });
        
        // Also update the file size in the file tree
        setFileTree(prev => {
          const updateFileInTree = (items: FileSystemItem[]): FileSystemItem[] => {
            return items.map(item => {
              if (item.path === path) {
                return {
                  ...item,
                  size: new Blob([content]).size
                };
              }
              if (item.children) {
                return {
                  ...item,
                  children: updateFileInTree(item.children)
                };
              }
              return item;
            });
          };
          
          return updateFileInTree(prev);
        });
        
        lastSavedContent.current = content;

        // Notify peers via watcher channel for instant updates
        const ws = watcherWsRef.current;
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'file:changed', path, content }));
          } catch {}
        }
      } else {
        throw new Error(data.error || 'Failed to save file');
      }
    } catch (error) {
      handleError(error, 'save file');
    }
  }, [projectId, baseUrl]);

  const deleteItem = useCallback(async (path: string) => {
    if (!projectId) return;

    try {
      // Create file system service adapter for command
      const fileSystemService = {
        readFile: async (projId: string, filePath: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/files/read?path=${encodeURIComponent(filePath)}`);
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to read file');
          return data.content;
        },
        deleteItem: async (projId: string, filePath: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/items/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to delete item');
        },
        createFile: async (projId: string, filePath: string, content: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, content })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to create file');
        }
      };

      // Execute delete using command pattern (enables undo)
      const command = new DeleteFileCommand('current-user', projectId, path, fileSystemService);
      await commandManager.execute(command);

      // Close file if it's open
      if (openFiles.has(path)) {
        closeFile(path);
      }
      await loadFileTree();
    } catch (error) {
      handleError(error, 'delete item');
    }
  }, [projectId, baseUrl, openFiles, loadFileTree, closeFile]);

  const renameItem = useCallback(async (oldPath: string, newPath: string) => {
    if (!projectId) return;

    try {
      // Create file system service adapter for command
      const fileSystemService = {
        renameItem: async (projId: string, oldP: string, newP: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/items/rename`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPath: oldP, newPath: newP })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to rename item');
        }
      };

      // Execute rename using command pattern (enables undo)
      const command = new RenameFileCommand('current-user', projectId, oldPath, newPath, fileSystemService);
      await commandManager.execute(command);

      // Update open files map if the renamed item was open
      if (openFiles.has(oldPath)) {
        const openFile = openFiles.get(oldPath)!;
        setOpenFiles(prev => {
          const newMap = new Map(prev);
          newMap.delete(oldPath);
          newMap.set(newPath, { ...openFile, item: { ...openFile.item, path: newPath, name: newPath.split('/').pop() || newPath } });
          return newMap;
        });

        // Update selected file if it was the renamed one
        if (selectedFile?.path === oldPath) {
          setSelectedFile(prev => prev ? { ...prev, path: newPath, name: newPath.split('/').pop() || newPath } : null);
        }
      }

      await loadFileTree();
    } catch (error) {
      handleError(error, 'rename item');
    }
  }, [projectId, baseUrl, openFiles, selectedFile, loadFileTree]);

  const selectFile = useCallback((item: FileSystemItem | null) => {
    setSelectedFile(item);
    if (item && openFiles.has(item.path)) {
      const openFile = openFiles.get(item.path)!;
      setCurrentFileContent(openFile.content);
      lastSavedContent.current = openFile.content;
    } else {
      setCurrentFileContent('');
      lastSavedContent.current = '';
    }
  }, [openFiles]);

  const updateCurrentContent = useCallback((content: string) => {
    setCurrentFileContent(content);
  }, []);

  const searchFiles = useCallback(async (query: string): Promise<SearchResult[]> => {
    if (!projectId || !query.trim()) return [];
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.success) {
        return data.results.map((result: {
          name: string;
          path: string;
          size: number;
          lastModified: string;
          searchType?: string;
          matches?: string[];
        }) => ({
          name: result.name,
          path: result.path,
          size: result.size,
          lastModified: new Date(result.lastModified),
          searchType: result.searchType || 'filename',
          matches: result.matches || []
        }));
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (error) {
      handleError(error, 'search files');
      return [];
    }
  }, [projectId, baseUrl]);

  // Copy and move operations with command pattern
  const copyItem = useCallback(async (sourcePath: string, destinationPath: string) => {
    if (!projectId) return;

    try {
      // Create file system service adapter for command
      const fileSystemService = {
        copyItem: async (projId: string, source: string, destination: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/copy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: source, destinationPath: destination })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to copy item');
        },
        deleteItem: async (projId: string, filePath: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/items/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to delete item');
        }
      };

      // Execute copy using command pattern (enables undo)
      const command = new CopyFileCommand('current-user', projectId, sourcePath, destinationPath, fileSystemService);
      await commandManager.execute(command);

      await loadFileTree();
    } catch (error) {
      handleError(error, 'copy item');
    }
  }, [projectId, baseUrl, loadFileTree]);

  const moveItem = useCallback(async (sourcePath: string, destinationPath: string) => {
    if (!projectId) return;

    try {
      // Create file system service adapter for command
      const fileSystemService = {
        moveItem: async (projId: string, source: string, destination: string) => {
          const response = await fetch(`${baseUrl}/api/projects/${projId}/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePath: source, destinationPath: destination })
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to move item');
        }
      };

      // Execute move using command pattern (enables undo)
      const command = new MoveFileCommand('current-user', projectId, sourcePath, destinationPath, fileSystemService);
      await commandManager.execute(command);

      // Update open files map if the moved item was open
      if (openFiles.has(sourcePath)) {
        const openFile = openFiles.get(sourcePath)!;
        setOpenFiles(prev => {
          const newMap = new Map(prev);
          newMap.delete(sourcePath);
          newMap.set(destinationPath, { ...openFile, item: { ...openFile.item, path: destinationPath, name: destinationPath.split('/').pop() || destinationPath } });
          return newMap;
        });

        // Update selected file if it was the moved one
        if (selectedFile?.path === sourcePath) {
          setSelectedFile(prev => prev ? { ...prev, path: destinationPath, name: destinationPath.split('/').pop() || destinationPath } : null);
        }
      }

      await loadFileTree();
    } catch (error) {
      handleError(error, 'move item');
    }
  }, [projectId, baseUrl, openFiles, selectedFile, loadFileTree]);

  const closeAllFiles = useCallback(() => {
    setOpenFiles(new Map());
    setSelectedFile(null);
    setCurrentFileContent('');
  }, [setOpenFiles, setSelectedFile, setCurrentFileContent]);

  const getFileMetadata = useCallback(async (path: string) => {
    // TODO: Implement metadata retrieval
    console.log('Get file metadata not implemented yet', { path });
    return {
      size: 0,
      lastModified: new Date(),
      etag: '',
      metaData: {}
    };
  }, []);

  const saveAllFiles = useCallback(async () => {
    // TODO: Implement save all functionality
    console.log('Save all not implemented yet');
  }, []);

  const revertFile = useCallback(async (path: string) => {
    // TODO: Implement revert functionality
    console.log('Revert not implemented yet', { path });
  }, []);

  const duplicateFile = useCallback(async (path: string) => {
    // TODO: Implement duplicate functionality
    console.log('Duplicate not implemented yet', { path });
  }, []);

  // Auto-save functionality
  React.useEffect(() => {
    if (!selectedFile || !currentFileContent || currentFileContent === lastSavedContent.current) {
      return;
    }

    const timeoutId = setTimeout(() => {
      saveFile(selectedFile.path, currentFileContent);
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [currentFileContent, selectedFile, saveFile]);

  const value: FileSystemContextType = {
    projectId,
    projectName: currentProjectName, // Use the state variable instead of the prop directly
    fileTree,
    selectedFile,
    openFiles,
    currentFileContent,
    isLoading,
    error,
    expandedFolders,
    loadFileTree,
    createFile,
    createFolder,
    openFile,
    saveFile,
    deleteItem,
    renameItem,
    copyItem,
    moveItem,
    closeFile,
    closeAllFiles,
    selectFile,
    updateCurrentContent,
    searchFiles,
    getFileMetadata,
    setExpandedFolders,
    saveAllFiles,
    revertFile,
    duplicateFile
  };

  return (
    <FileSystemContext.Provider value={value}>
      {children}
    </FileSystemContext.Provider>
  );
}