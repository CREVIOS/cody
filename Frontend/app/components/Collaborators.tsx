"use client";
import { useTheme } from "@/context/ThemeContext";

export default function Collaborators() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  // Get initials from name
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // All collaborators with status represented as a bitmask (1=online, 0=offline)
  const collaboratorsData = [
    { name: "Asif", status: 1 },
    { name: "tazkia", status: 1 },
    { name: "tanzila", status: 0 },
    { name: "taif", status: 0 },
    { name: "Ahmed", status: 1 },
    { name: "Sakib", status: 1 },
    { name: "Farida", status: 1 },
    { name: "Rahim", status: 1 }
  ];

  // Filter to show only online collaborators (status = 1)
  const onlineCollaborators = collaboratorsData.filter(person => person.status === 1);

  return (
    <div className="relative z-10">
      {/* Online count indicator */}
      <div className={`mb-2 text-sm ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
        <span className="font-medium">{onlineCollaborators.length}</span> users online
      </div>
      
      {/* Collaborators list - only showing online users, with scrolling if more than 4 */}
      <div className="mt-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-transparent">
        {onlineCollaborators.length > 0 ? (
          onlineCollaborators.map((person, index) => (
            <div 
              key={index}
              className={`flex items-center py-2.5 ${
                index !== onlineCollaborators.length - 1 && (
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
                {getInitials(person.name)}
              </div>
              <div className="flex-grow">
                <div className="text-sm font-medium">{person.name}</div>
                <div className={`text-xs flex items-center ${
                  isDark ? "text-[#A0A0A0]" : "text-[#666666]"
                }`}>
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5 bg-green-500"></span>
                  Online
                </div>
              </div>
              <button className={`border-none bg-transparent cursor-pointer opacity-70 ${
                isDark ? "text-[#E0E0E0]" : "text-[#2D2D2D]"
              }`}>
                •••
              </button>
            </div>
          ))
        ) : (
          <div className={`py-4 text-center text-sm ${isDark ? "text-[#A0A0A0]" : "text-[#666666]"}`}>
            No users online
          </div>
        )}
      </div>
      
      
    </div>
  );
}