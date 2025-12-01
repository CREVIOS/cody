import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileSystemItem } from '@/types/fileSystem';
import { getLanguageFromExtension } from './LanguageDetection';
import { FileInfoBar } from './FileInfoBar';
import { MonacoEditorWrapper } from './MonacoEditorWrapper';
import { CollabDebugPanel } from './CollabDebugPanel';
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { usePermissions } from '@/hooks/usePermissions';
import { useFileLock } from '@/hooks/useFileLock';
import { useCommandManager } from '@/hooks/useCommandManager';
const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';

interface OpenFileContent {
  item: FileSystemItem;
  content: string;
  savedContent: string;
  isDirty: boolean;
  isSaving?: boolean;
  projectId?: string;
  user?: User;
}

interface FileEditorContentProps {
  selectedFile: FileSystemItem;
  currentFileContent: string;
  updateCurrentContent: (content: string) => void;
  saveFile: (path: string, content: string) => void;
  openFiles: Map<string, OpenFileContent>;
  isDark: boolean;
  projectId?: string;
  user?: User;
  userRole?: string;
}

interface RealtimeKeyMetadata {
  docId: string;
  fileId: string;
  projectId: string;
  permissions: {
    canEdit: boolean;
    canView: boolean;
  };
}

export function FileEditorContent({
  selectedFile,
  currentFileContent,
  updateCurrentContent,
  saveFile,
  openFiles,
  isDark,
  projectId,
  user,
  userRole,
}: FileEditorContentProps) {
  const [language, setLanguage] = useState("javascript");
  const [realtimeKey, setRealtimeKey] = useState<RealtimeKeyMetadata | null>(null);
  const [realtimeKeyLoading, setRealtimeKeyLoading] = useState(false);
  const [realtimeKeyError, setRealtimeKeyError] = useState<string | null>(null);
  
  // Phase 7: Track last saved version for debug panel
  const [lastSavedVersionId, setLastSavedVersionId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  
  // Phase 7: WebSocket status from collaboration
  const [wsStatus, setWsStatus] = useState<'connected' | 'disconnected' | 'syncing' | 'error'>('disconnected');
  
  // Store collaboration actions ref for save pipeline (Phase 6)
  const collaborationActionsRef = useRef<{ 
    getSnapshot?: () => string;
    setContent?: (content: string) => void;
    getWsStatus?: () => 'connected' | 'disconnected' | 'syncing' | 'error';
  } | null>(null);

  // Permissions: prefer project-specific evaluation; fallback to role-based
  const { hasPermission } = usePermissions({
    roleId: null,
    projectId: projectId,
    userId: user?.user_id,
  });
  const canEdit = hasPermission('canEdit');
  const canRequestLock = hasPermission('canRequestLock');

  // File lock management - Phase 5: Auto-request lock on file open
  const [isRequestingLock, setIsRequestingLock] = useState(false);
  const {
    state: lockState,
    canEdit: hasEditLock,
    request: requestLock,
    release: releaseLock,
  } = useFileLock({
    fileId: selectedFile?.path,
    userId: user?.user_id,
    role: (userRole?.toLowerCase() || 'editor') as 'owner' | 'admin' | 'editor' | 'viewer',
    autoRequest: true, // Phase 5: Auto-request lock when file opens
    heartbeatMs: 5_000, // Phase 5: Heartbeat every 5 seconds
    canRequestLock: canRequestLock,
    canLock: canEdit,
    projectId: projectId,
  });

  // Determine language based on file extension
  useEffect(() => {
    if (selectedFile) {
      const detectedLanguage = getLanguageFromExtension(selectedFile.name);
      setLanguage(detectedLanguage);
    }
  }, [selectedFile]);

  // Phase 5: Request lock when file opens
  useEffect(() => {
    if (!selectedFile || !user?.user_id || !canEdit) return;
    
    // Request lock automatically when file opens
    const requestLockOnOpen = async () => {
      try {
        await requestLock();
      } catch (error) {
        console.error('Failed to request lock on file open:', error);
      }
    };
    
    requestLockOnOpen();
  }, [selectedFile?.path, user?.user_id, canEdit, requestLock]);

  // Phase 5: Release lock when switching files or closing
  useEffect(() => {
    return () => {
      // Cleanup: release lock when component unmounts or file changes
      if (selectedFile?.path && user?.user_id) {
        releaseLock().catch((error) => {
          console.error('Failed to release lock on cleanup:', error);
        });
      }
    };
  }, [selectedFile?.path, user?.user_id, releaseLock]);

  // Phase 5: Release lock on browser unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (selectedFile?.path && user?.user_id) {
        // Use sendBeacon for reliable unload handling
        navigator.sendBeacon(
          `${API_BASE_URL}/api/v1/locks/${encodeURIComponent(selectedFile.path)}/release?project_id=${encodeURIComponent(projectId || '')}`,
          JSON.stringify({ user_id: user.user_id })
        );
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [selectedFile?.path, user?.user_id, projectId, API_BASE_URL]);

  // Fetch realtime-key metadata when file is selected
  useEffect(() => {
    if (!selectedFile || !projectId || !user?.user_id) {
      setRealtimeKey(null);
      return;
    }

    const fetchRealtimeKey = async () => {
      setRealtimeKeyLoading(true);
      setRealtimeKeyError(null);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/v1/files/${encodeURIComponent(selectedFile.path)}/realtime-key?user_id=${encodeURIComponent(user.user_id)}&project_id=${encodeURIComponent(projectId)}`
        );
        
        if (!response.ok) {
          throw new Error(`Failed to fetch realtime-key: ${response.statusText}`);
        }
        
        const data: RealtimeKeyMetadata = await response.json();
        setRealtimeKey(data);
      } catch (error) {
        console.error('Error fetching realtime-key:', error);
        setRealtimeKeyError(error instanceof Error ? error.message : 'Failed to fetch realtime-key');
        // Don't block editor if realtime-key fails - allow fallback behavior
      } finally {
        setRealtimeKeyLoading(false);
      }
    };

    fetchRealtimeKey();
  }, [selectedFile?.path, projectId, user?.user_id]);

  // Phase 5: Combine permission-based canEdit with lock-based canEdit
  const effectiveCanEdit = useMemo(() => {
    if (!canEdit) return false; // No permission
    if (!lockState) return false; // No lock state yet
    // Use lockState.canEdit if available, otherwise check if user holds the lock
    if ('canEdit' in lockState) {
      return lockState.canEdit;
    }
    // Fallback: check if user holds the lock
    if (lockState.state === 'LOCKED') {
      const lockedBy = lockState.locked_by || lockState.holder_user_id;
      return lockedBy === user?.user_id;
    }
    return lockState.state === 'UNLOCKED';
  }, [canEdit, lockState, user?.user_id]);

  const handleEditorChange = (value: string | undefined) => {
    if (!effectiveCanEdit) return;
    updateCurrentContent(value || "");
  };

  // Command manager for undo/redo
  const { canUndo, canRedo, undo, redo, execute } = useCommandManager();

  const handleSave = useCallback(async () => {
    // Phase 5: Use effectiveCanEdit (includes lock check)
    if (!effectiveCanEdit) {
      console.warn('Cannot save: user does not have edit permission or lock');
      return;
    }
    if (!selectedFile || !projectId || !user?.user_id) return;
    
    try {
      // Phase 6 Step 2: Get CRDT snapshot if collaboration is enabled
      let contentToSave = currentFileContent;
      
      if (realtimeKey && collaborationActionsRef.current?.getSnapshot) {
        // Get snapshot from Y.Doc (Phase 6: Use CRDT snapshot)
        const snapshot = collaborationActionsRef.current.getSnapshot();
        if (snapshot !== undefined && snapshot !== null) {
          contentToSave = snapshot;
          console.log('[Save] Using Y.Doc snapshot for save:', snapshot.length, 'chars');
        }
      }
      
      // Phase 6 Step 2: Use SaveFileCommand with new API
      const { SaveFileCommand } = await import('@/lib/commands/SaveFileCommand');
      const { saveFileContent } = await import('@/lib/projectAPI/FileVersionsAPI');
      
      // Create save service that uses the new API
      const saveService = {
        getCurrentVersionId: async (projId: string, filePath: string) => {
          // This is handled by the new save endpoint
          return { success: true, versionId: null, exists: false };
        },
        updateFile: async (projId: string, filePath: string, fileContent: string) => {
          // Phase 6: Use new save-content endpoint
          const result = await saveFileContent(filePath, projId, user.user_id, fileContent);
          
          // Phase 7: Track versionId for debug panel
          if (result.versionId) {
            setLastSavedVersionId(result.versionId);
            setLastSavedAt(new Date(result.createdAt || Date.now()));
          }
          
          return {
            success: true,
            versionId: result.versionId,
            versionNumber: result.versionNumber,
          };
        },
        restoreFileVersion: async (projId: string, filePath: string, versionId: string) => {
          // Use SBackend restore endpoint
          const baseUrl = process.env.NEXT_PUBLIC_FILE_SYSTEM_URL || 'http://localhost:3001';
          const response = await fetch(`${baseUrl}/api/projects/${projId}/files/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: filePath, versionId }),
          });
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to restore version');
          return data;
        },
        getFileVersion: async (projId: string, filePath: string, versionId: string) => {
          // Phase 6: Use new version content endpoint
          const { getFileVersionContent } = await import('@/lib/projectAPI/FileVersionsAPI');
          const result = await getFileVersionContent(versionId, projId);
          return { success: true, content: result.content };
        },
        readFile: async (projId: string, filePath: string) => {
          const baseUrl = process.env.NEXT_PUBLIC_FILE_SYSTEM_URL || 'http://localhost:3001';
          const response = await fetch(`${baseUrl}/api/projects/${projId}/files/read?path=${encodeURIComponent(filePath)}`);
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Failed to read file');
          return { success: true, content: data.content };
        },
      };
      
      // Phase 6 Step 6: Add Y.Doc update callback for undo/redo
      const updateYDocContent = collaborationActionsRef.current?.setContent 
        ? (content: string) => {
            // Phase 6 Step 6: Update Y.Doc directly with restored content
            collaborationActionsRef.current?.setContent?.(content);
            // Also update UI
            updateCurrentContent(content);
            console.log('[Save] Updated Y.Doc and UI with restored version content');
          }
        : undefined;
      
      // Add updateYDocContent to saveService
      const saveServiceWithYDoc = {
        ...saveService,
        updateYDocContent,
      };
      
      const saveCommand = new SaveFileCommand(
        user.user_id,
        projectId,
        selectedFile.path,
        contentToSave,
        currentFileContent, // Previous content before save
        saveServiceWithYDoc,
        (updatedContent: string) => {
          // Update UI with saved content
          updateCurrentContent(updatedContent);
        }
      );
      
      // Phase 6 Step 2: Execute save through command manager (enables undo/redo)
      await execute(saveCommand);
      
      // Phase 7: Track versionId from save response
      // The versionId is captured in the saveService.updateFile call
      // We'll get it from the save response by calling saveFileContent directly
      // But we already called it in saveService, so we need to track it there
      // For now, we'll update the timestamp and try to get versionId from the command later
      setLastSavedAt(new Date());
      
      // Note: versionId will be tracked via the saveService.updateFile response
      // We can enhance this later to extract it from the command's internal state
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Save succeeded:', {
          filePath: selectedFile.path,
          contentLength: contentToSave.length,
          timestamp: new Date().toISOString(),
        });
      }
      
      // Also call the original saveFile for FileSystemContext integration
      // This updates the openFiles state in the context
      await saveFile(selectedFile.path, contentToSave);
      
    } catch (error) {
      console.error('Save failed:', error);
      
      // Phase 7: Improved error surfacing
      let errorMessage = 'Save failed. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('Lock required') || error.message.includes('do not hold the lock')) {
          errorMessage = 'Cannot save: you no longer hold the lock. Please re-acquire the lock and try again.';
        } else if (error.message.includes('403')) {
          errorMessage = 'Permission denied: you do not have permission to save this file.';
        } else if (error.message.includes('503') || error.message.includes('SBackend')) {
          errorMessage = 'Service unavailable: the file storage service is not responding. Please try again later.';
        } else {
          errorMessage = `Save failed: ${error.message}`;
        }
      }
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.error('[Phase 7] Save error:', {
          filePath: selectedFile.path,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
      
      // Show user-friendly error message
      alert(errorMessage);
    }
  }, [selectedFile, currentFileContent, saveFile, effectiveCanEdit, realtimeKey, projectId, user?.user_id, updateCurrentContent, openFiles]);

  const handleUndo = useCallback(async () => {
    if (!canEdit || !canUndo) return;
    try {
      await undo();
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Undo performed:', {
          filePath: selectedFile?.path,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Undo failed:', error);
      
      // Phase 7: Improved error surfacing
      let errorMessage = 'Failed to undo. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('version') || error.message.includes('Version')) {
          errorMessage = 'Failed to load previous version. Please try again.';
        } else {
          errorMessage = `Undo failed: ${error.message}`;
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.error('[Phase 7] Undo error:', error);
      }
      
      alert(errorMessage);
    }
  }, [canEdit, canUndo, undo, selectedFile?.path]);

  const handleRedo = useCallback(async () => {
    if (!canEdit || !canRedo) return;
    try {
      await redo();
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Redo performed:', {
          filePath: selectedFile?.path,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Redo failed:', error);
      
      // Phase 7: Improved error surfacing
      let errorMessage = 'Failed to redo. Please try again.';
      if (error instanceof Error) {
        errorMessage = `Redo failed: ${error.message}`;
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.error('[Phase 7] Redo error:', error);
      }
      
      alert(errorMessage);
    }
  }, [canEdit, canRedo, redo, selectedFile?.path]);

  // Handle keyboard shortcuts: Ctrl+S (save), Ctrl+Z (undo), Ctrl+Y/Ctrl+Shift+Z (redo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S for save
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canEdit) handleSave();
      }
      // Ctrl+Z / Cmd+Z for undo
      else if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canEdit && canUndo) handleUndo();
      }
      // Ctrl+Y or Ctrl+Shift+Z / Cmd+Shift+Z for redo
      else if (
        ((e.ctrlKey || e.metaKey) && e.key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
      ) {
        e.preventDefault();
        if (canEdit && canRedo) handleRedo();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, handleUndo, handleRedo, canEdit, canUndo, canRedo]);

  const isModified = () => {
    const openFile = openFiles.get(selectedFile.path);
    if (!openFile) return false;
    // Check if content differs from saved content
    return openFile.isDirty || currentFileContent !== (openFile.savedContent || openFile.content);
  };

  const isSaving = () => {
    const openFile = openFiles.get(selectedFile.path);
    return openFile?.isSaving || false;
  };

  const handleRequestLock = useCallback(async () => {
    if (!canRequestLock || !lockState || isRequestingLock) return;
    // Only allow requesting if file is locked by someone else
    if (lockState.state !== 'LOCKED') return;
    setIsRequestingLock(true);
    try {
      await requestLock();
    } catch (err) {
      console.error('Failed to request lock:', err);
    } finally {
      setIsRequestingLock(false);
    }
  }, [canRequestLock, lockState, requestLock, isRequestingLock]);

  // Phase 5: Determine lock status for UI indicators
  const lockStatus = useMemo(() => {
    if (!lockState || !user?.user_id) {
      return { status: 'requesting', message: '🟡 Requesting lock…' };
    }
    
    if (lockState.state === 'LOCKED') {
      const lockedBy = lockState.locked_by || lockState.holder_user_id;
      if (lockedBy === user.user_id) {
        return { status: 'owned', message: '🟢 You are editing (lock active)' };
      } else {
        // Try to get user email - for now use user_id, can be enhanced later
        return { 
          status: 'locked_by_other', 
          message: `🔒 Locked by ${lockedBy?.substring(0, 8)}...`,
          lockedBy 
        };
      }
    }
    
    return { status: 'unlocked', message: '🟢 File unlocked' };
  }, [lockState, user?.user_id]);

  // Convert lock state to FileInfoBar format with proper narrowing
  let lockStateForBar:
    | {
        state: 'UNLOCKED' | 'LOCKED' | 'QUEUED';
        holder_user_id?: string;
        holder_name?: string;
        queue_position?: number;
        expires_at?: string;
      }
    | undefined;

  if (lockState) {
    if (lockState.state === 'LOCKED') {
      lockStateForBar = {
        state: 'LOCKED',
        holder_user_id: lockState.locked_by || lockState.holder_user_id,
        // holder_name not provided by backend yet; UI will fall back gracefully
        queue_position: lockState.queue_size,
        expires_at: lockState.expires_at,
      };
    } else {
      // UNLOCKED or any other future state
      lockStateForBar = { state: 'UNLOCKED' };
    }
  }

  return (
    <div className="h-full flex flex-col min-w-0 overflow-hidden">
      <FileInfoBar
        selectedFile={selectedFile}
        language={language}
        isModified={effectiveCanEdit && isModified()}
        isSaving={isSaving()}
        onSave={handleSave}
        isDark={isDark}
        lockState={lockStateForBar}
        canRequestLock={canRequestLock && !effectiveCanEdit && lockState?.state === 'LOCKED'}
        canEdit={effectiveCanEdit}
        onRequestLock={handleRequestLock}
        isRequestingLock={isRequestingLock}
      />

      {/* Phase 5: Lock status indicator */}
      {lockStatus && (
        <div 
          className={`px-3 py-1.5 text-xs border-b flex items-center gap-2 shrink-0 ${
            isDark 
              ? 'bg-[#1e1e1e] border-[#3e3e42] text-[#cccccc]' 
              : 'bg-[#ffffff] border-[#e5e5e5] text-[#383838]'
          }`}
          data-testid="file-lock-indicator"
        >
          <span>{lockStatus.message}</span>
          {lockState?.expires_in !== null && lockState?.expires_in !== undefined && (
            <span className="opacity-70">(expires in {lockState.expires_in}s)</span>
          )}
        </div>
      )}

      {/* Phase 7: WebSocket offline warning */}
      {realtimeKey && wsStatus === 'disconnected' && (
        <div className={`px-3 py-1.5 text-xs border-b flex items-center gap-2 shrink-0 ${
          isDark 
            ? 'bg-yellow-900/20 border-yellow-700/50 text-yellow-300' 
            : 'bg-yellow-50 border-yellow-200 text-yellow-800'
        }`}>
          <span>⚠️ Collaboration offline — changes are local only</span>
        </div>
      )}

      <MonacoEditorWrapper
        language={language}
        content={currentFileContent}
        onChange={handleEditorChange}
        isDark={isDark}
        roomName={projectId || 'default'}
        username={user?.username || 'User'}
        userId={user?.user_id || ''}
        docKey={selectedFile.path}
        forceReadOnly={!effectiveCanEdit}
        lockState={lockState}
        lockStatusMessage={lockStatus.message}
        collaboration={
          realtimeKey && realtimeKey.permissions.canView
            ? {
                enabled: true,
                docId: realtimeKey.docId,
                projectId: realtimeKey.projectId,
                fileId: realtimeKey.fileId,
                user: {
                  id: user?.user_id || '',
                  name: user?.username || 'User',
                },
                wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
                offlineSupport: true,
              }
            : undefined
        }
        onCollaborationReady={(actions) => {
          // Store collaboration actions for save pipeline (Phase 6)
          collaborationActionsRef.current = actions;
        }}
        onWsStatusChange={(status) => {
          // Phase 7: Track WebSocket status for debug panel
          setWsStatus(status);
        }}
      />
      
      {/* Phase 7: Collaboration Debug Panel */}
      <CollabDebugPanel
        docId={realtimeKey?.docId}
        fileId={realtimeKey?.fileId}
        projectId={realtimeKey?.projectId || projectId}
        lockState={lockState}
        lastSavedVersionId={lastSavedVersionId}
        lastSavedAt={lastSavedAt}
        isCollaborative={!!(realtimeKey && realtimeKey.permissions.canView)}
        wsStatus={wsStatus}
        onReloadVersion={async (versionId: string) => {
          // Phase 7 Step 6: Force reload version (dev tool)
          if (!projectId || !collaborationActionsRef.current?.setContent) return;
          
          try {
            const { getFileVersionContent } = await import('@/lib/projectAPI/FileVersionsAPI');
            const result = await getFileVersionContent(versionId, projectId);
            
            // Update Y.Doc with version content
            collaborationActionsRef.current.setContent(result.content);
            updateCurrentContent(result.content);
            
            console.log('[Phase 7] Reloaded version:', versionId);
          } catch (error) {
            console.error('[Phase 7] Failed to reload version:', error);
            alert('Failed to reload version. Please try again.');
          }
        }}
        isDark={isDark}
      />
    </div>
  );
}