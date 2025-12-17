"use client";

import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";

const DEMO_USER_ID_KEY = "app-demo-user-id";

/**
 * Hook to get the active user ID
 * Priority: Supabase auth userId > demoUserId
 * Exactly one userId should be active at a time
 */
export function useActiveUserId(): string | null {
  const { userId: authUserId, isAuthenticated } = useAuth();
  const [demoUserId, setDemoUserIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load demo user ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(DEMO_USER_ID_KEY);
    if (stored) {
      setDemoUserIdState(stored);
    }
    setHydrated(true);
  }, []);

  // If authenticated, clear demo mode
  useEffect(() => {
    if (isAuthenticated && authUserId && demoUserId) {
      // Clear demo mode when auth is active
      localStorage.removeItem(DEMO_USER_ID_KEY);
      setDemoUserIdState(null);
    }
  }, [isAuthenticated, authUserId, demoUserId]);

  // Return active user ID: auth takes priority over demo
  if (!hydrated) {
    return null;
  }

  if (isAuthenticated && authUserId) {
    return authUserId;
  }

  return demoUserId;
}

/**
 * Set demo user ID (clears auth if needed)
 */
export function setDemoUserId(userId: string | null) {
  if (userId) {
    localStorage.setItem(DEMO_USER_ID_KEY, userId);
  } else {
    localStorage.removeItem(DEMO_USER_ID_KEY);
  }
}

/**
 * Get demo user ID from localStorage (synchronous)
 */
export function getDemoUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(DEMO_USER_ID_KEY);
}

/**
 * Clear demo mode
 */
export function clearDemoMode() {
  localStorage.removeItem(DEMO_USER_ID_KEY);
}
