import { useState, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { User } from "@/lib/projectAPI/TypeDefinitions";
import { listUsers } from "@/lib/projectAPI/UserAPI";
import { Skeleton } from "@/components/ui/skeleton";
import { setDemoUserId } from "@/hooks/useActiveUserId";
import { ThemeToggle } from "@/components/welcomepage/ThemeToggle";

interface UserSelectionProps {
  onSelectUser: (user: User) => void;
}

export default function UserSelection({ onSelectUser }: UserSelectionProps) {
  const { theme, toggleTheme } = useTheme();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAboutModal, setShowAboutModal] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setLoading(true);
        const userList = await listUsers();
        setUsers(userList);
      } catch (err) {
        console.error('Failed to load users:', err);
        const errorMessage = err instanceof Error 
          ? err.message 
          : 'Failed to load users';
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };
    loadUsers();
  }, []);

  const backgroundClass = theme === "dark" 
    ? "bg-[#212124] text-[#E0E0E0]" 
    : "bg-[#F5F5F0] text-[#2D2D2D]";

  const cardClass = theme === "dark"
    ? "bg-[#2A2A2E] hover:bg-[#3A3A3E] border-[#3A3A3E]"
    : "bg-white hover:bg-gray-50 border-gray-200";

  const titleShadow = theme === "dark"
    ? "0 0 30px rgba(139, 92, 246, 0.8), 0 0 60px rgba(139, 92, 246, 0.4)"
    : "none";

  const subtitleShadow = theme === "dark"
    ? "0 0 20px rgba(139, 92, 246, 0.6), 0 0 40px rgba(139, 92, 246, 0.3)"
    : "none";

  const handleSelectUserDemo = (user: User) => {
    setDemoUserId(user.user_id);
    onSelectUser(user);
  };

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-8 relative ${backgroundClass}`}>
      {/* Theme Toggle - Top Left */}
      <div className="absolute top-8 left-8">
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      {/* App Name */}
      <div className="text-center mb-12">
        <div className="mb-6 flex justify-center">
          <img 
            src="/logo.png" 
            alt="CodeCollab Platform Logo" 
            className="h-40 md:h-56 w-auto object-contain"
          />
        </div>
        <h1 
          className="text-5xl md:text-6xl font-bold mb-4"
          style={{ textShadow: titleShadow }}
        >
          CodeCollab Platform
        </h1>
        <h2 
          className="text-3xl md:text-4xl font-semibold text-indigo-400"
          style={{ textShadow: subtitleShadow }}
        >
          (Cody)
        </h2>
      </div>
      
      {/* Auth Links */}
      <div className="mb-12 flex gap-6">
        <a
          href="/auth/login"
          className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105"
        >
          Log In
        </a>
        <a
          href="/auth/signup"
          className="px-8 py-3 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 transition-all duration-300 font-semibold text-lg shadow-lg hover:shadow-xl hover:scale-105"
        >
          Sign Up
        </a>
      </div>

      {/* About Button - Bottom Corner */}
      <button
        onClick={() => setShowAboutModal(true)}
        className={`absolute bottom-8 right-8 px-6 py-3 rounded-lg font-medium transition-all duration-300 hover:scale-105 ${
          theme === "dark" 
            ? "bg-[#2A2A2E] hover:bg-[#3A3A3E] text-[#E0E0E0] border border-[#3A3A3E]" 
            : "bg-white hover:bg-gray-50 text-[#2D2D2D] border border-gray-200 shadow-md"
        }`}
      >
        About
      </button>

      {/* About Modal */}
      {showAboutModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowAboutModal(false)}
        >
          <div 
            className={`w-full max-w-2xl mx-4 rounded-2xl shadow-2xl p-8 relative max-h-[90vh] overflow-y-auto ${
              theme === "dark" ? "bg-[#2A2A2E] text-[#E0E0E0]" : "bg-white text-[#2D2D2D]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowAboutModal(false)}
              className={`absolute top-4 right-4 text-2xl font-bold transition-colors ${
                theme === "dark" ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"
              }`}
              aria-label="Close"
            >
              ×
            </button>
            
            <div className="space-y-6">
              <h2 className="text-3xl font-bold mb-6 text-center">About CodeCollab Platform</h2>
              <section>
                <p className={`leading-relaxed ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  Welcome to <strong>CodeCollab Platform</strong> (also known as <strong>Cody</strong>), 
                  a powerful collaborative coding environment designed for teams to work together seamlessly. 
                  Experience real-time collaborative code editing with live cursors, 
                  integrated file system management, project-based organization with role-based access control, 
                  and terminal integration for seamless development workflow.
                </p>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-3 text-indigo-400">Getting Started</h3>
                <div className={`space-y-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  <p><strong>1. Sign Up:</strong> Create a new account to get started with your coding journey.</p>
                  <p><strong>2. Log In:</strong> Access your existing account to continue your work.</p>
                  <p><strong>3. Create Projects:</strong> Start by creating a new project or opening an existing one.</p>
                  <p><strong>4. Collaborate:</strong> Invite team members and start coding together in real-time.</p>
                  <p><strong>5. Manage Files:</strong> Use the integrated file system to organize your codebase.</p>
                </div>
              </section>

              <section>
                <h3 className="text-xl font-semibold mb-3 text-indigo-400">Developers</h3>
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}>
                  <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-[#3A3A3E]" : "bg-gray-50"}`}>
                    <p className="font-semibold text-indigo-400">Tazkia Malik</p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-[#3A3A3E]" : "bg-gray-50"}`}>
                    <p className="font-semibold text-indigo-400">Sadek Hossain Asif</p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-[#3A3A3E]" : "bg-gray-50"}`}>
                    <p className="font-semibold text-indigo-400">Tanzila Khan</p>
                  </div>
                  <div className={`p-4 rounded-lg ${theme === "dark" ? "bg-[#3A3A3E]" : "bg-gray-50"}`}>
                    <p className="font-semibold text-indigo-400">Taif Ahmed</p>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}