"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import EntryPage from "@/components/welcomepage/EntryPage";
import Layout from "@/components/layout/Layout";
import AppWrapper from "@/components/AppWrapper";
import { User, Project } from '@/lib/projectAPI/TypeDefinitions';
import { getProjects } from "@/lib/projectAPI/ProjectAPI";
import { getUserWithRetry } from "@/lib/projectAPI/UserAPI";
import { useAuth } from "@/context/AuthContext";
import { useActiveUserId, clearDemoMode } from "@/hooks/useActiveUserId";

// This is the navigation controller component that handles the routing
export default function Home() {
  const { isAuthenticated, userId: authUserId, loading: authLoading, signOut, user: authUser } = useAuth();
  const activeUserId = useActiveUserId();
  const router = useRouter();
  const [currentView, setCurrentView] = useState("userSelection");
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Local storage keys
  const SELECTED_USER_KEY = "app-selected-user";
  const CURRENT_VIEW_KEY = "app-current-view";
  const CURRENT_PROJECT_ID_KEY = "app-current-project-id";
  const CURRENT_PROJECT_NAME_KEY = "app-current-project-name";

  // Handle Supabase Auth errors from URL parameters
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    const errorDescription = urlParams.get("error_description");
    
    if (error) {
      let errorMessage = "Authentication error occurred.";
      
      if (error === "otp_expired") {
        errorMessage = "The email verification link has expired. Please request a new one or sign in with your password.";
      } else if (errorDescription) {
        errorMessage = decodeURIComponent(errorDescription.replace(/\+/g, " "));
      }
      
      setAuthError(errorMessage);
      
      // Clear error from URL after displaying
      urlParams.delete("error");
      urlParams.delete("error_code");
      urlParams.delete("error_description");
      const newUrl = urlParams.toString() ? `/?${urlParams.toString()}` : "/";
      router.replace(newUrl);
    }
  }, [router]);

  // Rehydrate state from localStorage and handle auth/demo mode
  useEffect(() => {
    const initializeApp = async () => {
      // Wait for auth to initialize before proceeding
      if (authLoading) return;

      try {
        const storedUser = localStorage.getItem(SELECTED_USER_KEY);
        const storedView = localStorage.getItem(CURRENT_VIEW_KEY);
        const storedProjectId = localStorage.getItem(CURRENT_PROJECT_ID_KEY);
        const storedProjectName = localStorage.getItem(CURRENT_PROJECT_NAME_KEY);

        // AUTH MODE: If authenticated, fetch user from public.users using auth userId
        // Frontend calls backend sync endpoint after signup/login
        if (isAuthenticated && authUserId) {
          try {
            // getUserWithRetry handles sync timing - retries if user not synced yet
            const user = await getUserWithRetry(authUserId);
            setSelectedUser(user);
            // Clear demo mode when auth is active
            clearDemoMode();
            // Clear stored view for authenticated users - always go to entry page
            localStorage.removeItem(CURRENT_VIEW_KEY);
            // Automatically go to entry page after loading user (same as demo mode)
            setCurrentView("entry");
          } catch (error) {
            console.error("Error fetching authenticated user after retry:", error);
            // If user still doesn't exist, sync might be in progress
            // Wait a bit more and try once more
            try {
              await new Promise(resolve => setTimeout(resolve, 1500));
              const user = await getUserWithRetry(authUserId);
              setSelectedUser(user);
              clearDemoMode();
              // Clear stored view and go to entry page
              localStorage.removeItem(CURRENT_VIEW_KEY);
              setCurrentView("entry");
            } catch (retryError) {
              console.error("User still not found after retry:", retryError);
              // Fall back to stored user or show user selection
              if (storedUser) {
                const parsedUser: User = JSON.parse(storedUser);
                setSelectedUser(parsedUser);
                setCurrentView("entry");
              }
            }
          }
        } else if (storedUser) {
          // Use stored user (demo mode)
          const parsedUser: User = JSON.parse(storedUser);
          setSelectedUser(parsedUser);
          // For demo mode, use stored view if available
          if (storedView) {
            setCurrentView(storedView);
          } else {
            // If no stored view, go to entry page (same as when selecting a user)
            setCurrentView("entry");
          }
        } else if (storedView) {
          // If no user but there's a stored view, use it (shouldn't happen normally)
          setCurrentView(storedView);
        }

        if (storedProjectId) {
          setProjectId(storedProjectId);
        }
        if (storedProjectName) {
          setProjectName(storedProjectName);
        }
      } catch (e) {
        // If parsing fails, clear invalid data
        localStorage.removeItem(SELECTED_USER_KEY);
        localStorage.removeItem(CURRENT_VIEW_KEY);
        localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
        localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
      } finally {
        setHydrated(true);
      }
    };

    initializeApp();
  }, [isAuthenticated, authUserId, authLoading]);

  // Persist selected user
  useEffect(() => {
    if (!hydrated) return;
    if (selectedUser) {
      localStorage.setItem(SELECTED_USER_KEY, JSON.stringify(selectedUser));
    } else {
      localStorage.removeItem(SELECTED_USER_KEY);
    }
  }, [selectedUser, hydrated]);

  // Persist current view
  useEffect(() => {
    if (!hydrated) return;
    if (currentView) {
      localStorage.setItem(CURRENT_VIEW_KEY, currentView);
    }
  }, [currentView, hydrated]);

  // Persist project context when on layout
  useEffect(() => {
    if (!hydrated) return;
    if (currentView === "layout") {
      if (projectId) localStorage.setItem(CURRENT_PROJECT_ID_KEY, projectId);
      if (projectName) localStorage.setItem(CURRENT_PROJECT_NAME_KEY, projectName);
    } else {
      localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
      localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
    }
  }, [currentView, projectId, projectName, hydrated]);

  // Navigation handlers
  const goToEntry = () => {
    if (selectedUser) {
      setCurrentView("entry");
    } else {
      setCurrentView("userSelection");
    }
  };
  
  const goToLayout = (name: string, id?: string) => {
    setProjectName(name);
    if (id) setProjectId(id);
    setCurrentView("layout");
  };

  // Handler for opening an existing project
  const handleOpenProject = async (projectId: string, projectName?: string) => {
    if (!selectedUser) return;
    
    // If we have the project name, use it directly
    if (projectName) {
      goToLayout(projectName.trim() || "Untitled Project", projectId);
      return;
    }

    // Otherwise fetch the project details
    try {
      const projectsData = await getProjects(0, 100, selectedUser.user_id);
      const found = projectsData.find((p: Project) => p.project_id === projectId);
      if (!found) {
        console.warn('Project not found in user projects:', projectId);
        goToLayout("Untitled Project", projectId);
        return;
      }
      
      // Ensure we have a valid project name
      const name = found.project_name?.trim();
      if (!name) {
        console.warn('Project name is empty for project:', projectId);
        goToLayout("Untitled Project", projectId);
        return;
      }
      
      goToLayout(name, projectId);
    } catch (e) {
      console.error('Error fetching project:', e);
      goToLayout("Untitled Project", projectId);
    }
  };

  // Handler for creating a new project
  const handleNewProject = () => {
    // Instead of going to the simple prompt, we'll handle this in the EntryPage
    // which has the proper ProjectCreateModal
    goToEntry();
  };

  // Handler for user selection
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setCurrentView("entry");
  };

  // Handler for logout
  const handleLogout = async () => {
    // Sign out from Supabase if authenticated
    if (isAuthenticated) {
      try {
        await signOut();
      } catch (error) {
        console.error("Error signing out:", error);
      }
    }
    
    // Clear demo mode
    clearDemoMode();
    
    setSelectedUser(null);
    setCurrentView("userSelection");
    // Clear persisted state
    localStorage.removeItem(SELECTED_USER_KEY);
    localStorage.removeItem(CURRENT_VIEW_KEY);
    localStorage.removeItem(CURRENT_PROJECT_ID_KEY);
    localStorage.removeItem(CURRENT_PROJECT_NAME_KEY);
  };

  // Avoid flicker/mismatch before hydration
  if (!hydrated) {
    return null;
  }

  // Show auth error if present
  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-[#212124] text-[#E0E0E0]">
        <div className="w-full max-w-md p-8 rounded-xl border shadow-lg bg-[#2A2A2E] border-[#3A3A3E]">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Authentication Error</h2>
          <p className="mb-6 text-gray-300">{authError}</p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setAuthError(null);
                router.push("/auth/login");
              }}
              className="flex-1 py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-semibold"
            >
              Go to Login
            </button>
            <button
              onClick={() => {
                setAuthError(null);
                router.push("/");
              }}
              className="flex-1 py-2 px-4 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors font-semibold"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render the appropriate component based on currentView
  if (currentView === "userSelection" || !selectedUser) {
    return <AppWrapper onOpenProject={handleOpenProject} onSelectUser={handleSelectUser} onLogout={handleLogout} />;
  }

  // Remove the old ProjectPrompt flow since we're using ProjectCreateModal now
  // if (currentView === "prompt") {
  //   return (
  //     <ProjectPrompt 
  //       onCancel={goToEntry} 
  //       onSubmit={(name) => goToLayout(name)} 
  //     />
  //   );
  // }
  
  if (currentView === "layout") {
    return (
      <Layout 
        projectName={projectName}
        projectId={projectId}
        onHome={goToEntry}
        onTerminalClick={() => {}}
        onExport={() => { /* some function here */ }}
        showTerminal={false}
        user={selectedUser || undefined}
      />
    );
  }

  // Default to entry page with user selection
  return (
    <EntryPage
      user={selectedUser!}
      onOpenProject={handleOpenProject}
      onLogout={handleLogout}
    />
  );
}