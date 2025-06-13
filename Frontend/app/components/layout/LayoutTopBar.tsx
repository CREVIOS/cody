import Topbar from "@/components/Topbar";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { Theme } from "@/context/ThemeContext";

interface LayoutTopBarProps {
  currentProjectName: string;
  isEditingName: boolean;
  setIsEditingName: (value: boolean) => void;
  onNameChange: (value: string) => void;
  onNameSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  projectNameInputRef: React.RefObject<HTMLInputElement | null>;
  onHome: () => void;
  canEditName: boolean;
  canInviteUsers: boolean;
  onInviteClick: () => void;
  pendingInvitationsCount: number;
  theme: Theme;
  user?: User;
  onNewProject: () => void;
  language: string;
  setLanguage: (language: string) => void;
  borderClass: string;
  onCollaboratorsClick: () => void;
}

export function LayoutTopBar({ 
  currentProjectName, 
  isEditingName, 
  setIsEditingName, 
  onNameChange, 
  onNameSubmit, 
  onKeyDown, 
  projectNameInputRef, 
  onHome, 
  canEditName, 
  canInviteUsers, 
  onInviteClick, 
  pendingInvitationsCount, 
  theme, 
  user, 
  onNewProject, 
  language, 
  setLanguage, 
  borderClass,
  onCollaboratorsClick
}: LayoutTopBarProps) {
  return (
    <div className={`col-span-1 flex items-center justify-between border-b px-6 ${borderClass}`}>
      <Topbar
        projectName={currentProjectName}
        isEditingName={isEditingName}
        setIsEditingName={(value) => {
          if (value && !canEditName) {
            return;
          }
          setIsEditingName(value);
        }}
        onNameChange={(value) => {
          if (canEditName) {
            onNameChange(value);
          }
        }}
        onNameSubmit={onNameSubmit}
        onKeyDown={onKeyDown}
        inputRef={projectNameInputRef}
        onHome={onHome}
        canEditName={canEditName}
        canInviteUsers={canInviteUsers}
        onInviteClick={() => canInviteUsers && onInviteClick()}
        pendingInvitationsCount={pendingInvitationsCount}
        theme={theme}
        user={user}
        onNewProject={onNewProject}
        language={language}
        setLanguage={setLanguage}
        onCollaboratorsClick={onCollaboratorsClick}
      />
    </div>
  );
}

