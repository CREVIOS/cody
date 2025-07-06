"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { FileSystemItem, FileSystemContextType, SearchResult } from '@/types/fileSystem';
import { ProjectPersistenceService, ProjectSession } from '@/lib/projectPersistence';

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
  
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const lastSavedContent = useRef<string>('');

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
      const data = await response.json();
      
      if (data.success) {
        setFileTree(data.structure);
        
        // Restore previously open files and selected file
        const session = ProjectPersistenceService.loadProjectSession(projectId);
        if (session) {
          // Restore open files
          for (const filePath of session.openFiles) {
            try {
              const fileResponse = await fetch(`${baseUrl}/api/projects/${projectId}/files/read?path=${encodeURIComponent(filePath)}`);
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
            } catch (error) {
              console.warn(`Failed to restore file: ${filePath}`, error);
            }
          }
          
          // Restore selected file
          if (session.selectedFile) {
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
      handleError(error, 'load file tree');
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
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/items/delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Close file if it's open
        if (openFiles.has(path)) {
          closeFile(path);
        }
        await loadFileTree();
      } else {
        throw new Error(data.error || 'Failed to delete item');
      }
    } catch (error) {
      handleError(error, 'delete item');
    }
  }, [projectId, baseUrl, openFiles, loadFileTree, closeFile]);

  const renameItem = useCallback(async (oldPath: string, newPath: string) => {
    if (!projectId) return;
    
    try {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/items/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath })
      });
      
      const data = await response.json();
      
      if (data.success) {
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
      } else {
        throw new Error(data.error || 'Failed to rename item');
      }
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

  // Stub implementations for missing methods
  const copyItem = useCallback(async (sourcePath: string, destinationPath: string) => {
    // TODO: Implement copy functionality
    console.log('Copy not implemented yet', { sourcePath, destinationPath });
  }, []);

  const moveItem = useCallback(async (sourcePath: string, destinationPath: string) => {
    // TODO: Implement move functionality
    console.log('Move not implemented yet', { sourcePath, destinationPath });
  }, []);

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