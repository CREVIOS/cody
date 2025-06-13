interface WelcomeSectionProps {
    username: string;
    theme: string;
    onNewProject: () => void;
    buttonClass: string;
  }
  
export function WelcomeSection({ username, theme, onNewProject, buttonClass }: WelcomeSectionProps) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center md:items-start text-center md:text-left min-w-0">
        <h1 className={`text-5xl md:text-7xl font-bold mb-4 md:mb-8 transition-colors leading-tight break-words w-full ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
          Welcome back,
        </h1>
        <h1 className={`text-3xl md:text-5xl font-bold mb-6 md:mb-8 transition-colors leading-tight break-words w-full ${theme === "dark" ? "text-[#E0E0E0]" : "text-[#2D2D2D]"}`} style={{ textShadow: theme === "dark" ? "0 0 15px rgba(139, 92, 246, 0.8), 0 0 30px rgba(139, 92, 246, 0.4)" : "0 0 15px rgba(232, 232, 239, 0.6), 0 0 30px rgba(228, 227, 237, 0.3)" }}>
          {username}
        </h1>
        <button onClick={onNewProject} className={`mt-2 md:mt-4 px-4 md:px-6 py-3 md:py-4 ${buttonClass} rounded-xl hover:shadow-lg transition-all w-full md:w-fit text-base md:text-sm font-medium flex items-center justify-center gap-2`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create New Project
        </button>
      </div>
    );
  }