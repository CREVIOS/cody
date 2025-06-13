import { X } from "lucide-react";
import { Theme } from "@/context/ThemeContext";

interface ModalHeaderProps {
  onClose: () => void;
  theme: Theme;
}

export function ModalHeader({ onClose, theme }: ModalHeaderProps) {
  return (
    <div className={`flex items-center justify-between p-4 border-b ${
      theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"
    }`}>
      <h2 className={`text-lg font-semibold ${
        theme === "dark" ? "text-white" : "text-gray-900"
      }`}>
        Invite to Project
      </h2>
      <button
        onClick={onClose}
        className={`p-1 rounded-md hover:bg-opacity-10 ${
          theme === "dark"
            ? "text-gray-400 hover:text-white hover:bg-white"
            : "text-gray-500 hover:text-gray-900 hover:bg-gray-900"
        }`}
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}