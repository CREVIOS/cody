"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiGetLock,
  apiRequestLock,
  apiReleaseLock,
  apiHeartbeat,
  type LockState,
  type Role,
} from "../api/locksClient";

const DEFAULT_UNLOCKED: LockState = {
  state: "UNLOCKED",
  locked_by: null,
  canEdit: true,
  expires_in: null,
};

type Params = {
  fileId?: string | null;
  userId?: string | null;
  role: Role;
  autoRequest?: boolean;
  heartbeatMs?: number;
  pollMs?: number;
  canRequestLock?: boolean;
  canLock?: boolean;
  projectId?: string | null;
};

export function useFileLock({
  fileId,
  userId,
  role,
  autoRequest = true,
  heartbeatMs = 5_000, // Phase 5: Heartbeat every 5 seconds
  pollMs = 9_000, // Increased to 9 seconds to reduce collision frequency
  canRequestLock = true,
  canLock = true,
  projectId,
}: Params) {
  const [state, setState] = useState<LockState | null>(null);

  // Stabilization refs to prevent rapid lock switching
  const requestInProgress = useRef(false);
  const heartbeatRetryCount = useRef(0);
  const lastAutoRequestTime = useRef(0);
  const heartbeatInProgressRef = useRef(false);
  const stateRef = useRef<LockState | null>(null); // Track latest state for heartbeat checks

  const holder = useMemo(
    () => (state?.state === "LOCKED" ? state.holder_user_id : undefined),
    [state]
  );

  // ✅ Fix: allow owners to bypass lock, viewers always read-only
  const canEdit = useMemo(() => {
    if (!state || !userId) {
      console.log("🔴 canEdit = false (no state or userId)", { state, userId });
      return false;
    }

    // 🔑 Owner can always edit regardless of lock state
    if (role === "owner") {
      console.log("🟢 canEdit = true (role is owner, bypassing locks)");
      return true;
    }

    // 👁 Viewer can never edit
    if (role === "viewer") {
      console.log("🔒 canEdit = false (viewer role)");
      return false;
    }

    // 🧠 Others: only the holder can edit
    const result = state.state === "LOCKED" && state.holder_user_id === userId;
    console.log("🔵 canEdit =", result, {
      state: state.state,
      holder: state.state === "LOCKED" ? state.holder_user_id : "N/A",
      userId,
      match: state.state === "LOCKED" ? state.holder_user_id === userId : "N/A",
    });
    return result;
  }, [state, userId, role]);

  const hbTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = () => {
    if (hbTimer.current) clearInterval(hbTimer.current);
    if (pollTimer.current) clearInterval(pollTimer.current);
    hbTimer.current = null;
    pollTimer.current = null;
  };

  const refresh = useCallback(async () => {
    if (!fileId) return;
    console.log("🔵 REFRESH called", { fileId, projectId, userId });
    try {
      const s = await apiGetLock(fileId, projectId, userId || undefined);
      console.log("🔵 REFRESH response", s);
      setState(s);
      stateRef.current = s; // Update ref with latest state
    } catch (e) {
      console.error("❌ refresh error", e);
    }
  }, [fileId, projectId, userId]);

  const request = useCallback(async () => {
    if (!fileId || !userId || role === "viewer") {
      console.log("🔵 REQUEST skipped (missing params or viewer)", {
        fileId,
        userId,
        role,
      });
      return state ?? DEFAULT_UNLOCKED;
    }

    // ✅ Check permission using backend Strategy pattern
    if (!canRequestLock) {
      console.log("🔵 REQUEST skipped (no canRequestLock permission)");
      return state ?? DEFAULT_UNLOCKED;
    }

    // ✅ Owners don't need to request locks
    if (role === "owner") {
      console.log("🟢 REQUEST skipped (owner bypass)");
      return state ?? DEFAULT_UNLOCKED;
    }

    console.log("🔵 REQUEST called", { fileId, userId, role, projectId });
    try {
      const s = await apiRequestLock(fileId, userId, role, projectId);
      console.log("🔵 REQUEST response", s);
      setState(s);
      stateRef.current = s; // Update ref with latest state
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Lock acquired:', {
          fileId,
          userId,
          lockState: s.state,
          timestamp: new Date().toISOString(),
        });
      }
      
      return s;
    } catch (e) {
      console.error("❌ request error", e);
      return state ?? DEFAULT_UNLOCKED;
    }
  }, [fileId, userId, role, state, canRequestLock, projectId]);

  // Safe wrapper for request() that prevents overlapping calls
  const safeRequest = useCallback(async () => {
    if (requestInProgress.current) {
      console.log("🔵 REQUEST skipped (already in progress)");
      return state ?? DEFAULT_UNLOCKED;
    }
    requestInProgress.current = true;
    try {
      return await request();
    } finally {
      requestInProgress.current = false;
    }
  }, [request, state]);

  const release = useCallback(async () => {
    if (!fileId || !userId) return state ?? { state: "UNLOCKED" as const };

    // ✅ Check permission using backend Strategy pattern
    if (!canLock) {
      console.log("🔵 RELEASE skipped (no canLock permission)");
      return state ?? DEFAULT_UNLOCKED;
    }

    // ✅ Owners never need to release manually
    if (role === "owner") {
      console.log("🟢 RELEASE skipped (owner bypass)");
      return state ?? DEFAULT_UNLOCKED;
    }

    console.log("🔵 RELEASE called", { fileId, userId, projectId });
    try {
      const s = await apiReleaseLock(fileId, userId, projectId);
      console.log("🔵 RELEASE response", s);
      setState(s);
      stateRef.current = s; // Update ref with latest state
      
      // Reset stabilization flags on release
      requestInProgress.current = false;
      heartbeatRetryCount.current = 0;
      heartbeatInProgressRef.current = false;
      
      // Phase 7: Dev-only logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Phase 7] Lock released:', {
          fileId,
          userId,
          timestamp: new Date().toISOString(),
        });
      }
      
      return s;
    } catch (e) {
      console.error("❌ release error", e);
      // Reset flags even on error
      requestInProgress.current = false;
      heartbeatRetryCount.current = 0;
      heartbeatInProgressRef.current = false;
      return state ?? DEFAULT_UNLOCKED;
    }
  }, [fileId, userId, role, state, canLock, projectId]);

  // Initial mount: refresh state
  useEffect(() => {
    if (!fileId) return;
    console.log("🟢 Initial mount - refreshing state");
    refresh();
  }, [fileId, refresh]);

  // Auto-request when unlocked with debouncing and randomization
  useEffect(() => {
    if (!state) return;
    if (state.state !== "UNLOCKED") return;
    if (!autoRequest || !fileId || !userId || role === "viewer" || role === "owner" || !canRequestLock) return;
    if (!canEdit) return; // only users who CAN edit should try to request

    // Prevent spamming requests
    if (requestInProgress.current) return;

    const now = Date.now();
    // Prevent frequent rapid auto-requests
    if (now - lastAutoRequestTime.current < 3000) return;

    // Random stagger 300ms–1200ms to avoid simultaneous requests
    const delay = 300 + Math.floor(Math.random() * 900);

    const timeout = setTimeout(() => {
      if (requestInProgress.current) return;

      requestInProgress.current = true;
      lastAutoRequestTime.current = Date.now();

      safeRequest()
        .finally(() => {
          requestInProgress.current = false;
        });
    }, delay);

    return () => clearTimeout(timeout);
  }, [state, canEdit, autoRequest, fileId, userId, role, canRequestLock, safeRequest]);

  // Heartbeat or polling based on canEdit (skip for owner)
  useEffect(() => {
    if (!fileId || !userId || role === "owner") return;

    clearTimers();

    if (canEdit) {
      // I hold the lock → send heartbeats
      console.log("💓 Starting heartbeat timer");
      hbTimer.current = setInterval(async () => {
        // CRITICAL: Only send heartbeat if we actually hold the lock
        // Use stateRef to get the latest state (not stale closure)
        const currentState = stateRef.current;
        
        // No heartbeat if state is undefined, UNLOCKED, or we don't hold the lock
        if (!currentState || currentState.state !== "LOCKED") {
          console.log("🛑 Heartbeat skipped - no lock state or UNLOCKED", {
            state: currentState?.state,
          });
          return;
        }
        
        // Check if we're the lock holder (check both locked_by and holder_user_id)
        const isLockHolder = currentState.locked_by === userId || currentState.holder_user_id === userId;
        if (!isLockHolder) {
          console.log("🛑 Heartbeat skipped - lock held by another user", {
            locked_by: currentState.locked_by,
            holder_user_id: currentState.holder_user_id,
            userId,
          });
          return;
        }
        
        // Prevent overlapping heartbeats
        if (heartbeatInProgressRef.current) {
          console.log("🛑 Heartbeat skipped - already in progress");
          return;
        }
        
        heartbeatInProgressRef.current = true;
        let ok = false;
        try {
          const s = await apiHeartbeat(fileId, userId, projectId);
          setState(s);
          stateRef.current = s; // Update ref with latest state
          ok = true;
          
          // Phase 7: Dev-only logging (throttled - only log every 5th heartbeat)
          if (process.env.NODE_ENV === 'development' && Math.random() < 0.2) {
            console.log('[Phase 7] Heartbeat sent:', {
              fileId,
              userId,
              expiresIn: s.expires_in,
            });
          }
        } catch (e) {
          ok = false;
          console.error("❌ heartbeat error", e);
          
          // Phase 7: Dev-only logging
          if (process.env.NODE_ENV === 'development') {
            console.error('[Phase 7] Heartbeat failed:', {
              fileId,
              userId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        } finally {
          heartbeatInProgressRef.current = false;
        }

          // Retry ONCE before assuming lock is lost (only if we still hold the lock)
          if (!ok && heartbeatRetryCount.current < 1) {
            // Re-check lock state before retry using latest state
            const retryState = stateRef.current;
            if (
              retryState?.state === "LOCKED" &&
              (retryState?.locked_by === userId || retryState?.holder_user_id === userId) &&
              !heartbeatInProgressRef.current
            ) {
              heartbeatRetryCount.current += 1;
              await new Promise(res => setTimeout(res, 500));
              
              // Final check before retry
              const finalState = stateRef.current;
              if (
                finalState?.state === "LOCKED" &&
                (finalState?.locked_by === userId || finalState?.holder_user_id === userId) &&
                !heartbeatInProgressRef.current
              ) {
                heartbeatInProgressRef.current = true;
                try {
                  const s = await apiHeartbeat(fileId, userId, projectId);
                  setState(s);
                  stateRef.current = s; // Update ref with latest state
                  ok = true;
                } catch (_) {
                  ok = false;
                } finally {
                  heartbeatInProgressRef.current = false;
                }
              }
            }
          } else if (ok) {
            heartbeatRetryCount.current = 0;
          }

          if (!ok) {
            // Do NOT immediately refresh -> stagger
            const delay = 300 + Math.random() * 1000;
            setTimeout(() => refresh(), delay);
            return;
          }

          heartbeatRetryCount.current = 0;
      }, heartbeatMs);
    } else {
      // I don't hold the lock → poll for changes
      console.log("🔄 Starting poll timer");
      pollTimer.current = setInterval(() => {
        refresh();
      }, pollMs);
    }

    return () => {
      clearTimers();
    };
  }, [canEdit, fileId, userId, role, heartbeatMs, pollMs, refresh, projectId, state]);

  // Update stateRef whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  return {
    state,
    canEdit,
    holder,
    request,
    release,
    refresh,
  };
}
