'use client';

import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

// -------------------------------------------------------
// Constants and Types
// -------------------------------------------------------
const EVENT_CURSOR = 'realtime-cursor-move' as const;

export type CursorEventPayload = {
  position: { x: number; y: number };
  user: { id: string; name: string };
  color: string;
  timestamp: number;
  docKey?: string; // scope cursors to the file
};

type UseRealtimeArgs = {
  roomName: string;
  username: string;
  throttleMs?: number;
  userId?: string;
  docKey?: string;
};

type PresenceMeta = {
  userId: string;
  username: string;
  startedAt: number;
  docKey: string;
};

// -------------------------------------------------------
// Utils
// -------------------------------------------------------
type UnknownRec = Record<string, unknown>;
const isRecord = (x: unknown): x is UnknownRec =>
  typeof x === 'object' && x !== null;
const isNumber = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x);
const isString = (x: unknown): x is string => typeof x === 'string';

const isCursorPayload = (x: unknown): x is CursorEventPayload => {
  if (!isRecord(x)) return false;
  const pos = x['position'];
  const usr = x['user'];
  return (
    isRecord(pos) &&
    isRecord(usr) &&
    isNumber((pos as UnknownRec)['x']) &&
    isNumber((pos as UnknownRec)['y']) &&
    isString((usr as UnknownRec)['id']) &&
    isString((usr as UnknownRec)['name']) &&
    isString(x['color']) &&
    isNumber(x['timestamp'])
  );
};

function throttle<Params extends unknown[]>(
  cb: (...args: Params) => void,
  delay: number
) {
  let last = 0;
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Params) => {
    const now = Date.now();
    const rem = delay - (now - last);
    if (rem <= 0) {
      if (t) clearTimeout(t);
      t = null;
      last = now;
      cb(...args);
    } else if (!t) {
      t = setTimeout(() => {
        last = Date.now();
        t = null;
        cb(...args);
      }, rem);
    }
  };
}

function tabUUID(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getPerTabId(scopeKey: string, external?: string): string {
  if (external) return external;
  const key = `rtc_tab_uid:${scopeKey}`;
  if (typeof window === 'undefined') return tabUUID();
  let val = sessionStorage.getItem(key);
  if (!val) {
    val = tabUUID();
    sessionStorage.setItem(key, val);
  }
  return val;
}

// -------------------------------------------------------
// Supabase and Hook
// -------------------------------------------------------
const supabase = createClient();

export const useRealtimeCursors = ({
  roomName,
  username,
  throttleMs = 50,
  userId: externalUserId,
  docKey: docKeyArg,
}: UseRealtimeArgs) => {
  const docKeyRef = useRef<string>(docKeyArg ?? roomName);
  const scopeKey = `${roomName}::${docKeyRef.current}`;
  const [userId] = useState<string>(() => getPerTabId(scopeKey, externalUserId));

  const [cursors, setCursors] = useState<Record<string, CursorEventPayload>>({});
  const [activeEditor, _setActiveEditor] = useState<string | null>(null);
  const activeEditorRef = useRef<string | null>(null);
  const setActiveEditor = (id: string | null) => {
    activeEditorRef.current = id;
    _setActiveEditor(id);
  };
  const isEditor = activeEditor === userId;
  const [queue, setQueue] = useState<Array<{ userId: string; username: string }>>([]);
  const [lockEvent, setLockEvent] = useState<string>('Waiting for leader…');
  const [inactivitySeconds, setInactivitySeconds] = useState(0);

  const lastActivityTimeRef = useRef<number>(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const colorRef = useRef<string>(
    `hsl(${Math.floor(Math.random() * 360)}, 100%, 70%)`
  );
  const enableEditTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const selfMetaRef = useRef<PresenceMeta>({
    userId,
    username,
    startedAt: Date.now(),
    docKey: docKeyRef.current,
  });

  const leaderSinceRef = useRef<number>(0);

  // -------------------------------------------------------
  // Backend Realtime Sync Helpers
  // -------------------------------------------------------
  async function notifyBackendLock(fileKey: string, leaderId: string | null) {
    try {
      await fetch(`http://localhost:8000/api/v1/files/${fileKey}/lock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leader_id: leaderId }),
      });
    } catch (err) {
      console.warn('Failed to notify backend lock:', err);
    }
  }

  async function notifyBackendQueue(fileKey: string, queueList: Array<{ userId: string }>) {
    try {
      await fetch(`http://localhost:8000/api/v1/files/${fileKey}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: queueList }),
      });
    } catch (err) {
      console.warn('Failed to notify backend queue:', err);
    }
  }

  // -------------------------------------------------------
  // Activity & Cursor Handling
  // -------------------------------------------------------
  const markActivity = useCallback(() => {
    lastActivityTimeRef.current = Date.now();
    setInactivitySeconds(0);
  }, []);

  const sendCursor = useCallback(
    (x: number, y: number) => {
      const payload: CursorEventPayload = {
        position: { x, y },
        user: { id: userId, name: username },
        color: colorRef.current,
        timestamp: Date.now(),
        docKey: docKeyRef.current,
      };
      channelRef.current?.send({ type: 'broadcast', event: EVENT_CURSOR, payload });
    },
    [userId, username]
  );

  const onMouseMove = useCallback(
    throttle((e: MouseEvent) => sendCursor(e.clientX, e.clientY), throttleMs),
    [sendCursor, throttleMs]
  );

  function computeLeaderAndQueue(state: Record<string, PresenceMeta[]>) {
    const everyoneAllDocs: PresenceMeta[] = Object.values(state).flat();
    const everyone = everyoneAllDocs.filter(
      (m) => m.docKey === docKeyRef.current
    );
    if (!everyone.length) return { leaderId: null, queue: [] };
    const sorted = [...everyone].sort(
      (a, b) => (a.startedAt - b.startedAt) || (a.userId < b.userId ? -1 : 1)
    );
    const leader = sorted[0];
    const rest = sorted.slice(1).map(({ userId, username }) => ({ userId, username }));
    return { leaderId: leader.userId, queue: rest };
  }

  function electLeaderAndQueue() {
    const state = channelRef.current?.presenceState<PresenceMeta>() ?? {};
    const { leaderId, queue } = computeLeaderAndQueue(state);
    setQueue(queue);
    notifyBackendQueue(docKeyRef.current, queue);
    notifyBackendLock(docKeyRef.current, leaderId);

    if (leaderId !== activeEditorRef.current) {
      if (enableEditTimerRef.current) {
        clearTimeout(enableEditTimerRef.current);
        enableEditTimerRef.current = null;
      }

      if (leaderId === userId) {
        enableEditTimerRef.current = setTimeout(() => {
          setActiveEditor(userId);
          setLockEvent('🔒 You are the leader');
          leaderSinceRef.current = Date.now();
          markActivity();
        }, 250);
      } else {
        setActiveEditor(leaderId);
        setLockEvent(
          leaderId ? `🔒 Leader: ${leaderId}` : '🔓 Lock is free'
        );
      }
    }
  }

  // -------------------------------------------------------
  // Auto-Demotion after 2 minutes inactivity
  // -------------------------------------------------------
  const maybeAutoDemoteLeader = useCallback(async () => {
    if (activeEditorRef.current !== userId) return;
    const now = Date.now();
    const idleBaseline = Math.max(
      leaderSinceRef.current || 0,
      lastActivityTimeRef.current || 0
    );
    const diffMs = now - idleBaseline;
    if (now - leaderSinceRef.current < 3000) return;
    if (diffMs <   10 * 1000) return; // 2 minutes

    const ch = channelRef.current;
    if (!ch) return;
    try {
      await ch.untrack();
      const fresh: PresenceMeta = {
        userId: selfMetaRef.current.userId,
        username: selfMetaRef.current.username,
        startedAt: Date.now(),
        docKey: docKeyRef.current,
      };
      selfMetaRef.current = fresh;
      await ch.track(fresh);
      setActiveEditor(null);
      setLockEvent('🔓 Auto-released after 2m inactivity (you are queued again)');
      leaderSinceRef.current = 0;
      lastActivityTimeRef.current = Date.now();
      notifyBackendLock(docKeyRef.current, null);
    } catch {
      /* noop */
    }
  }, [userId]);

  // -------------------------------------------------------
  // Room subscription and presence
  // -------------------------------------------------------
  useEffect(() => {
    const channel = supabase.channel(roomName);
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => electLeaderAndQueue())
      .on('presence', { event: 'join' }, () => electLeaderAndQueue())
      .on('presence', { event: 'leave' }, () => electLeaderAndQueue());

    channel.on('broadcast', { event: EVENT_CURSOR }, (env: { payload: unknown }) => {
      const p = env?.payload;
      if (!isCursorPayload(p)) return;
      const pp = p as CursorEventPayload;
      if (pp.docKey && pp.docKey !== docKeyRef.current) return;
      if (pp.user.id === userId) return;
      setCursors((prev) => ({ ...prev, [pp.user.id]: pp }));
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const presenceMeta: PresenceMeta = {
          userId,
          username,
          startedAt: Date.now(),
          docKey: docKeyRef.current,
        };
        selfMetaRef.current = presenceMeta;
        await channel.track(presenceMeta);
      }
    });

    window.addEventListener('mousemove', onMouseMove);
    const onKey = () => markActivity();
    window.addEventListener('keydown', onKey);
    window.addEventListener('keypress', onKey);
    window.addEventListener('keyup', onKey);

    const onBeforeUnload = () => {
      try {
        channelRef.current?.untrack();
      } catch {}
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keypress', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (enableEditTimerRef.current) clearTimeout(enableEditTimerRef.current);
      channel.unsubscribe();
    };
  }, [roomName, userId, username, onMouseMove, markActivity]);

  // -------------------------------------------------------
  // Inactivity Tracker
  // -------------------------------------------------------
  useEffect(() => {
    if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    inactivityTimerRef.current = setInterval(() => {
      const diffMs = Date.now() - lastActivityTimeRef.current;
      setInactivitySeconds(Math.floor(diffMs / 1000));
      void maybeAutoDemoteLeader();
    }, 1000);
    return () => {
      if (inactivityTimerRef.current) clearInterval(inactivityTimerRef.current);
    };
  }, [maybeAutoDemoteLeader]);

  return {
    cursors,
    isEditor,
    activeEditor,
    queue,
    inactivitySeconds,
    lockEvent,
  };
};
