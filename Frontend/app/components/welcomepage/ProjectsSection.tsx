interface ProjectsSectionProps {
    children: React.ReactNode;
    theme: string;
  }
  
export function ProjectsSection({ children, theme }: ProjectsSectionProps) {
    return (
      <div className="flex-1 flex flex-col w-full min-w-0 mt-8 md:mt-0">
        <h1 className="text-xl md:text-2xl font-semibold mb-3 mx-auto md:mx-0" style={{ textShadow: theme === "dark" ? "0 0 10px rgba(139, 92, 246, 0.8), 0 0 20px rgba(139, 92, 246, 0.4)" : "0 0 10px rgba(240, 239, 248, 0.6), 0 0 20px rgba(241, 240, 245, 0.3)" }}>
          Your Projects
        </h1>
        {children}
      </div>
    );
  }