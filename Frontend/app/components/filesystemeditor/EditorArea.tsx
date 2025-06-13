import { useFileSystem } from "@/context/FileSystemContext";
import { FileEditorContent } from "./FileEditorContent";
import { EmptyState } from "./EmptyState";

interface EditorAreaProps {
    isDark: boolean;
  }
  
export function EditorArea({ isDark }: EditorAreaProps) {
    const { 
      selectedFile, 
      currentFileContent, 
      updateCurrentContent, 
      openFiles,
      saveFile
    } = useFileSystem();
  
    if (selectedFile && selectedFile.type === 'file') {
      return (
        <FileEditorContent
          selectedFile={selectedFile}
          currentFileContent={currentFileContent}
          updateCurrentContent={updateCurrentContent}
          saveFile={saveFile}
          openFiles={openFiles}
          isDark={isDark}
        />
      );
    }
  
    return <EmptyState selectedFile={selectedFile} isDark={isDark} />;
  }