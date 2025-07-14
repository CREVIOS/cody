import Topbar from "@/components/Topbar";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { Theme } from "@/context/ThemeContext";

interface LayoutTopBarProps {
  currentProjectName: string;
  projectId?: string;
  theme: Theme;
  onCollaboratorsClick: () => void;
}

export function LayoutTopBar({ 
  currentProjectName, 
  projectId,
  theme, 
  onCollaboratorsClick
}: LayoutTopBarProps) {
  return (
    <div className="col-span-1 flex items-center justify-between border-b px-6 border-gray-200 dark:border-gray-700">
      <Topbar
        projectName={currentProjectName}
        projectId={projectId}
        theme={theme}
        onCollaboratorsClick={onCollaboratorsClick}
      />
    </div>
  );
}

