import { useState, useEffect, useCallback } from 'react';
import { FileSystemItem } from '@/types/fileSystem';
import { getLanguageFromExtension } from './LanguageDetection';
import { FileInfoBar } from './FileInfoBar';
import { MonacoEditorWrapper } from './MonacoEditorWrapper';

interface OpenFileContent {
  item: FileSystemItem;
  content: string;
  isDirty: boolean;
}

interface FileEditorContentProps {
  selectedFile: FileSystemItem;
  currentFileContent: string;
  updateCurrentContent: (content: string) => void;
  saveFile: (path: string, content: string) => void;
  openFiles: Map<string, OpenFileContent>;
  isDark: boolean;
}

export function FileEditorContent({ 
  selectedFile, 
  currentFileContent, 
  updateCurrentContent, 
  saveFile, 
  openFiles, 
  isDark 
}: FileEditorContentProps) {
  const [language, setLanguage] = useState("javascript");

  // Determine language based on file extension
  useEffect(() => {
    if (selectedFile) {
      const detectedLanguage = getLanguageFromExtension(selectedFile.name);
      setLanguage(detectedLanguage);
    }
  }, [selectedFile]);

  const handleEditorChange = (value: string | undefined) => {
    updateCurrentContent(value || '');
  };

  const handleSave = useCallback(() => {
    if (selectedFile && currentFileContent !== undefined) {
      saveFile(selectedFile.path, currentFileContent);
    }
  }, [selectedFile, currentFileContent, saveFile]);

  // Handle Ctrl+S / Cmd+S for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const isModified = () => {
    const openFile = openFiles.get(selectedFile.path);
    if (!openFile) return false;
    return currentFileContent !== openFile.content;
  };

  return (
    <div className="h-full flex flex-col">
      <FileInfoBar
        selectedFile={selectedFile}
        language={language}
        isModified={isModified()}
        onSave={handleSave}
        isDark={isDark}
      />

      <MonacoEditorWrapper
        language={language}
        content={currentFileContent}
        onChange={handleEditorChange}
        isDark={isDark}
      />
    </div>
  );
}