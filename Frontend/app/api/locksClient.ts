// src/api/locksClient.ts
export type Role = "owner" | "editor" | "viewer" | "admin";

export type LockState =
  | {
      state: "UNLOCKED";
      locked_by: null;
      canEdit: boolean;
      expires_in: number | null;
    }
  | {
      state: "LOCKED";
      locked_by: string;
      holder_user_id?: string; // Backward compatibility
      canEdit: boolean;
      expires_at?: string;
      expires_in: number | null;
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

const DEFAULT_UNLOCKED: LockState = {
  state: "UNLOCKED",
  locked_by: null,
  canEdit: true,
  expires_in: null,
};

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

export async function apiGetLock(
  fileId?: string | null,
  projectId?: string | null,
  userId?: string | null
) {
  if (!fileId) {
    console.warn("apiGetLock: missing fileId — returning UNLOCKED");
    return DEFAULT_UNLOCKED;
  }
  // Add project_id and user_id query parameters if fileId is not a UUID (i.e., it's a file path)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  const params = new URLSearchParams();
  if (!isUUID && projectId) params.append('project_id', projectId);
  if (userId) params.append('user_id', userId);
  const queryParams = params.toString() ? `?${params.toString()}` : '';
  const url = `${BASE}/locks/${encodeURIComponent(fileId)}/state${queryParams}`;
  console.log("🔎 GET", url);
  const r = await fx(url);
  const data = await j<{ state: LockState }>(r);
  console.log("✅ GET state =", data);
  return data.state;
}

export async function apiRequestLock(
  fileId?: string | null,
  userId?: string | null,
  role: Role = "editor",
  projectId?: string | null
) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  // Add project_id query parameter if fileId is not a UUID (i.e., it's a file path)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  const queryParams = !isUUID && projectId ? `?project_id=${projectId}` : '';
  const url = `${BASE}/locks/${encodeURIComponent(fileId)}/request${queryParams}`;
  // Normalize role to lowercase for backend consistency
  const normalizedRole = role.toLowerCase();
  
  console.log("📤 REQUESTING LOCK", { fileId, userId, role: normalizedRole, projectId });
  
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, role: normalizedRole }),
  });

  const data = await j<{ state: LockState }>(r);
  console.log("✅ REQUEST result =", data);
  return data.state;
}

export async function apiReleaseLock(
  fileId?: string | null,
  userId?: string | null,
  projectId?: string | null
) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  // Add project_id query parameter if fileId is not a UUID (i.e., it's a file path)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  const queryParams = !isUUID && projectId ? `?project_id=${projectId}` : '';
  const url = `${BASE}/locks/${encodeURIComponent(fileId)}/release${queryParams}`;
  console.log("🔓 RELEASING LOCK", { fileId, userId, projectId });
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await j<{ state: LockState }>(r);
  console.log("✅ RELEASE result =", data);
  return data.state;
}

export async function apiHeartbeat(
  fileId?: string | null,
  userId?: string | null,
  projectId?: string | null
) {
  assertId("fileId", fileId);
  assertId("userId", userId);

  // Add project_id query parameter if fileId is not a UUID (i.e., it's a file path)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
  const queryParams = !isUUID && projectId ? `?project_id=${projectId}` : '';
  const url = `${BASE}/locks/${encodeURIComponent(fileId)}/heartbeat${queryParams}`;
  console.log("💓 HEARTBEAT", { fileId, userId, projectId });
  const r = await fx(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });
  const data = await j<{ state: LockState }>(r);
  console.log("✅ HEARTBEAT result =", data);
  return data.state;
}