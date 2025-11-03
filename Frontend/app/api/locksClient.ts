// src/api/locksClient.ts
export type Role = "owner" | "editor" | "viewer" | "admin" | "maintainer";

export type LockState =
  | { state: "UNLOCKED" }
  | {
      state: "LOCKED";
      holder_user_id: string;
      expires_at?: string;
      queue_size?: number;
    };

export const BASE =
  (process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") as string | undefined) ||
  "http://localhost:8000/api/v1";

function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    return res.text().then((t) => {
      console.error("❌ locksClient HTTP error", res.status, t);
      throw new Error(`HTTP ${res.status}: ${t}`);
    });
  }
  return res.json() as Promise<T>;
}

function assertId(name: string, v?: string | null): asserts v is string {
  if (!v) throw new Error(`${name} is required`);
}

const DEFAULT_UNLOCKED: LockState = { state: "UNLOCKED" };

async function fx(url: string, init?: RequestInit) {
  return fetch(url, { cache: "no-store", ...init });
}

// ────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────

export async function apiHealth(): Promise<{ status: string; timestamp: number }> {
  const url = BASE.replace(/\/api\/v1$/, "") + "/health";
  console.log("🩺 GET", url);
  const r = await fx(url);
  return j(r);
}

export async function apiGetLock(fileId?: string | null) {
  if (!fileId) {
    console.warn("apiGetLock: missing fileId — returning UNLOCKED");
    return DEFAULT_UNLOCKED;
  }
  const url = `${BASE}/locks/${fileId}/state`;
  console.log("🔎 GET", url);
  const r = await fx(url);
  const data = await j<{ state: LockState }>(r);
  console.log("✅ GET state =", data);
  return data.state;
}

export async function apiRequestLock(
  fileId?: string | null,
  userId?: string | null,
  role: Role = "editor"
) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  const url = `${BASE}/locks/${fileId}/request`;
  // Normalize role to lowercase for backend consistency
  const normalizedRole = role.toLowerCase();
  
  console.log("📤 REQUESTING LOCK", { fileId, userId, role: normalizedRole });
  
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, role: normalizedRole }),
  });

  const data = await j<{ state: LockState }>(r);
  console.log("✅ REQUEST result =", data);
  return data.state;
}

export async function apiReleaseLock(fileId?: string | null, userId?: string | null) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  const url = `${BASE}/locks/${fileId}/release`;
  console.log("🔓 RELEASING LOCK", { fileId, userId });
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await j<{ state: LockState }>(r);
  console.log("✅ RELEASE result =", data);
  return data.state;
}

export async function apiHeartbeat(fileId?: string | null, userId?: string | null) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  const url = `${BASE}/locks/${fileId}/heartbeat`;
  console.log("💓 HEARTBEAT", { fileId, userId });
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await j<{ state: LockState }>(r);
  console.log("✅ HEARTBEAT result =", data);
  return data.state;
}