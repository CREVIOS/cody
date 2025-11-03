import { useFileSystem } from "@/context/FileSystemContext";
import { FileEditorContent } from "./FileEditorContent";
import { EmptyState } from "./EmptyState";
import { User } from "@/lib/projectAPI/TypeDefinitions";

interface EditorAreaProps {
  isDark: boolean;
  projectId?: string;
  user?: User;
  userRole?: string;
}

export function EditorArea({ isDark, projectId, user, userRole }: EditorAreaProps) {
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
        projectId={projectId}
        user={user}
        userRole={userRole}
      />
    );
  }

  return <EmptyState selectedFile={selectedFile} isDark={isDark} />;
}