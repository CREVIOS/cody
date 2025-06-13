import { AlertCircle } from "lucide-react";
import { Theme } from "@/context/ThemeContext";

interface ErrorDisplayProps {
  error: string;
  theme: Theme;
}

export function ErrorDisplay({ error, theme }: ErrorDisplayProps) {
  return (
    <div className={`flex items-center gap-2 p-3 rounded-md text-sm
      ${theme === "dark"
        ? "bg-red-500/20 text-red-300"
        : "bg-red-50 text-red-700"
      }`}>
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>{error}</span>
    </div>
  );
}
