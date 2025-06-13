import { Bell } from "lucide-react";

interface NotificationButtonProps {
  invitationCount: number;
  loadingInvitations: boolean;
  theme: string;
  onNotificationClick: () => void;
}

export function NotificationButton({ 
  invitationCount, 
  loadingInvitations, 
  theme, 
  onNotificationClick 
}: NotificationButtonProps) {
  return (
    <button
      onClick={onNotificationClick}
      className={`w-10 h-10 rounded-full flex items-center justify-center ${theme === "dark" ? "hover:bg-[#3A3A3E]" : "hover:bg-gray-200"} transition-colors group relative`}
      title="Notifications"
    >
      <Bell className="w-5 h-5" />
      
      {/* Notification badge - only show if there are invitations */}
      {invitationCount > 0 && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full flex items-center justify-center">
          <span className="text-[10px] text-white font-bold">
            {invitationCount > 99 ? '99+' : invitationCount}
          </span>
        </div>
      )}

      {/* Loading indicator for invitations */}
      {loadingInvitations && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-gray-400 rounded-full flex items-center justify-center">
          <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 rounded bg-black/80 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        Notifications{invitationCount > 0 ? ` (${invitationCount})` : ''}
      </div>
    </button>
  );
}