import { useState, useEffect, useCallback } from 'react';
import { FileSystemItem } from '@/types/fileSystem';
import { getLanguageFromExtension } from './LanguageDetection';
import { FileInfoBar } from './FileInfoBar';
import { MonacoEditorWrapper } from './MonacoEditorWrapper';
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { usePermissions } from '@/hooks/usePermissions';

interface OpenFileContent {
  item: FileSystemItem;
  content: string;
  isDirty: boolean;
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

  const handleSave = useCallback(() => {
    if (!canEdit) return;
    if (selectedFile && currentFileContent !== undefined) {
      saveFile(selectedFile.path, currentFileContent);
    }
  }, [selectedFile, currentFileContent, saveFile, canEdit]);

  // Handle Ctrl+S / Cmd+S for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (canEdit) handleSave();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleSave, canEdit]);

  const isModified = () => {
    const openFile = openFiles.get(selectedFile.path);
    if (!openFile) return false;
    return currentFileContent !== openFile.content;
  };

  return (
    <div className="h-full flex flex-col min-w-0 overflow-hidden">
      <FileInfoBar
        selectedFile={selectedFile}
        language={language}
        isModified={canEdit && isModified()}
        onSave={handleSave}
        isDark={isDark}
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