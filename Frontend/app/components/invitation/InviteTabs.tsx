import { Mail, Clock } from "lucide-react";
import { Theme } from "@/context/ThemeContext";

interface InviteTabsProps {
  activeTab: "invite" | "pending";
  onTabChange: (tab: "invite" | "pending") => void;
  theme: Theme;
}

export function InviteTabs({ activeTab, onTabChange, theme }: InviteTabsProps) {
  const tabButtonClass = (isActive: boolean) => `
    px-4 py-2 text-sm font-medium rounded-lg transition-colors
    ${isActive
      ? theme === "dark"
        ? "bg-indigo-600 text-white"
        : "bg-indigo-600 text-white"
      : theme === "dark"
        ? "text-gray-400 hover:text-white hover:bg-[#3A3A3E]"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
    }
  `;

  return (
    <div className={`flex gap-2 p-4 border-b ${theme === "dark" ? "border-[#3A3A3E]" : "border-gray-200"}`}>
      <button
        onClick={() => onTabChange("invite")}
        className={tabButtonClass(activeTab === "invite")}
      >
        <Mail className="w-4 h-4 inline mr-1" />
        Invite
      </button>
      <button
        onClick={() => onTabChange("pending")}
        className={tabButtonClass(activeTab === "pending")}
      >
        <Clock className="w-4 h-4 inline mr-1" />
        Pending
      </button>
    </div>
  );
}
