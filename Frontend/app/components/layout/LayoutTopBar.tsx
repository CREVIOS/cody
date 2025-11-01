import Topbar from "@/components/Topbar";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { Theme } from "@/context/ThemeContext";

interface LayoutTopBarProps {
  currentProjectName: string;
  projectId?: string;
  theme: Theme;
  onCollaboratorsClick: () => void;
  onTerminalClick: () => void;
}

export function LayoutTopBar({ 
  currentProjectName, 
  projectId,
  theme, 
  onCollaboratorsClick,
  onTerminalClick
}: LayoutTopBarProps) {
  return (
    <div className="col-span-1 flex items-center justify-between border-b px-6 border-gray-200 dark:border-gray-700">
      <Topbar
        projectName={currentProjectName}
        projectId={projectId}
        theme={theme}
        onCollaboratorsClick={onCollaboratorsClick}
        onTerminalClick={onTerminalClick}
      />
    </div>
  );
}

