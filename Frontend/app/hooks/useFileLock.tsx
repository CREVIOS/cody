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
  heartbeatMs = 45_000,
  pollMs = 5_000,
  canRequestLock = true,
  canLock = true,
  projectId,
}: Params) {
  const [state, setState] = useState<LockState | null>(null);

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
    console.log("🔵 REFRESH called", { fileId, projectId });
    try {
      const s = await apiGetLock(fileId, projectId);
      console.log("🔵 REFRESH response", s);
      setState(s);
    } catch (e) {
      console.error("❌ refresh error", e);
    }
  }, [fileId, projectId]);

  const request = useCallback(async () => {
    if (!fileId || !userId || role === "viewer") {
      console.log("🔵 REQUEST skipped (missing params or viewer)", {
        fileId,
        userId,
        role,
      });
      return state ?? { state: "UNLOCKED" as const };
    }

    // ✅ Check permission using backend Strategy pattern
    if (!canRequestLock) {
      console.log("🔵 REQUEST skipped (no canRequestLock permission)");
      return state ?? { state: "UNLOCKED" as const };
    }

    // ✅ Owners don't need to request locks
    if (role === "owner") {
      console.log("🟢 REQUEST skipped (owner bypass)");
      return state ?? { state: "UNLOCKED" as const };
    }

    console.log("🔵 REQUEST called", { fileId, userId, role, projectId });
    try {
      const s = await apiRequestLock(fileId, userId, role, projectId);
      console.log("🔵 REQUEST response", s);
      setState(s);
      return s;
    } catch (e) {
      console.error("❌ request error", e);
      return state ?? { state: "UNLOCKED" as const };
    }
  }, [fileId, userId, role, state, canRequestLock, projectId]);

  const release = useCallback(async () => {
    if (!fileId || !userId) return state ?? { state: "UNLOCKED" as const };

    // ✅ Check permission using backend Strategy pattern
    if (!canLock) {
      console.log("🔵 RELEASE skipped (no canLock permission)");
      return state ?? { state: "UNLOCKED" as const };
    }

    // ✅ Owners never need to release manually
    if (role === "owner") {
      console.log("🟢 RELEASE skipped (owner bypass)");
      return state ?? { state: "UNLOCKED" as const };
    }

    console.log("🔵 RELEASE called", { fileId, userId, projectId });
    try {
      const s = await apiReleaseLock(fileId, userId, projectId);
      console.log("🔵 RELEASE response", s);
      setState(s);
      return s;
    } catch (e) {
      console.error("❌ release error", e);
      return state ?? { state: "UNLOCKED" as const };
    }
  }, [fileId, userId, role, state, canLock, projectId]);

  // Initial mount: refresh state
  useEffect(() => {
    if (!fileId) return;
    console.log("🟢 Initial mount - refreshing state");
    refresh();
  }, [fileId, refresh]);

  // Auto-request when unlocked (skip for owner/viewer, or if no permission)
  useEffect(() => {
    if (!autoRequest || !fileId || !userId || role === "viewer" || role === "owner" || !canRequestLock) return;
    if (state?.state === "UNLOCKED") {
      console.log("🟢 Auto-requesting lock (unlocked state detected)");
      request();
    }
  }, [state?.state, autoRequest, fileId, userId, role, request, canRequestLock]);

  // Heartbeat or polling based on canEdit (skip for owner)
  useEffect(() => {
    if (!fileId || !userId || role === "owner") return;

    clearTimers();

    if (canEdit) {
      // I hold the lock → send heartbeats
      console.log("💓 Starting heartbeat timer");
      hbTimer.current = setInterval(async () => {
        try {
          const s = await apiHeartbeat(fileId, userId, projectId);
          setState(s);
        } catch (e) {
          console.error("❌ heartbeat error", e);
          refresh();
        }
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
  }, [canEdit, fileId, userId, role, heartbeatMs, pollMs, refresh, projectId]);

  return {
    state,
    canEdit,
    holder,
    request,
    release,
    refresh,
  };
}
