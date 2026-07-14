// Typed API client (SPEC §2/§8). All requests hit `${VITE_API_URL}/api/...`.

import type {
  BlockedSummary,
  CommandCenterPayload,
  ConfigPayload,
  EntityDetail,
  Followups,
  NotificationList,
  NotificationPoll,
  QualityPayload,
  TrackerPayload,
} from "./types";

export interface TrackerFilters {
  wave?: string;
  status?: string;
  reviewer?: string;
  package?: string;
  due?: string;
  search?: string;
  sort?: string;
  direction?: string;
  page?: number;
  page_size?: number;
}

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

  // ── DGHR Phase 1 ──
  tracker: (filters: TrackerFilters = {}) => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
    });
    return request<TrackerPayload>(`/api/dghr/tracker?${q.toString()}`);
  },
  trackerBlocked: () => request<BlockedSummary>("/api/dghr/tracker/blocked-summary"),
  trackerFollowups: () => request<Followups>("/api/dghr/tracker/followups"),
  trackerCsvUrl: () => `${BASE}/api/dghr/tracker/export.csv`,

  config: () => request<ConfigPayload>("/api/dghr/config"),
  patchPackage: (id: number, mandatory_enabled: boolean) =>
    request<{ ok: boolean; id: number; mandatory_enabled: boolean }>(
      `/api/dghr/config/packages/${id}`,
      { method: "PATCH", body: JSON.stringify({ mandatory_enabled }) },
    ),
  publishConfig: () =>
    request<{ ok: boolean; message: string }>("/api/dghr/config/publish", { method: "POST" }),

  quality: (page = 1, pageSize = 8) =>
    request<QualityPayload>(`/api/dghr/quality?page=${page}&page_size=${pageSize}`),
  patchIssue: (id: number, body: { status?: string; assigned_to?: number }) =>
    request<{ ok: boolean }>(`/api/dghr/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  entityDetail: (id: number) => request<EntityDetail>(`/api/dghr/entities/${id}`),

  resetDemo: () =>
    request<{ ok: boolean; message: string }>("/api/demo/reset", { method: "POST" }),
};
