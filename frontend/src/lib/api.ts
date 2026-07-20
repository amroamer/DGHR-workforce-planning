// Typed API client (SPEC §2/§8). All requests hit `${VITE_API_URL}/api/...`.

import type {
  BlockedSummary,
  CaseDetail,
  CasesList,
  ClarificationsKpis,
  CommandCenterPayload,
  ConfigPayload,
  DriversPayload,
  EntityDetail,
  EntityHome,
  Followups,
  MySubmissions,
  NotificationList,
  NotificationPoll,
  OrgStructure,
  QualityPayload,
  ReadinessPayload,
  TrackerPayload,
  WorkforcePayload,
  WorkloadPayload,
} from "./types";
import * as Q from "./planning";

export interface WorkforceFilters {
  search?: string;
  section?: string;
  employment_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface TrackerFilters {
  wave?: string;
  status?: string;
  reviewer?: string;
  package?: string;
  due?: string;
  search?: string;
  completeness?: string;
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

/** Multipart upload — browser sets the Content-Type boundary, so don't set it. */
async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", body: form });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

export interface ImportResult {
  imported: number;
  mapped: { count: number; pct: number };
  partial: { count: number; pct: number };
  unmapped: { count: number; pct: number };
  issues_summary: Record<string, number>;
  sample_issues: { section: string; job_title: string; issues: string[] }[];
}
export interface MapSuggestion {
  input: string;
  suggested_title: string | null;
  family: string | null;
  confidence: number;
}
export interface PackageInput {
  name?: string;
  description?: string;
  total_fields?: number;
  mandatory_fields?: number;
  optional_fields?: number;
  evidence_required?: "yes" | "optional";
  icon_key?: string;
  applicable?: boolean;
  section_type_names?: string[];
}

export const api = {
  base: BASE,

  health: () => request<{ status: string; service: string }>("/api/health"),

  lastUpdated: () => request<{ last_updated: string }>("/api/meta/last-updated"),

  personaEntities: () =>
    request<Record<string, { id: number; name: string }>>("/api/meta/persona-entities"),

  entitiesList: () =>
    request<{ id: number; name: string; code: string; wave: string; logo_url: string | null }[]>("/api/meta/entities"),

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
  trackerCsvUrl: (filters: TrackerFilters = {}) => {
    const q = new URLSearchParams();
    (["wave", "status", "reviewer", "package", "due", "search", "completeness", "sort", "direction"] as const)
      .forEach((k) => { const v = filters[k]; if (v) q.set(k, String(v)); });
    const qs = q.toString();
    return `${BASE}/api/dghr/tracker/export.csv${qs ? `?${qs}` : ""}`;
  },

  config: () => request<ConfigPayload>("/api/dghr/config"),
  patchPackage: (id: number, mandatory_enabled: boolean) =>
    request<{ ok: boolean; id: number; mandatory_enabled: boolean }>(
      `/api/dghr/config/packages/${id}`,
      { method: "PATCH", body: JSON.stringify({ mandatory_enabled }) },
    ),
  // ── DGHR authoring (cycle + packages + entities) ──
  updatePackage: (id: number, body: PackageInput) =>
    request<{ ok: boolean; id: number }>(`/api/dghr/config/packages/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createPackage: (body: PackageInput) =>
    request<{ ok: boolean; id: number; key: string }>("/api/dghr/config/packages", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deletePackage: (id: number) =>
    request<{ ok: boolean }>(`/api/dghr/config/packages/${id}`, { method: "DELETE" }),
  addFieldGroup: (packageId: number, body: { name: string; field_count: number }) =>
    request<{ ok: boolean; id: number }>(`/api/dghr/config/packages/${packageId}/field-groups`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteFieldGroup: (groupId: number) =>
    request<{ ok: boolean }>(`/api/dghr/config/field-groups/${groupId}`, { method: "DELETE" }),
  patchCycle: (id: number, body: Record<string, string>) =>
    request<{ ok: boolean; id: number }>(`/api/dghr/config/cycle/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  createEntity: (body: { name: string; code: string; wave: string; due_date?: string }) =>
    request<{ ok: boolean; id: number; code: string }>("/api/dghr/entities", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchEntity: (id: number, body: { name?: string; wave?: string; due_date?: string }) =>
    request<{ ok: boolean; id: number }>(`/api/dghr/entities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  publishConfig: () =>
    request<{ ok: boolean; message: string }>("/api/dghr/config/publish", { method: "POST" }),

  quality: (page = 1, pageSize = 8) =>
    request<QualityPayload>(`/api/dghr/quality?page=${page}&page_size=${pageSize}`),
  patchIssue: (id: number, body: { status?: string; assigned_to?: number }) =>
    request<{ ok: boolean; status: string; assigned_to: number | null }>(`/api/dghr/issues/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  issueDetail: (id: number) =>
    request<{
      id: number; issue_type: string; package_key: string; entity: string; entity_id: number;
      severity: string; ai_confidence: number; status: string; assigned_to: number | null; assigned_to_name: string | null;
      samples: { kind: string; label: string; detail: string }[];
      reviewers: { id: number; name: string; role: string }[];
    }>(`/api/dghr/issues/${id}`),
  issueSendBack: (id: number) =>
    request<{ ok: boolean; ref: string; issue_status: string }>(`/api/dghr/issues/${id}/send-back`, { method: "POST" }),
  dghrReviewers: () => request<{ id: number; name: string; role: string }[]>("/api/dghr/reviewers"),

  entityDetail: (id: number) => request<EntityDetail>(`/api/dghr/entities/${id}`),

  forecastingReadiness: (filter_state = "all", page = 1) =>
    request<ReadinessPayload>(`/api/dghr/forecasting-readiness?filter_state=${filter_state}&page=${page}`),

  // ── Demo control (Phase 5) ──
  simulateSubmissions: () => request<{ ok: boolean; submitted: { entity: string; package: string }[] }>("/api/demo/simulate-submissions", { method: "POST" }),
  triggerAnomaly: () => request<{ ok: boolean; anomaly_id: number }>("/api/demo/trigger-anomaly", { method: "POST" }),
  advanceTrend: () => request<{ ok: boolean; points: number }>("/api/demo/advance-trend", { method: "POST" }),

  // ── Entity portal (Phase 2) ──
  home: (id: number) => request<EntityHome>(`/api/entity/${id}/home`),
  orgStructure: (id: number, params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); });
    return request<OrgStructure>(`/api/entity/${id}/org-structure?${q.toString()}`);
  },
  workforce: (id: number, filters: WorkforceFilters = {}) => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") q.set(k, String(v)); });
    return request<WorkforcePayload>(`/api/entity/${id}/workforce?${q.toString()}`);
  },
  workload: (id: number) => request<WorkloadPayload>(`/api/entity/${id}/workload`),
  drivers: (id: number) => request<DriversPayload>(`/api/entity/${id}/drivers`),
  mySubmissions: (id: number) => request<MySubmissions>(`/api/entity/${id}/my-submissions`),

  // ── Cases / Clarifications (Phase 3) ──
  cases: (params: { side?: string; entity_id?: number; tab?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== "") q.set(k, String(v)); });
    return request<CasesList>(`/api/cases?${q.toString()}`);
  },
  caseDetail: (id: number) => request<CaseDetail>(`/api/cases/${id}`),
  clarificationsKpis: (entityId?: number) =>
    request<ClarificationsKpis>(`/api/cases/kpis${entityId != null ? `?entity_id=${entityId}` : ""}`),
  createCase: (body: { entity_id: number; issue_summary: string; package_label?: string; corrections?: string[]; priority?: string; category?: string; origin?: "dghr" | "entity" }) =>
    request<{ ok: boolean; ref: string; id: number }>("/api/cases", { method: "POST", body: JSON.stringify(body) }),
  caseMessage: (id: number, side: "dghr" | "entity", body: string) =>
    request<CaseDetail>(`/api/cases/${id}/messages`, { method: "POST", body: JSON.stringify({ side, body }) }),
  caseAction: (id: number, action: string, reviewer_id?: number) =>
    request<CaseDetail>(`/api/cases/${id}/action`, { method: "POST", body: JSON.stringify({ action, reviewer_id }) }),

  // ── Workflow actions (Phase 3) ──
  submitPackage: (entityId: number, key: string) =>
    request<{ ok: boolean; package: string; entity_status: string }>(`/api/entity/${entityId}/packages/${key}/submit`, { method: "POST" }),
  saveDraft: (entityId: number, key: string, progress?: number) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/packages/${key}/save-draft`, {
      method: "POST",
      body: JSON.stringify({ progress: progress ?? null }),
    }),
  // ── Entity add-row (manual data entry) ──
  addOrgSection: (entityId: number, body: { sector: string; department: string; name: string; employee_count?: number }) =>
    request<{ ok: boolean; id: number }>(`/api/entity/${entityId}/org-structure`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  patchOrgSection: (entityId: number, id: number, body: { in_scope?: boolean; status?: string; name?: string }) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/org-structure/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteOrgSection: (entityId: number, id: number) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/org-structure/${id}`, { method: "DELETE" }),
  patchWorkloadSection: (entityId: number, id: number, body: { current_volume?: number; unit?: string; status?: string }) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/workload/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  validateWorkload: (entityId: number) =>
    request<{ ok: boolean; missing_data: number }>(`/api/entity/${entityId}/workload/validate`, { method: "POST" }),
  patchDriver: (entityId: number, id: number, body: { category?: string; description?: string; impact?: string; horizon?: string; status?: string; linked_sections?: string[] }) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/drivers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDriver: (entityId: number, id: number) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/drivers/${id}`, { method: "DELETE" }),
  patchEvidence: (entityId: number, id: number, body: { linked_label?: string; quality?: string }) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/evidence/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEvidence: (entityId: number, id: number) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/evidence/${id}`, { method: "DELETE" }),
  addWorkloadSection: (entityId: number, body: { name: string; unit?: string; current_volume?: number }) =>
    request<{ ok: boolean; id: number }>(`/api/entity/${entityId}/workload`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addDriver: (entityId: number, body: { category: string; description: string; impact?: string; horizon?: string }) =>
    request<{ ok: boolean; id: number }>(`/api/entity/${entityId}/drivers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addComment: (entityId: number, body: { package_key: string; body: string; related_label?: string }) =>
    request<{ ok: boolean; id: number }>(`/api/entity/${entityId}/comments`, { method: "POST", body: JSON.stringify(body) }),
  remind: (entity_ids: number[], status?: string) =>
    request<{ ok: boolean; reminded: number }>("/api/dghr/actions/remind", { method: "POST", body: JSON.stringify({ entity_ids, status }) }),
  escalate: (body: { entity_ids?: number[]; status?: string } = {}) =>
    request<{ ok: boolean; escalated: number }>("/api/dghr/actions/escalate", { method: "POST", body: JSON.stringify(body) }),
  approve: (body: { entity_ids?: number[]; ready?: boolean }) =>
    request<{ ok: boolean; approved: number }>("/api/dghr/actions/approve", { method: "POST", body: JSON.stringify(body) }),
  bulkReview: (entity_ids: number[]) =>
    request<{ ok: boolean; reviewed: number; skipped: number }>("/api/dghr/actions/bulk-review", { method: "POST", body: JSON.stringify({ entity_ids }) }),
  returnSubmission: (body: { entity_id: number; package_key?: string; reason?: string }) =>
    request<{ ok: boolean; ref: string }>("/api/dghr/actions/return", { method: "POST", body: JSON.stringify(body) }),

  // ── Import engine + AI + evidence (Phase 4) ──
  importWorkforce: (entityId: number, file: File) => {
    const f = new FormData(); f.append("file", file);
    return upload<ImportResult>(`/api/entity/${entityId}/workforce/import`, f);
  },
  workforceValidate: (entityId: number) =>
    request<{ issues_summary: Record<string, number>; open_issues: number }>(`/api/entity/${entityId}/workforce/validate`, { method: "POST" }),
  patchWorkforce: (entityId: number, recordId: number, body: { job_family?: string; grade?: number; employment_type?: string; critical_role?: boolean; map_status?: string }) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/workforce/${recordId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteWorkforce: (entityId: number, recordId: number) =>
    request<{ ok: boolean }>(`/api/entity/${entityId}/workforce/${recordId}`, { method: "DELETE" }),
  workforceCsvUrl: (entityId: number) => `${BASE}/api/entity/${entityId}/workforce/export.csv`,
  importOrg: (entityId: number, file: File) => {
    const f = new FormData(); f.append("file", file);
    return upload<{ imported: number }>(`/api/entity/${entityId}/org-structure/import`, f);
  },
  importWorkload: (entityId: number, file: File) => {
    const f = new FormData(); f.append("file", file);
    return upload<{ updated: number }>(`/api/entity/${entityId}/workload/import`, f);
  },
  workforceTemplateUrl: (entityId: number) => `${BASE}/api/entity/${entityId}/workforce/template.xlsx`,
  orgTemplateUrl: (entityId: number) => `${BASE}/api/entity/${entityId}/org-structure/template.xlsx`,
  uploadEvidence: (entityId: number, file: File, linked_label = "", quality = "Medium") => {
    const f = new FormData(); f.append("file", file); f.append("linked_label", linked_label); f.append("quality", quality);
    return upload<{ ok: boolean; id: number; filename: string }>(`/api/entity/${entityId}/evidence`, f);
  },
  aiDriverSummary: (entityId: number) =>
    request<{ summary: string; source: string }>(`/api/ai/driver-summary/${entityId}`, { method: "POST" }),
  aiAnomalyNarrative: (anomalyId: number) =>
    request<{ narrative: string; source: string }>(`/api/ai/anomaly-narrative/${anomalyId}`, { method: "POST" }),
  aiMapTitles: (titles: string[]) =>
    request<{ suggestions: MapSuggestion[]; source: string }>("/api/ai/map-titles", { method: "POST", body: JSON.stringify({ titles }) }),
  aiReportNarrative: (scope: "entity" | "gov", entityId?: number, scenario = "base") =>
    request<{ narrative: string; source: string }>("/api/ai/report-narrative", {
      method: "POST", body: JSON.stringify({ scope, entity_id: entityId ?? null, scenario }),
    }),
  aiReviewBrief: (subId: number) =>
    request<{ summary: string; risks: { title: string; detail: string }[]; checks: string[]; source: string }>(
      `/api/ai/review-brief/${subId}`, { method: "POST" }),
  aiAsk: (question: string, history: { role: "user" | "assistant"; content: string }[] = [], scenario = "base") =>
    request<{ answer: string; source: string }>("/api/ai/ask", {
      method: "POST", body: JSON.stringify({ question, history, scenario }),
    }),
  // Streaming variant — reads NDJSON ({"delta"} chunks then {"done","source"}) and calls onDelta per
  // token. Resolves with the source once the stream ends.
  aiAskStream: async (
    body: { question: string; scope?: "gov" | "entity"; entity_id?: number; scenario?: string;
            history?: { role: "user" | "assistant"; content: string }[] },
    onDelta: (text: string) => void,
  ): Promise<{ source: string }> => {
    const res = await fetch(`${BASE}/api/ai/ask/stream`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!res.ok || !res.body) throw new ApiError(res.status, res.statusText);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let source = "fallback";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const obj = JSON.parse(line) as { delta?: string; done?: boolean; source?: string };
          if (obj.delta) onDelta(obj.delta);
          if (obj.done && obj.source) source = obj.source;
        } catch { /* ignore a partial line */ }
      }
    }
    return { source };
  },
  aiDraftClarification: (body: {
    submission_id: number; direction: "question" | "reply";
    element_type?: string; element_key?: string; element_label?: string; clarification_id?: number;
  }) =>
    request<{ draft: string; source: string }>("/api/ai/draft-clarification", {
      method: "POST", body: JSON.stringify(body),
    }),
  // ── AI agents (multi-step) ──
  aiPreReview: (subId: number) =>
    request<Q.PreReviewPayload>(`/api/ai/pre-review/${subId}`, { method: "POST" }),
  aiClarificationTriage: () =>
    request<Q.TriagePayload>("/api/ai/clarification-triage", { method: "POST" }),
  aiClarificationChase: (body: { clarification_id: number; action: "remind" | "escalate"; message?: string }) =>
    request<{ ok: boolean; action: string; clarification_id: number }>("/api/ai/clarification-chase", {
      method: "POST", body: JSON.stringify(body),
    }),
  aiQualitySweep: () =>
    request<Q.QualitySweepPayload>("/api/ai/quality-sweep", { method: "POST" }),

  resetDemo: () =>
    request<{ ok: boolean; message: string }>("/api/demo/reset", { method: "POST" }),

  // ── Planning: departments + sizing ──
  planning: {
    typesets: () => request<Q.QTypeset[]>("/api/planning/typesets"),
    departments: (entityId: number) => request<Q.DepartmentsPayload>(`/api/planning/entities/${entityId}/departments`),
    createDept: (entityId: number, body: { name: string; typeset_id?: number | null; current_fte?: number; head_name?: string }) =>
      request<{ ok: boolean; id: number }>(`/api/planning/entities/${entityId}/departments`, { method: "POST", body: JSON.stringify(body) }),
    patchDept: (id: number, body: { name?: string; typeset_id?: number | null; current_fte?: number; head_name?: string }) =>
      request<{ ok: boolean }>(`/api/planning/departments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    deleteDept: (id: number) => request<{ ok: boolean }>(`/api/planning/departments/${id}`, { method: "DELETE" }),
    submission: (deptId: number) => request<Q.SubmissionPayload>(`/api/planning/departments/${deptId}/submission`),
    saveSubmission: (subId: number, body: Q.SubmissionSave) =>
      request<Q.SubmissionPayload>(`/api/planning/submissions/${subId}`, { method: "PUT", body: JSON.stringify(body) }),
    // Submitting requires the signed attestation — the server rejects it without one.
    submit: (subId: number, attestation: { attested: boolean; attested_by: string }) =>
      request<Q.SubmissionPayload>(`/api/planning/submissions/${subId}/submit`, { method: "POST", body: JSON.stringify(attestation) }),
    submissions: (entityId: number, status?: string) =>
      request<{ rows: Q.SubmissionRow[] }>(`/api/planning/entities/${entityId}/submissions${status ? `?status=${status}` : ""}`),
    entitySizing: (entityId: number) => request<{ entity_id: number; departments: Q.DeptRow[]; totals: Q.Totals }>(`/api/planning/entities/${entityId}/sizing`),
    humanCapital: (entityId: number) => request<Q.EntityHumanCapital>(`/api/planning/entities/${entityId}/human-capital`),
    // documents — real files on the uploads volume
    documents: (entityId: number) => request<Q.DocumentsPayload>(`/api/planning/entities/${entityId}/documents`),
    departmentDocuments: (deptId: number) => request<Q.DocumentsPayload>(`/api/planning/departments/${deptId}/documents`),
    uploadDocument: (entityId: number, file: File, category: string, uploadedBy: string, departmentId?: number) => {
      const f = new FormData();
      f.append("file", file); f.append("category", category); f.append("uploaded_by", uploadedBy);
      if (departmentId != null) f.append("department_id", String(departmentId));
      return upload<{ ok: boolean; document: Q.DocumentRow }>(`/api/planning/entities/${entityId}/documents`, f);
    },
    deleteDocument: (docId: number) => request<{ ok: boolean }>(`/api/planning/documents/${docId}`, { method: "DELETE" }),
    documentDownloadUrl: (docId: number) => `${BASE}/api/planning/documents/${docId}/download`,
    // calendar + report exports
    calendar: (entityId: number) => request<Q.CalendarPayload>(`/api/planning/entities/${entityId}/calendar`),
    entityReportCsvUrl: (entityId: number) => `${BASE}/api/planning/entities/${entityId}/report/export.csv`,
    govReportCsvUrl: (scenario = "base") => `${BASE}/api/planning/dghr/report/export.csv?scenario=${scenario}`,
    alerts: () => request<Q.AlertsPayload>("/api/planning/dghr/alerts"),
    pipeline: (entityId?: number) => request<Q.PipelinePayload>(`/api/planning/pipeline${entityId != null ? `?entity_id=${entityId}` : ""}`),
    entityReminders: (entityId: number) => request<Q.RemindersPayload>(`/api/planning/entities/${entityId}/reminders`),
    projection: (entityId: number, scenario = "base") => request<Q.Projection>(`/api/planning/entities/${entityId}/projection?scenario=${scenario}`),
    // DGHR
    government: (scenario = "base", basis: Q.BasisKey = "received") =>
      request<Q.GovPayload>(`/api/planning/dghr/government?scenario=${scenario}&basis=${basis}`),
    dghrEntities: () => request<{ entities: Q.GovEntityRow[] }>("/api/planning/dghr/entities"),
    govHumanCapital: (basis: Q.BasisKey = "received", filters?: Q.HcFilterSel) => {
      const p = new URLSearchParams({ basis });
      if (filters?.entity_id != null) p.set("entity_id", String(filters.entity_id));
      if (filters?.job_level) p.set("job_level", filters.job_level);
      if (filters?.dim) p.set("dim", filters.dim);
      if (filters?.bucket) p.set("bucket", filters.bucket);
      return request<Q.GovHumanCapital>(`/api/planning/dghr/human-capital?${p.toString()}`);
    },
    hcFilters: () => request<Q.HcFilterOptions>("/api/planning/dghr/hc-filters"),
    govProjection: (scenario = "base", basis: Q.BasisKey = "received") =>
      request<Q.Projection>(`/api/planning/dghr/projection?scenario=${scenario}&basis=${basis}`),
    // ── executive analytics dashboards (entity optional — omit for government-wide) ──
    analyticsHumanCapital: (basis: Q.BasisKey = "received", scenario = "base", entityId?: number) =>
      request<Q.HcOverviewPayload>(`/api/planning/dghr/analytics/human-capital?basis=${basis}&scenario=${scenario}${entityId != null ? `&entity_id=${entityId}` : ""}`),
    analyticsDemand: (basis: Q.BasisKey = "received", scenario = "base", entityId?: number) =>
      request<Q.DemandPayload>(`/api/planning/dghr/analytics/demand?basis=${basis}&scenario=${scenario}${entityId != null ? `&entity_id=${entityId}` : ""}`),
    analyticsSupply: (basis: Q.BasisKey = "received", scenario = "base", entityId?: number) =>
      request<Q.SupplyPayload>(`/api/planning/dghr/analytics/supply?basis=${basis}&scenario=${scenario}${entityId != null ? `&entity_id=${entityId}` : ""}`),
    // ── cross-entity comparison (up to 5 entities; extras beyond 5 ignored server-side) ──
    analyticsEntityComparison: (entityIds: number[], basis: Q.BasisKey = "received", scenario = "base") =>
      request<Q.EntityComparisonPayload>(`/api/planning/dghr/analytics/entity-comparison?entity_ids=${entityIds.join(",")}&basis=${basis}&scenario=${scenario}`),
    entityComparisonCsvUrl: (entityIds: number[], basis: Q.BasisKey = "received", scenario = "base") =>
      `${BASE}/api/planning/dghr/report/entity-comparison.csv?entity_ids=${entityIds.join(",")}&basis=${basis}&scenario=${scenario}`,
    dghrEntity: (id: number) => request<Q.DepartmentsPayload>(`/api/planning/dghr/entities/${id}`),
    dghrSubmission: (subId: number) => request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}`),
    reviewers: () => request<{ reviewers: Q.Reviewer[] }>("/api/planning/dghr/reviewers"),
    // ── two-stage sign-off ──
    recommend: (subId: number, body: { note: string; actor_id: number }) =>
      request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}/recommend`, { method: "POST", body: JSON.stringify(body) }),
    approve: (subId: number, body: { note: string; actor_id: number; conditions?: string[] }) =>
      request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}/approve`, { method: "POST", body: JSON.stringify(body) }),
    reject: (subId: number, body: { note: string; actor_id: number }) =>
      request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}/reject`, { method: "POST", body: JSON.stringify(body) }),
    decideElement: (subId: number, body: { element_type: string; element_key: string; element_label?: string; decision: Q.ElementDecision; note?: string; actor_id: number }) =>
      request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}/elements/decide`, { method: "POST", body: JSON.stringify(body) }),
    clarify: (subId: number, body: { element_type: string; element_id?: number | null; element_key?: string; element_label?: string; message: string; actor_id: number }) =>
      request<Q.SubmissionPayload>(`/api/planning/dghr/submissions/${subId}/clarify`, { method: "POST", body: JSON.stringify(body) }),
    reply: (subId: number, clarId: number, message: string) =>
      request<Q.SubmissionPayload>(`/api/planning/submissions/${subId}/clarifications/${clarId}/reply`, { method: "POST", body: JSON.stringify({ message }) }),
    // ── versions ──
    revise: (subId: number) => request<Q.SubmissionPayload>(`/api/planning/submissions/${subId}/revise`, { method: "POST" }),
    championVerify: (subId: number) => request<Q.SubmissionPayload>(`/api/planning/submissions/${subId}/champion-verify`, { method: "POST" }),
    history: (deptId: number) => request<Q.SubmissionHistory>(`/api/planning/departments/${deptId}/history`),
    diff: (subId: number, against?: number) =>
      request<Q.SubmissionDiff>(`/api/planning/submissions/${subId}/diff${against ? `?against=${against}` : ""}`),
    clarificationQueue: () => request<Q.ClarificationQueue>("/api/planning/dghr/clarification-queue"),
    smartAssist: (text: string) => request<Q.SmartAssistResult>("/api/planning/smart-assist", { method: "POST", body: JSON.stringify({ text }) }),

    // ── calculation traceability ──
    // Built on demand from the same engine that produced the number, so a trace can never describe
    // a different calculation from the one on screen.
    trace: (kind: Q.TraceKind, refId: number, scenario = "base", basis: Q.BasisKey = "received") =>
      request<Q.CalcTrace>(
        `/api/planning/trace/${kind}/${refId}?scenario=${scenario}&basis=${basis}`,
      ),
    overrideDriver: (driverId: number, body: Q.OverrideBody) =>
      request<Q.CalcTrace>(`/api/planning/trace/driver/${driverId}/override`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    revokeOverride: (overrideId: number) =>
      request<Q.CalcTrace>(`/api/planning/trace/override/${overrideId}`, { method: "DELETE" }),
    methodRegistry: () => request<Q.MethodRegistry>("/api/planning/method/registry"),

    // Cycle & administration. `cycle()` reports the current (open, else latest) cycle plus live
    // government-wide counts; `cycles()` is the full history the selector reads.
    cycle: () => request<Q.CyclePayload>("/api/planning/cycle"),
    cycles: () => request<Q.CyclesPayload>("/api/planning/cycles"),
    cyclesHistory: () => request<Q.CyclesHistoryPayload>("/api/planning/cycles/history"),
    createCycle: (body: { name: string; starts_on: string; ends_on: string; deadline: string; auto_close?: boolean; scope_mode?: string; scope_entity_ids?: number[] }) =>
      request<Q.CycleSummary>("/api/planning/cycles", { method: "POST", body: JSON.stringify(body) }),
    openCycle: (id: number, actor_name = "DGHR Admin") =>
      request<Q.CycleSummary>(`/api/planning/cycles/${id}/open`, { method: "POST", body: JSON.stringify({ actor_name }) }),
    closeCycle: (id: number, actor_name = "DGHR Admin") =>
      request<Q.CycleSummary>(`/api/planning/cycles/${id}/close`, { method: "POST", body: JSON.stringify({ actor_name }) }),
    setCycleScope: (id: number, body: { scope_mode: "all" | "selected"; scope_entity_ids?: number[] }) =>
      request<Q.CycleSummary>(`/api/planning/cycles/${id}/scope`, { method: "PUT", body: JSON.stringify(body) }),
    cloneCycle: (id: number) => request<Q.CycleSummary>(`/api/planning/cycles/${id}/clone`, { method: "POST", body: JSON.stringify({}) }),
    grantExtension: (id: number, body: { entity_id: number; extended_deadline: string; reason?: string }) =>
      request<Q.CycleSummary>(`/api/planning/cycles/${id}/extensions`, { method: "POST", body: JSON.stringify(body) }),
    revokeExtension: (id: number, extId: number) =>
      request<Q.CycleSummary>(`/api/planning/cycles/${id}/extensions/${extId}`, { method: "DELETE" }),
    remind: () => request<{ ok: boolean; reminded: number }>("/api/planning/dghr/remind", { method: "POST" }),
  },
};
