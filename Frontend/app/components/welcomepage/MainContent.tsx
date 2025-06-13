interface MainContentProps {
    children: React.ReactNode;
  }
  
export function MainContent({ children }: MainContentProps) {
    return (
      <div className="flex flex-1 flex-col md:flex-row px-4 md:px-8 py-8 gap-8 md:gap-12 w-full">
        {children}
      </div>
    );
  }
  