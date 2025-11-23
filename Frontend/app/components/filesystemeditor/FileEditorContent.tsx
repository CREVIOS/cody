import { useState, useEffect, useCallback } from 'react';
import { FileSystemItem } from '@/types/fileSystem';
import { getLanguageFromExtension } from './LanguageDetection';
import { FileInfoBar } from './FileInfoBar';
import { MonacoEditorWrapper } from './MonacoEditorWrapper';
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { usePermissions } from '@/hooks/usePermissions';
import { useFileLock } from '@/hooks/useFileLock';
import { useCommandManager } from '@/hooks/useCommandManager';

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

  // Permissions: prefer project-specific evaluation; fallback to role-based
  const { hasPermission } = usePermissions({
    roleId: null,
    projectId: projectId,
    userId: user?.user_id,
  });
  const canEdit = hasPermission('canEdit');
  const canRequestLock = hasPermission('canRequestLock');

  // File lock management
  const [isRequestingLock, setIsRequestingLock] = useState(false);
  const {
    state: lockState,
    request: requestLock,
  } = useFileLock({
    fileId: selectedFile?.path,
    userId: user?.user_id,
    role: (userRole?.toLowerCase() || 'editor') as 'owner' | 'admin' | 'editor' | 'viewer',
    autoRequest: false, // Disable auto-request - user will manually request via button
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

  const handleEditorChange = (value: string | undefined) => {
    if (!canEdit) return;
    updateCurrentContent(value || "");
  };

  // Command manager for undo/redo
  const { canUndo, canRedo, undo, redo } = useCommandManager();

  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    if (selectedFile && currentFileContent !== undefined) {
      try {
        await saveFile(selectedFile.path, currentFileContent);
      } catch (error) {
        console.error('Save failed:', error);
        // Error is already handled in saveFile, but we can show additional feedback here if needed
      }
    }
  }, [selectedFile, currentFileContent, saveFile, canEdit]);

  const handleUndo = useCallback(async () => {
    if (!canEdit || !canUndo) return;
    try {
      await undo();
    } catch (error) {
      console.error('Undo failed:', error);
    }
  }, [canEdit, canUndo, undo]);

  const handleRedo = useCallback(async () => {
    if (!canEdit || !canRedo) return;
    try {
      await redo();
    } catch (error) {
      console.error('Redo failed:', error);
    }
  }, [canEdit, canRedo, redo]);

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
        holder_user_id: lockState.holder_user_id,
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
        isModified={canEdit && isModified()}
        isSaving={isSaving()}
        onSave={handleSave}
        isDark={isDark}
        lockState={lockStateForBar}
        canRequestLock={canRequestLock && !canEdit && lockState?.state === 'LOCKED'}
        canEdit={canEdit}
        onRequestLock={handleRequestLock}
        isRequestingLock={isRequestingLock}
      />

      <MonacoEditorWrapper
        language={language}
        content={currentFileContent}
        onChange={handleEditorChange}
        isDark={isDark}
        roomName={projectId || 'default'}
        username={user?.username || 'User'}
        userId={user?.user_id || ''}
        docKey={selectedFile.path}
        forceReadOnly={!canEdit}
      />
    </div>
  );
}