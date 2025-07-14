import FileSystemEditor from "@/components/filesystemeditor/FileSystemEditor";
import Terminal from "@/components/Terminal";
import { RealtimeCursors } from "@/components/realtime-cursors";
import { User } from "@/lib/projectAPI/TypeDefinitions";

interface MainContentAreaProps {
  showTerminal: boolean;
  onTerminalClose: () => void;
  showCollaborators: boolean;
  collaboratorsComponent: React.ReactNode;
  projectId?: string;
  user?: User;
}

export function MainContentArea({ 
  showTerminal, 
  onTerminalClose, 
  showCollaborators, 
  collaboratorsComponent,
  projectId,
  user
}: MainContentAreaProps) {
  return (
    <div className="col-span-1 row-span-1 flex flex-col min-h-0 overflow-hidden relative">
      <FileSystemEditor />
      
      {/* Realtime Cursors - Only show if we have both projectId and user */}
      {projectId && user && (
        <RealtimeCursors 
          roomName={`project-${projectId}`}
          username={user.full_name || user.username}
          throttleMs={50}
          staleTimeout={5000}
        />
      )}
      
      {showTerminal && (
        <div className="absolute bottom-4 left-4 right-4 h-60 z-20">
          <div className="h-full rounded-md overflow-hidden border border-gray-700 bg-[#1e1e1e]">
            <Terminal 
              projectId={projectId || 'default-project'} 
              onClose={onTerminalClose} 
            />
          </div>
        </div>
      )}
      
      {showCollaborators && collaboratorsComponent}
    </div>
  );
}
