// TypeScript mirror of the Pydantic/response shapes (SPEC §8/§17).
// Phase 0 covers the command-center + notifications payloads; expanded per phase.

export type PackageStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "returned"
  | "approved";

export interface CommandCenterKpis {
  total_entities: number;
  submissions_received: { value: number; pct: number };
  missing_data: number;
  validation_ready: number;
  overdue_items: number;
  overall_progress: { pct: number; received: number; total: number };
}

export interface DonutSegment {
  status: string;
  label: string;
  count: number;
  pct: number;
}

export interface ActionQueueItem {
  id: number;
  name: string;
  code: string;
  status: PackageStatus;
  completeness: number;
  quality_score: number | null;
  due_date: string | null;
  overdue: boolean;
  next_action: string;
}

export interface MissingSummaryItem {
  key: string;
  label: string;
  count: number;
}

export interface AlertItem {
  severity: "danger" | "warning" | "info";
  title: string;
  body: string;
  created_at: string | null;
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface CommandCenterPayload {
  kpis: CommandCenterKpis;
  status_donut: { total: number; segments: DonutSegment[] };
  actions_queue: {
    items: ActionQueueItem[];
    page: number;
    page_size: number;
    total: number;
  };
  forecasting: {
    ready: number;
    ready_pct: number;
    blocked: number;
    blocked_pct: number;
  };
  missing_summary: MissingSummaryItem[];
  alerts: AlertItem[];
  trend: TrendPoint[];
}

export interface NotificationItem {
  id: number;
  audience: "dghr" | "entity";
  entity_id: number | null;
  kind: "clarification" | "announcement" | "reminder" | "status" | "ai_flag";
  title: string;
  body: string;
  created_at: string | null;
  read: boolean;
}

export interface NotificationList {
  items: NotificationItem[];
  unread: number;
}

export interface NotificationPoll {
  new: NotificationItem[];
  unread: number;
  server_time: string;
}

// ─────────────── Tracker (screen 03) ───────────────
export interface TrackerRow {
  id: number;
  name: string;
  code: string;
  wave: string;
  packages: Record<string, number | null>;
  completeness: number;
  status: PackageStatus;
  status_label: string;
  reviewer: string | null;
  reviewer_initials: string | null;
  due_date: string | null;
  overdue: boolean;
}
export interface TrackerPayload {
  kpis: {
    total_entities: number;
    submitted_entities: { value: number; pct: number };
    returned_entities: { value: number; pct: number };
    overdue: { value: number; pct: number };
    avg_completeness: number;
  };
  columns: string[];
  rows: TrackerRow[];
  page: number;
  page_size: number;
  total: number;
  reviewers: string[];
}
export interface BlockedSummary {
  items: { key: string; label: string; count: number; pct: number | null }[];
  total: number;
}
export interface Followups {
  overdue: number;
  returned: number;
  low_completeness: number;
  unassigned: number;
}

// ─────────────── Config (screen 02) ───────────────
export interface ConfigPackage {
  id: number;
  key: string;
  position: number;
  name: string;
  description: string;
  total_fields: number;
  mandatory_fields: number;
  optional_fields: number;
  mandatory_enabled: boolean;
  evidence_required: "yes" | "optional";
  evidence_fields_label: string;
  status: string;
  icon_key: string;
  section_types: string[];
  field_groups: { name: string; field_count: number }[];
}
export interface ConfigPayload {
  cycle: {
    name: string;
    status: string;
    starts_on: string;
    ends_on: string;
    deadline: string;
    days_remaining: number;
    version_label: string;
    late_policy: string;
    reviewer_rule: string;
    reminders_label: string;
    approval_workflow_label: string;
  };
  kpis: {
    data_packages: number;
    total_fields: number;
    mandatory_fields: number;
    optional_fields: number;
    section_types: number;
    deadline: string;
    days_remaining: number;
  };
  packages: ConfigPackage[];
  section_types: { name: string; description: string; active: boolean }[];
}

// ─────────────── Quality (screen 04) ───────────────
export interface QualityIssue {
  id: number;
  issue_type: string;
  entity: string;
  severity: "High" | "Medium" | "Low";
  package_key: string;
  ai_confidence: number;
  status: string;
  next_action: string;
  assigned_to: string | null;
}
export interface QualityAnomaly {
  id: number;
  title: string;
  entity: string;
  package_key: string;
  severity: string;
  confidence: number;
  has_narrative: boolean;
}
export interface QualityPayload {
  kpis: {
    avg_quality: number;
    avg_quality_delta: string;
    entities_with_issues: number;
    rules_passed: number;
    rules_pass_rate: number;
    missing_mandatory: { count: number; entities: number };
    duplicate_titles: { count: number; entities: number };
    ready_for_review: number;
  };
  issues: { items: QualityIssue[]; page: number; page_size: number; total: number };
  quality_bars: { name: string; value: number; highlight: boolean }[];
  rule_stats: { category: string; passed: number; failed: number; pass_rate: number }[];
  anomalies: QualityAnomaly[];
  evidence_overview: { key: string; label: string; count: number; entities: number; pct: number }[];
  top_gaps: { label: string; count: number }[];
}

// ─────────────── Entity detail drawer (§9.7) ───────────────
export interface EntityDetail {
  id: number;
  name: string;
  code: string;
  wave: string;
  status: PackageStatus;
  status_label: string;
  completeness: number;
  quality_score: number | null;
  overdue: boolean;
  due_date: string | null;
  reviewer: string | null;
  forecasting_ready: boolean;
  blocked_reason: string | null;
  packages: { name: string; key: string; status: PackageStatus; progress: number }[];
  open_cases: { ref: string; kind: string; priority: string; status: string }[];
  audit: { label: string; actor_name: string; created_at: string | null }[];
}
