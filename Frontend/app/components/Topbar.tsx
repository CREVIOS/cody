"use client";
import { useTheme } from "@/context/ThemeContext";

const languages = [
  { label: "JavaScript", value: "javascript" },
  { label: "Python", value: "python" },
  { label: "C++", value: "cpp" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "JSON", value: "json" },
  { label: "Markdown", value: "markdown" },
  { label: "Java", value: "java" },
];

interface TopbarProps {
  language: string;
  setLanguage: (lang: string) => void;
  onCollaboratorsClick: () => void;
}

export default function Topbar({ language, setLanguage, onCollaboratorsClick }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  
  // Updated button colors for professional themes
  const runButtonClass = isDark
    ? "bg-[#4D4D7F] hover:bg-[#3F3F6A] text-white"  // Matte dark blue for dark mode
    : "bg-[#A78BFA] hover:bg-[#8B5CF6] text-white"; // Lavender for light mode
    
  const selectClass = isDark
    ? "bg-[#212124] text-[#E0E0E0] border border-[#2A2A2E]"
    : "bg-[#F0F0F0] text-[#2D2D2D] border border-[#D1D1CC]";
    
  const themeToggleClass = isDark
    ? "bg-[#2A2A2E]" 
    : "bg-[#D1D1CC]";
    
  const thumbClass = isDark
    ? "translate-x-7 bg-[#4A6B82] text-white"
    : "translate-x-1 bg-white text-[#AD6800]";

  return (
    <div className="w-full flex items-center justify-between">
      {/* Left: Run + Language */}
      <div className="flex items-center space-x-4">
        <button className={`px-4 py-2 rounded ${runButtonClass}`}>
          Run
        </button>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={`p-2 rounded text-sm ${selectClass}`}
        >
          {languages.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      {/* Right: Theme Toggle + Collaborators */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="text-sm">{isDark ? "Dark" : "Light"} Mode</span>
          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 ${themeToggleClass}`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full shadow-lg transform transition-transform duration-300 flex items-center justify-center text-sm ${thumbClass}`}
            >
              {isDark ? "🌙" : "☀️"}
            </span>
          </button>
        </div>
        
        <button
          onClick={onCollaboratorsClick}
          className={`px-4 py-2 ${runButtonClass} rounded`}
        >
          Collaborators
        </button>
      </div>
    </div>
  );
}