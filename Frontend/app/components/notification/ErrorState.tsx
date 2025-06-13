import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
  theme: string;
}

export function ErrorState({ error, onRetry, theme }: ErrorStateProps) {
  return (
    <div className="p-8 flex flex-col items-center">
      <AlertCircle className={`w-8 h-8 mb-3
        ${theme === "dark" ? "text-red-400" : "text-red-600"}`} />
      <p className={`text-sm text-center
        ${theme === "dark" ? "text-red-400" : "text-red-600"}`}>
        {error}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className={`mt-3 px-3 py-1.5 rounded-md text-sm font-medium
            ${theme === "dark"
              ? "bg-indigo-600 hover:bg-indigo-700 text-white"
              : "bg-indigo-600 hover:bg-indigo-700 text-white"
            }`}
        >
          Retry
        </button>
      )}
    </div>
  );
}
