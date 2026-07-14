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
