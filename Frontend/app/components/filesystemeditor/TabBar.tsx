import { useFileSystem } from "@/context/FileSystemContext";
import { FileTab } from "./FileTab";


interface TabBarProps {
  isDark: boolean;
}

export function TabBar({ isDark }: TabBarProps) {
  const { 
    selectedFile, 
    currentFileContent, 
    openFiles,
    selectFile,
    closeFile
  } = useFileSystem();

  const handleTabClick = (path: string) => {
    const openFile = openFiles.get(path);
    if (openFile) {
      selectFile(openFile.item);
    }
  };

  const handleTabClose = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    closeFile(path);
  };

  const isModified = (path: string) => {
    const openFile = openFiles.get(path);
    if (!openFile) return false;
    return selectedFile?.path === path && currentFileContent !== openFile.content;
  };

  if (openFiles.size === 0) return null;

  return (
    <div className={`flex overflow-x-auto border-b ${
      isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'
    }`}>
      {Array.from(openFiles.entries()).map(([path, openFile]) => {
        const isActive = selectedFile?.path === path;
        const modified = isModified(path);
        
        return (
          <FileTab
            key={path}
            path={path}
            fileName={openFile.item.name}
            isActive={isActive}
            isModified={modified}
            onTabClick={handleTabClick}
            onTabClose={handleTabClose}
            isDark={isDark}
          />
        );
      })}
    </div>
  );
}
