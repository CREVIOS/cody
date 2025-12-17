"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { API_BASE_URL } from "@/lib/projectAPI/APIConfiguration";
import { User as SupabaseUser } from "@supabase/supabase-js";

interface SignUpOptions {
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

interface AuthContextType {
  user: SupabaseUser | null;
  /**
   * Backend user_id used throughout the app (may differ from Supabase's auth user id if an account already existed)
   */
  userId: string | null;
  /**
   * Raw Supabase auth user id (useful for debugging)
   */
  authUserId: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  signUp: (email: string, password: string, options?: SignUpOptions) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [backendUserId, setBackendUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Helper function to sync user to backend
  const syncUserToBackend = async (user: SupabaseUser): Promise<string | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/users/sync-from-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          email: user.email,
          username: user.user_metadata?.username || user.email?.split('@')[0],
          full_name: user.user_metadata?.full_name,
          avatar_url: user.user_metadata?.avatar_url
        })
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = data?.detail || data?.message || `Status ${response.status}`;
        console.warn('User sync returned non-OK status:', detail);
        if (data?.user_id) {
          setBackendUserId(data.user_id);
          return data.user_id;
        }
        return null;
      }
      const syncedId = data?.user_id || user.id;
      setBackendUserId(syncedId);
      return syncedId;
    } catch (syncError) {
      console.error('Failed to sync user to backend:', syncError);
      return null;
    }
  };

  const handleAuthUser = async (authUser: SupabaseUser | null) => {
    setUser(authUser);
    if (authUser) {
      const syncedId = await syncUserToBackend(authUser);
      setBackendUserId(syncedId ?? authUser.id);
    } else {
      setBackendUserId(null);
    }
  };

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await handleAuthUser(user);
      } catch (error) {
        console.error("Error initializing auth:", error);
        setUser(null);
        setBackendUserId(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen to auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setLoading(true);
      await handleAuthUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signUp = async (email: string, password: string, options?: SignUpOptions) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: options?.username,
          full_name: options?.full_name,
          avatar_url: options?.avatar_url
        }
      }
    });

    if (error) {
      throw error;
    }

    if (data.user) {
      await handleAuthUser(data.user);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (data.user) {
      await handleAuthUser(data.user);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw error;
    }
    await handleAuthUser(null);
  };

  const value: AuthContextType = {
    user,
    userId: backendUserId ?? user?.id ?? null,
    authUserId: user?.id ?? null,
    isAuthenticated: !!user,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
