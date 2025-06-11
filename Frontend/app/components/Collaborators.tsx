"use client";
import { useTheme } from "@/context/ThemeContext";
import { ProjectMemberWithDetails } from "@/lib/projectApi";

interface CollaboratorsProps {
  members: ProjectMemberWithDetails[];
  loading?: boolean;
  error?: string | null;
}

export default function Collaborators({ members, loading, error }: CollaboratorsProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  // Get initials from name
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  };

  // Simple online/offline status simulation based on last activity
  // In a real application, this would be managed by websockets or periodic API calls
  const getOnlineStatus = (member: ProjectMemberWithDetails): boolean => {
    if (!member.last_activity) return false;
    
    // Consider user online if last activity was within 5 minutes
    const lastActivity = new Date(member.last_activity);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return lastActivity > fiveMinutesAgo;
  };

  // Filter online members for count
  const onlineMembers = members.filter(member => getOnlineStatus(member));

  if (loading) {
    return (
      <div className="relative z-10">
        <div className={`mb-2 text-sm ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
          Loading collaborators...
        </div>
        <div className="mt-2 max-h-[240px] overflow-y-auto pr-1">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="flex items-center py-2.5 animate-pulse">
              <div className={`w-9 h-9 rounded-full mr-3 ${isDark ? "bg-[#4D4D7F]/50" : "bg-[#A78BFA]/50"}`}></div>
              <div className="flex-grow">
                <div className={`h-4 rounded mb-1 ${isDark ? "bg-[#4D4D7F]/50" : "bg-gray-300"} w-20`}></div>
                <div className={`h-3 rounded ${isDark ? "bg-[#4D4D7F]/30" : "bg-gray-200"} w-16`}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative z-10">
        <div className={`mb-2 text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>
          Error loading collaborators
        </div>
        <div className={`text-xs ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-10">
      {/* Online count indicator */}
      <div className={`mb-2 text-sm ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
        <span className="font-medium">{onlineMembers.length}</span> users online
      </div>
      
      {/* Collaborators list - showing all users with their status */}
      <div className="mt-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-transparent">
        {members.length > 0 ? (
          members.map((member) => {
            const isOnline = getOnlineStatus(member);
            const displayName = member.user.full_name || member.user.username;
            
            return (
              <div 
                key={member.project_member_id}
                className={`flex items-center py-2.5 ${
                  members.indexOf(member) !== members.length - 1 && (
                    isDark 
                      ? "border-b border-white/10"
                      : "border-b border-black/10"
                  )
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center mr-3 text-white font-bold text-sm ${
                    isDark ? "bg-[#4D4D7F]" : "bg-[#A78BFA]"
                  }`}
                >
                  {getInitials(displayName)}
                </div>
                <div className="flex-grow">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className={`text-xs mb-1 ${
                    isDark ? "text-[#A0A0A0]" : "text-[#666666]"
                  }`}>
                    Role: {member.role.role_name}
                  </div>
                  <div className={`text-xs flex items-center ${
                    isDark ? "text-[#A0A0A0]" : "text-[#666666]"
                  }`}>
                    <span 
                      className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                        isOnline ? "bg-green-500" : "bg-gray-500"
                      }`}
                    ></span>
                    {isOnline ? "Online" : "Offline"}
                  </div>
                </div>
                <button className={`border-none bg-transparent cursor-pointer opacity-70 ${
                  isDark ? "text-[#E0E0E0]" : "text-[#2D2D2D]"
                }`}>
                  •••
                </button>
              </div>
            );
          })
        ) : (
          <div className={`py-4 text-center text-sm ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
            No collaborators found
          </div>
        )}
      </div>
    </div>
  );
}