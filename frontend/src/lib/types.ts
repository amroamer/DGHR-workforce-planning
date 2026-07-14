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
  entity_id: number;
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

// ─────────────── Entity portal (screens 06–10, 10.7) ───────────────
export interface EntityHome {
  entity: { name: string; code: string };
  kpis: {
    submission_progress: number;
    required_packages: number;
    pending_clarifications: number;
    days_to_deadline: number;
    deadline_date: string | null;
    ready_for_review: number;
  };
  required_submissions: {
    position: number;
    key: string;
    name: string;
    description: string;
    route: string;
    status: PackageStatus;
    status_label: string;
    progress: number;
    action: "View" | "Continue" | "Start";
  }[];
  messages: {
    id: number;
    kind: string;
    title: string;
    body: string;
    created_at: string | null;
    read: boolean;
  }[];
  deadlines: { label: string; date: string; days_left: number }[];
}

export interface OrgSectionRow {
  id: number;
  sector: string;
  department: string;
  name: string;
  owner_name: string | null;
  owner_initials: string | null;
  hr_focal_point: string | null;
  in_scope: boolean;
  employee_count: number | null;
  status: "mapped" | "unmapped" | "partial" | "not_in_scope";
}
export interface OrgStructure {
  entity: { name: string; code: string };
  kpis: { sectors: number; departments: number; sections: number; unmapped: number; completeness: number };
  tree: {
    name: string;
    status: string;
    departments: { name: string; status: string; sections: { id: number; name: string; status: string }[] }[];
  }[];
  sections: { columns: string[]; rows: OrgSectionRow[]; page: number; page_size: number; total: number };
  sectors: string[];
  departments: string[];
  rules: string[];
  alerts: { label: string; count: number }[];
  comments: { author_name: string; author_role: string; body: string; created_at: string | null }[];
}

export interface WorkforceRecordRow {
  id: number;
  section: string;
  job_title: string;
  job_family: string | null;
  grade: number | null;
  current_fte: number;
  vacancies: number;
  employment_type: string | null;
  critical_role: boolean;
  map_status: "mapped" | "partial" | "unmapped";
}
export interface WorkforcePayload {
  entity: { name: string; code: string };
  kpis: {
    imported_records: number;
    mapped_titles: { count: number; pct: number };
    open_issues: number;
    vacancies: { count: number; pct: number };
    completeness: number;
  };
  mapping_summary: { key: string; label: string; count: number; pct: number }[];
  validation_summary: { label: string; count: number }[];
  records: { rows: WorkforceRecordRow[]; page: number; page_size: number; total: number };
  sections: string[];
  upload: { filename: string; uploaded_at: string | null; uploaded_by: string };
}

export interface WorkloadPayload {
  entity: { name: string; code: string };
  kpis: {
    sections_covered: { value: number; total: number };
    workload_metrics: number;
    missing_drivers: number;
    avg_completeness: number;
  };
  rows: {
    id: number;
    name: string;
    metrics_count: number;
    service_type: string;
    key_metric: string;
    current_volume: number | null;
    unit: string;
    trend: { pct: number; delta: number };
    monthly_pattern: number[];
    peak_label: string;
    complexity: string;
    source_system: string;
    status: string;
  }[];
  coverage: { average: number; items: { name: string; value: number }[] };
}

export interface DriversPayload {
  entity: { name: string; code: string };
  kpis: {
    strategic_initiatives: number;
    automation_impacts: number;
    policy_changes: number;
    evidence_documents: number;
    outstanding_gaps: number;
    evidence_coverage: number;
  };
  drivers: { id: number; category: string; description: string; impact: string; horizon: string; status: string }[];
  evidence: { id: number; filename: string; source_org: string; linked_label: string; quality: string; uploaded_at: string | null }[];
  evidence_total: number;
  comments: { author_name: string; author_role: string; body: string; related_label: string | null }[];
}

export interface MySubmissions {
  entity: { name: string; code: string };
  rows: {
    key: string;
    name: string;
    status: PackageStatus;
    status_label: string;
    progress: number;
    updated_at: string | null;
    comments: number;
    route: string;
    action: string;
  }[];
}

// ─────────────── Cases / Clarifications (§9.6, §10.6) ───────────────
export interface CaseSummary {
  id: number;
  ref: string;
  kind: "clarification" | "return";
  entity_id: number;
  entity: string;
  package_label: string;
  priority: "High" | "Medium" | "Low";
  category: string;
  status: "open" | "responded" | "resolved";
  issue_summary: string;
  due_date: string | null;
  returned_on: string | null;
  resolved_on: string | null;
  created_at: string | null;
  updated_at: string | null;
}
export interface CaseMessage {
  id: number;
  side: "dghr" | "entity";
  author: string;
  author_role: string;
  body: string;
  created_at: string | null;
}
export interface CaseDetail extends CaseSummary {
  assigned_to: string | null;
  corrections: string[];
  sla_days: number | null;
  messages: CaseMessage[];
  audit: { label: string; actor_name: string; created_at: string | null }[];
  evidence: { filename: string; quality: string; linked_label: string }[];
  entity_name: string;
}
export interface CasesList {
  counts: { all: number; open: number; returned: number; resolved: number };
  groups: {
    open_clarifications: CaseSummary[];
    returned_submissions: CaseSummary[];
    resolved: CaseSummary[];
  };
  all: CaseSummary[];
}
export interface ClarificationsKpis {
  open_clarifications: number;
  returned_submissions: number;
  avg_response_time: number;
  overdue_responses: number;
  resolved_items: number;
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
