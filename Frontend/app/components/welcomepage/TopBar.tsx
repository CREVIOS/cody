interface TopBarProps {
    children: React.ReactNode;
    borderClass: string;
  }
  
export function TopBar({ children, borderClass }: TopBarProps) {
    return (
      <div className={`flex justify-between p-6 relative ${borderClass}`}>
        {children}
      </div>
    );
}
  
  