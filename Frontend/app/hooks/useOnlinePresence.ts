"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type PresencePayload = {
  userId: string;
  username?: string;
  lastSeen: number; // epoch ms
};

type OnlineMap = Record<string, PresencePayload>;
type SelfUser = { userId: string; username?: string };

export function useOnlinePresence(roomKey: string, self: SelfUser) {
  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [onlineById, setOnlineById] = useState<OnlineMap>({});

  const onlineSet = useMemo(() => new Set(Object.keys(onlineById)), [onlineById]);
  const onlineList = useMemo(
    () => Object.values(onlineById).sort((a, b) => b.lastSeen - a.lastSeen),
    [onlineById]
  );
  const isOnline = (userId?: string | null) => !!userId && onlineSet.has(userId);

  // Narrow unknown presence row into our payload shape
  const toPayload = (row: unknown): PresencePayload | null => {
    if (!row || typeof row !== "object") return null;
    const r = row as Partial<PresencePayload>;
    if (typeof r.userId === "string" && typeof r.lastSeen === "number") {
      return { userId: r.userId, username: r.username, lastSeen: r.lastSeen };
    }
    return null;
  };

  useEffect(() => {
    if (!roomKey || !self?.userId) return;

    const channel = supabase.channel(`presence:${roomKey}`, {
      config: { presence: { key: self.userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        // presenceState(): Record<presenceKey, Array<payloadWithMeta>>
        const raw = channel.presenceState() as Record<string, unknown[]>;
        const next: OnlineMap = {};

        for (const [key, rows] of Object.entries(raw)) {
          const payloads = rows
            .map(toPayload)
            .filter((p): p is PresencePayload => p !== null);

          const latest =
            payloads.reduce<PresencePayload | null>(
              (acc, cur) => (!acc || cur.lastSeen > acc.lastSeen ? cur : acc),
              null
            ) ?? null;

          if (latest && latest.userId) {
            next[key] = latest;
          }
        }
        setOnlineById(next);
      })
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          userId: self.userId,
          username: self.username,
          lastSeen: Date.now(),
        });
      });

    // Heartbeat so we don’t ghost
    const interval = setInterval(() => {
      channel.track({
        userId: self.userId,
        username: self.username,
        lastSeen: Date.now(),
      });
    }, 30_000);

    return () => {
      clearInterval(interval);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomKey, self?.userId, self?.username, supabase]);

  return { onlineById, onlineSet, onlineList, isOnline };
}
