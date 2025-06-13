import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  theme: string;
}

export function LoadingState({ theme }: LoadingStateProps) {
  return (
    <div className="p-8 flex flex-col items-center">
      <Loader2 className={`w-8 h-8 animate-spin mb-3
        ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`} />
      <p className={`text-sm 
        ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
        Loading invitations...
      </p>
    </div>
  );
}
