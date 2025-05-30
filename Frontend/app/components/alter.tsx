"use client";
import { useTheme } from "@/context/ThemeContext";


export default function Collaborators() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  
  // Get initials from name
  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  // Your existing collaborators with status represented as a bitmask (1=online, 0=offline)
  const collaboratorsData = [
    { name: "Asif", status: 1 },
    { name: "tazkia", status: 1 },
    { name: "tanzila", status: 0 },
    { name: "taif", status: 0 },
    { name: "Ahmed", status: 1 },
    { name: "Sakib", status: 0 }
  ];

  // Filter to show only online collaborators (status = 1)
  const onlineCollaborators = collaboratorsData.filter(person => person.status === 1);

  return (
    <div className="relative z-10">
      {/* Collaborators list - fixed height with scrolling */}
      <div className="mt-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-rounded-full scrollbar-track-transparent">
        {collaboratorsData.map((person, index) => (
          <div 
            key={index}
            className={`flex items-center py-2.5 ${
              index !== collaboratorsData.length - 1 && (
                isDark 
                  ? "border-b border-white/10"
                  : "border-b border-black/10"
              )
            }`}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center mr-3 text-white font-bold text-sm ${
                person.status === 1
                  ? (isDark ? "bg-[#4D4D7F]" : "bg-[#A78BFA]")
                  : (isDark ? "bg-[#3A3A3D]" : "bg-[#D1D1CC]")
              }`}
            >
              {getInitials(person.name)}
            </div>
            <div className="flex-grow">
              <div className="text-sm font-medium">{person.name}</div>
              <div className={`text-xs flex items-center ${
                isDark ? "text-[#A0A0A0]" : "text-[#666666]"
              }`}>
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-1.5 ${
                    person.status === 1 ? "bg-green-500" : "bg-gray-400"
                  }`}
                ></span>
                {person.status === 1 ? 'Online' : 'Offline'}
              </div>
            </div>
            <button className={`border-none bg-transparent cursor-pointer opacity-70 ${
              isDark ? "text-[#E0E0E0]" : "text-[#2D2D2D]"
            }`}>
              •••
            </button>
          </div>
        ))}
      </div>
      
      {/* Online status summary */}
      <div className={`mt-3 mb-1 py-2 px-3 rounded-md ${
        isDark ? "bg-white/5" : "bg-black/5"
      }`}>
        <div className="text-xs font-medium">Online Users ({onlineCollaborators.length})</div>
        <div className="text-xs mt-1 flex flex-wrap gap-1">
          {onlineCollaborators.length > 0 ? (
            onlineCollaborators.map((person, idx) => (
              <span 
                key={idx}
                className={`inline-block py-0.5 px-1.5 rounded-full text-xs ${
                  isDark ? "bg-green-900/30 text-green-200" : "bg-green-100 text-green-800"
                }`}
              >
                {person.name}
              </span>
            ))
          ) : (
            <span className="text-xs opacity-60">No users online</span>
          )}
        </div>
      </div>
      
      {/* Add button */}
      <button 
        className={`w-full py-2.5 px-0 mt-4 bg-transparent rounded-lg cursor-pointer flex items-center justify-center text-sm ${
          isDark
            ? "border border-dashed border-white/30 text-[#A0A0A0]"
            : "border border-dashed border-black/30 text-[#666666]"
        }`}
      >
        + Add Collaborator
      </button>
    </div>
  );
}