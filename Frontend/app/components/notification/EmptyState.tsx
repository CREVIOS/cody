import { Users } from "lucide-react";

interface EmptyStateProps {
    theme: string;
  }
  
export function EmptyState({ theme }: EmptyStateProps) {
    return (
      <div className="p-8 text-center">
        <Users className={`w-12 h-12 mx-auto mb-3 
          ${theme === "dark" ? "text-gray-600" : "text-gray-400"}`} />
        <p className={`text-sm 
          ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          No new invitations
        </p>
      </div>
    );
  }