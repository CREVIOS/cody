import FileSystemEditor from "@/components/filesystemeditor/FileSystemEditor";
import Terminal from "@/components/Terminal";

interface MainContentAreaProps {
  showTerminal: boolean;
  onTerminalClose: () => void;
  showCollaborators: boolean;
  collaboratorsComponent: React.ReactNode;
}

export function MainContentArea({ 
  showTerminal, 
  onTerminalClose, 
  showCollaborators, 
  collaboratorsComponent 
}: MainContentAreaProps) {
  return (
    <div className="col-span-1 row-span-1 flex flex-col min-h-0 overflow-hidden p-4 relative">
      <FileSystemEditor />
      {showTerminal && (
        <div className="absolute bottom-0 left-0 right-0 h-60 z-20 px-4">
          <div className="h-full rounded-md overflow-hidden border border-gray-700 bg-[#1e1e1e]">
            <Terminal onClose={onTerminalClose} />
          </div>
        </div>
      )}
      
      {showCollaborators && collaboratorsComponent}
    </div>
  );
}
