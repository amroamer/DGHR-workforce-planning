// Typed API client (SPEC §2/§8). All requests hit `${VITE_API_URL}/api/...`.

import type {
  CommandCenterPayload,
  NotificationList,
  NotificationPoll,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:8010").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  base: BASE,

  health: () => request<{ status: string; service: string }>("/api/health"),

  lastUpdated: () => request<{ last_updated: string }>("/api/meta/last-updated"),

  personaEntities: () =>
    request<Record<string, { id: number; name: string }>>("/api/meta/persona-entities"),

  commandCenter: (page = 1, pageSize = 5) =>
    request<CommandCenterPayload>(
      `/api/dghr/command-center?page=${page}&page_size=${pageSize}`,
    ),

  notifications: (audience: "dghr" | "entity", entityId?: number) => {
    const q = new URLSearchParams({ audience });
    if (entityId != null) q.set("entity_id", String(entityId));
    return request<NotificationList>(`/api/notifications?${q.toString()}`);
  },

  pollNotifications: (audience: "dghr" | "entity", entityId?: number, since?: string) => {
    const q = new URLSearchParams({ audience });
    if (entityId != null) q.set("entity_id", String(entityId));
    if (since) q.set("since", since);
    return request<NotificationPoll>(`/api/notifications/poll?${q.toString()}`);
  },

  markNotificationsRead: (body: {
    audience: "dghr" | "entity";
    entity_id?: number | null;
    ids?: number[] | null;
  }) =>
    request<{ marked_read: number }>("/api/notifications/mark-read", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  entityBadges: (entityId: number) =>
    request<{ open_cases: number }>(`/api/entity/${entityId}/badges`),

  resetDemo: () =>
    request<{ ok: boolean; message: string }>("/api/demo/reset", { method: "POST" }),
};
