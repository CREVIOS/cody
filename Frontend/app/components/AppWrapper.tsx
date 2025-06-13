import { useState } from "react";
import UserSelection from "@/components/UserSelection";
import EntryPage from "@/components/welcomepage/EntryPage";
import { User } from "@/lib/projectAPI/TypeDefinitions";

interface AppWrapperProps {
  onNewProject: () => void;
  onOpenProject: (projectId: string, projectName?: string) => void;
  onSelectUser: (user: User) => void;
}

export default function AppWrapper({ onNewProject, onOpenProject, onSelectUser }: AppWrapperProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    onSelectUser(user);
  };

  // Add a button to change user in the EntryPage if needed
  const handleChangeUser = () => {
    setSelectedUser(null);
  };

  if (!selectedUser) {
    return <UserSelection onSelectUser={handleSelectUser} />;
  }

  return (
    <>
      <EntryPage
        user={selectedUser}
        onNewProject={onNewProject}
        onOpenProject={onOpenProject}
      />
      {/* Optional: Add a floating button to change user */}
      <button
        onClick={handleChangeUser}
        className="fixed bottom-8 left-8 bg-gray-800 text-white p-3 rounded-full shadow-lg hover:bg-gray-700 transition-colors z-50"
        title="Change User"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </button>
    </>
  );
}