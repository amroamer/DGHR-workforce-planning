// Planning department + sizing types (mirror backend app/routers/planning.py + services/sizing.py).

export type Family = "demand" | "ratio" | "coverage" | "project" | "mandate";

export interface DriverParams {
  minutes_per_unit?: number;
  productive_hours?: number;
  quality_allowance?: number;
  serving_ratio?: number;
  shifts?: number;
  relief_factor?: number;
  team_size?: number;
  fte_override?: number;
}

export interface DriverTemplate { name: string; unit: string; family: Family; params: DriverParams }
export interface QTypeset { id: number; key: string; name: string; primary_family: Family; default_drivers: DriverTemplate[] }

export interface SizedDriver {
  id: number; element_key?: string; name: string; unit: string; family: Family;
  volume: number; forecast: number; source?: string; params: DriverParams; fte: number;
  fte_raw?: number;
  /** Per-period FTE. `fte` (and fte_current) size from `volume`; fte_forecast from `forecast`. */
  fte_current?: number;
  fte_forecast?: number;
  overridden?: boolean;
  /** False when the entity stated no forecast — the period is assumed flat, and must say so. */
  forecast_stated?: boolean;
}

/** A period a Required FTE can state. Without this, "Required FTE" is ambiguous: the headline sizes
 *  from the reported volume, but nothing said so and the forecast appeared to do nothing. */
export interface SizedMeasure {
  key: string; label: string; short_label: string;
  value: number; derived: boolean;
  period_note: string; description: string; source: string;
  build_up?: number | null; volume_field?: string;
  display?: string; calculation?: string; assumed_flat?: boolean; volume?: number;
}
export interface Mandate { id: number; role: string; legal_basis: string; positions: number }
export interface FamilySplit { family: Family; fte: number; binds?: boolean }

export interface Sizing {
  submission_id: number; status: string; build_up: number; floor_total: number; floor_binds: boolean;
  /** The CURRENT-period figure (sized from reported 12-month volumes). */
  required_fte: number; current_fte: number; gap: number;
  measures?: SizedMeasure[];
  forecast_required_fte?: number;
  planning_change?: number;
  forecast_stated?: boolean;
  drivers: SizedDriver[]; mandates: Mandate[]; family_split: FamilySplit[];
  flags?: string[]; scenario?: string;
}

export interface Clarification {
  id: number; element_type: string; element_id: number | null; element_key: string; element_label: string;
  message: string; author: string; side: "dghr" | "entity"; status: string; parent_id: number | null;
  created_at: string | null; resolved_at: string | null; resolved_by_name: string;
  // Derived ageing — never stored. `level` climbs open → due_soon → overdue → escalated.
  days_open: number; level: "open" | "due_soon" | "overdue" | "escalated"; days_over: number;
  sla_days: number; escalate_after: number;
}

// ── review workflow: versions, two-stage sign-off, element decisions ──
export type ElementDecision = "approved" | "queried";
export interface ReviewElement {
  element_type: string; element_key: string; element_label: string; element_id: number | null;
  decision: ElementDecision | null; note: string; actor: string; decided_at: string | null;
}
export interface ReviewState {
  elements: ReviewElement[]; total: number; approved: number; queried: number; undecided: number;
  // The gate: a submission may only be recommended once every element is approved.
  all_approved: boolean; partial: boolean;
}
export interface VersionRef {
  id: number; version: number; status: string; submitted_at: string | null; decided_at: string | null;
}
export interface DiffChange {
  kind: string; element: string; field: string; change: "changed" | "added" | "removed";
  before: string; after: string;
}
export interface SubmissionDiff {
  from_version: number; to_version: number; from_submission_id: number; to_submission_id: number;
  changes: DiffChange[]; total: number; unchanged: boolean;
}
export interface HistoryEvent {
  at: string | null; verb: string; version: number; actor: string; title: string; detail: string;
}
export interface SubmissionHistory {
  department_id: number;
  versions: (VersionRef & { supersedes_id: number | null; created_at: string | null;
    submitted_by: string; decided_by: string; recommended_by: string; conditions: string[] })[];
  events: HistoryEvent[]; total: number;
}
export interface Reviewer { id: number; name: string; initials: string; role: string }
export interface QueuedClarification {
  id: number; submission_id: number; entity_id: number | null; entity: string;
  department_id: number | null; department: string; element_label: string; message: string;
  author: string; days_open: number; level: "open" | "due_soon" | "overdue" | "escalated";
  days_over: number; sla_days: number; escalate_after: number;
}
export interface ClarificationQueue {
  clarifications: QueuedClarification[]; total: number;
  by_level: Record<string, number>; sla_days: number; escalate_after: number;
}

export interface SubmissionPayload {
  id: number; status: string; notes: string;
  // ── version chain ──
  version: number; supersedes_id: number | null; superseded_by_id: number | null;
  is_latest: boolean; editable: boolean; frozen_reason: string;
  versions: VersionRef[];
  // ── who said what ──
  submitted_at: string | null; submitted_by: string;
  attested: boolean; attested_by: string; attested_at: string | null; attestation_text: string;
  champion_verified_at: string | null; champion_verified_by: string;
  documents: DocumentRow[];
  recommendation: string; recommendation_note: string; recommended_at: string | null;
  recommended_by: string; recommended_by_id: number | null;
  decided_at: string | null; decided_by: string; decided_by_id: number | null;
  conditions: string[]; decision_note: string;
  // ── element-by-element review ──
  review: ReviewState;
  diff: SubmissionDiff | null;
  department: { id: number; name: string; current_fte: number; approved_positions: number; typeset_id: number | null; typeset: string | null } | null;
  entity: { id: number; name: string; code: string; champion_name?: string | null } | null;
  window?: SubmissionWindow;
  sizing: Sizing;
  workforce: WorkforceSummary;
  supply: Supply;
  sibling_departments: { id: number; name: string }[];
  adjustment_kinds: { key: AdjustmentKind; label: string; sign: number }[];
  projection: Projection;
  clarifications: Clarification[];
}

// ── Supply: establishment / people / non-establishment capacity ──
// These used to be one number (headcount was literally the department's FTE, rounded). They are
// three different questions and the UI must never let one label stand in for another:
//   approved_positions  posts authorised on paper
//   filled_positions    posts with a person in them (= headcount = actual employees)
//   vacancies           approved − filled, always DERIVED
//   establishment_fte   the TIME those people give; below headcount wherever part-timers sit
//   available_fte       establishment_fte + net adjustments — what the gap measures against
export type AdjustmentKind = "secondment_in" | "secondment_out" | "contractor" | "temporary" | "outsourced";

export interface Adjustment {
  id: number; kind: AdjustmentKind; label: string; kind_label: string;
  fte: number;
  /** What it does to supply: negative for a loan out, exactly 0 when excluded. Never re-derive. */
  signed_fte: number;
  headcount: number;
  starts_on: string | null; ends_on: string | null;
  source_department_id: number | null; source_department?: string | null;
  receiving_department_id: number | null; receiving_department?: string | null;
  counts_in_supply: boolean;
  /** Is today inside the stated window? Counted-but-inactive raises a flag rather than a silent fix. */
  active: boolean;
  note: string;
}
export interface AdjustmentByKind {
  kind: AdjustmentKind; label: string; count: number; fte: number; signed_fte: number; headcount: number;
}
export interface Supply {
  approved_positions: number; filled_positions: number; vacancies: number; vacancy_pct: number;
  headcount: number; establishment_fte: number; part_time_fte_gap: number;
  adjustments: Adjustment[]; by_kind: AdjustmentByKind[]; net_adjustment_fte: number;
  available_fte: number; flags: string[]; has_data: boolean;
  departments_counted?: number;
}
export interface AdjustmentInput {
  kind: AdjustmentKind; label?: string; fte: number; headcount?: number;
  starts_on?: string | null; ends_on?: string | null;
  source_department_id?: number | null; receiving_department_id?: number | null;
  counts_in_supply: boolean; note?: string;
}

// ── Human Capital (workforce demographics) ──
export type JobLevelKey = "managers" | "professionals" | "associate_professionals" | "clerical_support";
export interface WorkforceLevel {
  key: string; label: string; headcount: number; fte: number; emirati_count: number; cost: number;
  pct: number; emiratization_pct: number;
}
export interface WorkforceRowInput {
  job_level: string; headcount: number; fte?: number; emirati_count: number; annual_cost_aed?: number;
}
// S3: the per-position breakdown (role, grade band, headcount). S5: structural roles + tenure.
export interface PositionRow { role: string; grade_band: string; job_level: string; seniority: string; structural: boolean; headcount: number }
export interface StructuralRoles { count: number; by_role: { role: string; headcount: number }[] }
export interface TenureBucket { bucket: string; label: string; headcount: number; pct: number }

export interface WorkforceSummary {
  /** PEOPLE. */
  headcount: number;
  /** TIME. Below headcount wherever part-timers sit — that difference is `part_time_fte_gap`. */
  fte: number;
  part_time_fte_gap: number;
  emirati_count: number; emiratization_pct: number;
  annual_cost_aed: number; cost_per_head: number; cost_per_fte: number;
  by_level: WorkforceLevel[];
  has_data?: boolean;
  rows?: { id: number; job_level: string; label: string; headcount: number; fte: number; emirati_count: number; annual_cost_aed: number }[];
  /** Demographic distributions (gender/age/grade/region/nationality) behind the HC Overview donuts. */
  bands?: BandGroup[];
  /** S3: per-position breakdown for a single submission. */
  positions?: PositionRow[];
  /** S5/S9: structurally-driven roles count + the tenure distribution. */
  structural_roles?: StructuralRoles;
  tenure?: TenureBucket[];
}
export interface EntityHumanCapital extends WorkforceSummary {
  entity_id: number; entity?: { id: number; name: string; code: string };
  departments: { department_id: number; name: string; status: string; headcount: number; fte: number; emiratization_pct: number; annual_cost_aed: number }[];
  departments_counted: number;
  supply: Supply;
}
export interface GovHumanCapital extends WorkforceSummary {
  entities: { entity_id: number; name: string; code: string; headcount: number; fte: number; emiratization_pct: number; annual_cost_aed: number; approved_positions: number; vacancies: number; available_fte: number }[];
  departments_counted?: number; basis?: string;
  supply: Supply;
}

// ── documents (real files on the uploads volume) ──
export interface DocumentRow {
  id: number; filename: string; category: string; department_id?: number | null;
  uploaded_by: string; uploaded_at: string | null; size_bytes: number; missing: boolean;
  scope?: "department" | "entity";
}
export interface DocumentsPayload { documents: DocumentRow[]; total: number; total_bytes: number }

// ── calendar (cycle milestones + submission events) ──
export interface CalendarEvent { date: string; kind: string; title: string; detail: string; department_id?: number }
export interface CalendarPayload {
  cycle: { name: string; starts_on: string; ends_on: string; deadline: string; status: string } | null;
  events: CalendarEvent[]; departments_total: number; departments_outstanding: number;
}

// ── DGHR alerts (flags raised by the sizing engine) ──
export interface AlertRow {
  submission_id: number; status: string; entity_id: number | null; entity: string;
  department_id: number | null; department: string; flags: string[];
  required_fte: number; current_fte: number; gap: number; variance_pct: number;
  recommended_action?: string;
  submitted_at?: string | null; submitted_by?: string; reviewed_by?: string; champion?: string | null;
}
export interface AlertsPayload { alerts: AlertRow[]; total: number; by_flag: { flag: string; count: number }[] }

// ── AI agents ──
// #1 Submission pre-review: a verdict + drafted question per reviewable element, plus the overall move.
export interface PreReviewElement {
  element_type: string; element_key: string; element_label: string;
  current_decision: ElementDecision | null; verdict: "approve" | "query"; reason: string; draft: string;
}
export interface PreReviewPayload {
  department: string; entity: string; required_fte: number; available_fte: number; gap: number;
  flags: string[]; elements: PreReviewElement[];
  counts: { approve: number; query: number };
  overall: { action: "recommend" | "clarify"; rationale: string };
  source: string;
}
// #2 Clarification triage: the open queue with a proposed move + drafted message per item.
export interface TriageItem {
  id: number; submission_id: number; entity_id: number | null; entity: string;
  department_id: number | null; department: string; element_label: string; message: string;
  days_open: number; level: "open" | "due_soon" | "overdue" | "escalated";
  action: "remind" | "escalate" | "wait"; draft: string;
}
export interface TriagePayload {
  items: TriageItem[]; counts: { escalate: number; remind: number; wait: number };
  summary: string; source: string;
}
// #3 Data-quality sweep: cross-entity insights computed across every received submission.
export interface QualityInsight {
  kind: string; severity: "high" | "medium" | "low"; title: string; detail: string;
  entities: string[]; count: number;
}
export interface QualitySweepPayload { insights: QualityInsight[]; counted: number; source: string }

// ── submission pipeline (G7) ──
export interface PipelineStage { key: string; label: string; count: number }
export interface PipelineEntity { entity_id: number; name: string; code: string; stages: PipelineStage[]; total: number; received: number; outstanding: number }
export interface PipelinePayload { stages: PipelineStage[]; total: number; received: number; outstanding: number; entities?: PipelineEntity[] }

// ── S1 page-top filters ──
export interface HcFilterSel { entity_id?: number | null; job_level?: string | null; dim?: string | null; bucket?: string | null }
export interface HcFilterOptions {
  entities: { entity_id: number; name: string; code: string }[];
  job_levels: { key: string; label: string }[];
  dimensions: { key: string; label: string; buckets: { bucket: string; label: string }[] }[];
}

// ── reminder receipts (S19) ──
export interface ReminderReceipt { recipient_name: string; recipient_role: string; milestone: number | null; sent_at: string | null; read_at: string | null; read: boolean }
export interface RemindersPayload { reminders: ReminderReceipt[]; total: number; read: number }

// ── smart remark (G6): a number translated into a recommended reviewer action ──
export interface SmartRemark { tone: "clean" | "shortage" | "surplus" | "high_surplus"; label: string; action: string }

// ── multi-year demand–supply projection ──
export interface ProjectionPoint { year: number; demand: number; supply: number; gap: number }
export interface ProjectionAssumptions { demand: string; supply: string; horizon_years: number; note: string; coverage?: string }
export interface Projection {
  points: ProjectionPoint[]; assumptions?: ProjectionAssumptions;
  base_year?: number; years?: number; departments_counted?: number; basis?: string;
  entity?: { id: number; name: string; code: string };
}

export interface DeptRow {
  department_id: number; name: string; typeset_id: number | null; typeset?: string | null;
  submission_id: number | null; status: string; current_fte: number;
  required_fte: number | null; gap: number | null; remark?: SmartRemark | null;
  status_date?: string | null;
}
export interface Totals { current_fte: number; required_fte: number; gap: number; departments: number; family_split: FamilySplit[] }
// The entity's collection window — whether it may edit/submit right now, and why not if it can't.
// Carried on the departments + submission payloads so the UI locks in lockstep with the server.
export interface SubmissionWindow {
  can_submit: boolean; cycle_open: boolean; in_scope: boolean; reason: string;
  cycle: CycleFull | null;
  entity_deadline?: string | null; extended?: boolean; extension_reason?: string;
}
export interface DepartmentsPayload { entity: { id: number; name: string; code: string }; entity_id: number; departments: DeptRow[]; totals: Totals; window?: SubmissionWindow }

export interface SubmissionRow {
  id: number; department_id: number; department: string; typeset_id: number | null; status: string;
  required_fte: number; current_fte: number; gap: number; open_clarifications: number; updated_at: string | null;
  submitted_at?: string | null; days_waiting?: number | null;
}

// ── entity roll-up status ──
// Distinct axis from DepartmentSubmission.status: a department is never "partially submitted", but
// an entity — a container of departments — can be. Reports the entity's weakest link.
export type RollupStatus =
  | "not_started" | "in_progress" | "partially_submitted"
  | "fully_submitted" | "partially_approved" | "fully_approved";

// ── basis: what the government-wide figure is standing on ──
export type BasisKey = "received" | "approved" | "complete" | "estimated";

export interface Coverage {
  basis: BasisKey; label: string; official: boolean; statement: string;
  departments_total: number; departments_received: number; departments_approved: number;
  departments_counted: number; departments_actual: number; departments_estimated: number;
  departments_outstanding: number;
  entities_total: number; entities_complete: number; received_pct: number;
  method?: string;
}

export interface GovEntityRow {
  entity_id: number; name: string; code: string; dept_count: number; received: number;
  approved: number; counted: number; rollup_status: RollupStatus; estimated: boolean;
  current_fte: number; required_fte: number; gap: number; remark?: SmartRemark | null;
}
export interface ByTypesetRow { typeset: string; departments: number; current_fte: number; required_fte: number; gap: number; estimated?: number }
export interface GovPayload {
  totals: Totals; entities: GovEntityRow[]; by_typeset: ByTypesetRow[];
  scenario?: string; scenarios?: { key: string; label: string }[];
  bases?: { key: BasisKey; label: string }[];
  coverage: Coverage; rollup_labels: Record<RollupStatus, string>;
}

export interface SmartAssistResult {
  drivers: { name: string; unit: string; family: Family; volume: number; forecast: number; params: DriverParams }[];
  mandates: { role: string; positions: number }[];
  context: string[];
  source: "ai" | "fallback" | "empty";
}

// ═══════════════════════ executive analytics dashboards ═══════════════════════
// Mirror backend app/services/analytics.py. Every live panel reconciles with the Government Position
// (same basis); illustrative panels come from `market_reference` and are flagged in the UI.
export interface DemographicBucket { bucket: string; label: string; headcount: number; pct: number }
export type Demographics = Record<string, DemographicBucket[]>; // dimension → buckets
export type LevelYear = { year: number } & Record<JobLevelKey, number>;
export interface GapLevelSeries { key: string; label: string; points: ProjectionPoint[] }
export interface MarketRow {
  bucket: string; label: string; value: number | null; value_text: string | null;
  pct_change: number | null; rank: number; scope: string; meta: Record<string, unknown>;
}
export interface AnalyticsScope { kind: "government" | "entity"; entity: { id: number; name: string; code: string } | null; label: string }
export interface AnalyticsBase {
  scope: AnalyticsScope; basis: BasisKey; scenario: string;
  reporting_period: { label: string; year: number };
  scenarios: { key: string; label: string }[];
  bases: { key: BasisKey; label: string }[];
  job_levels: { key: JobLevelKey; label: string }[];
  headcount: number; fte: number; emirati_count: number; emiratization_pct: number;
  annual_cost_aed: number; cost_per_fte: number; by_level: WorkforceLevel[];
  has_data: boolean; departments_counted: number;
}
export interface HcOverviewPayload extends AnalyticsBase {
  employment_series: { year: number; employment: number; target: number }[];
  employment_by_level: LevelYear[];
  employment_target: number; jobs_created: number;
  cost_series: { year: number; cost_aed: number }[];
  emiratization_target_pct: number;
  demographics: Demographics; band_labels: Record<string, string>;
  gap_by_level: GapLevelSeries[];
  supply: Supply; assumptions?: ProjectionAssumptions; totals: Totals;
}
export interface JobCategory { typeset: string; departments: number; current_fte: number; required_fte: number; gap: number; pct: number }
export interface HiringRow { name: string; code: string; need: number; gap: number; required_fte: number }
export interface GrowthRow { typeset: string; required_fte: number; planning_change: number; pct_change: number }
export interface DemandPayload extends AnalyticsBase {
  projected_employment: { year: number; employment: number }[];
  projected_by_level: LevelYear[];
  jobs_created: number;
  region: DemographicBucket[];
  job_categories: JobCategory[];
  top_hiring: HiringRow[];
  growing_declining: GrowthRow[];
  skills: { growing: MarketRow[]; declining: MarketRow[]; breakout: MarketRow[] };
  adjacent_jobs: MarketRow[];
  notable_roles: MarketRow[];
}
export interface SupplyPayload extends AnalyticsBase {
  labor_supply: { year: number; supply: number }[];
  labor_supply_by_level: LevelYear[];
  destination_by_level: { key: string; label: string; pct: number; headcount: number }[];
  assumptions?: ProjectionAssumptions;
  graduates: Record<string, MarketRow>;
  education_level: MarketRow[];
  education_background: MarketRow[];
  university_majors: MarketRow[];
  grad_gender: MarketRow[];
  universities: { local: MarketRow[]; global: MarketRow[] };
  global_hotspots: MarketRow[];
}
// ── Cross-entity comparison report (Executive Dashboards) ──
export interface CmpStructure {
  support_fte: number; core_fte: number; establishment_fte: number;
  corporate_fte: number; it_fte: number; support_share_pct: number | null;
  by_category: { category: string; label: string; fte: number; pct: number }[];
}
export interface CmpEntity {
  id: number; name: string; code: string; logo_url: string | null; wave: string;
  has_workforce_data: boolean;
  structure: CmpStructure;
  level_mix: { key: string; label: string; headcount: number; fte: number; pct: number }[];
}
export interface CmpMetricValue { value: number | null; display: string; rank: number | null }
export interface CmpMetric {
  key: string; label: string; group: string; unit: string; format: string;
  higher_is_better: boolean | null; source: string; description: string;
  benchmark: number | null; values: Record<string, CmpMetricValue>;
}
export interface EntityComparisonPayload {
  basis: BasisKey; scenario: string;
  bases: { key: BasisKey; label: string }[];
  scenarios: { key: string; label: string }[];
  max_entities: number;
  entities: CmpEntity[];
  metrics: CmpMetric[];
  metric_groups: string[];
  category_labels: Record<string, string>;
}

// Demographic-band capture (stepper) + reload payload.
export interface BandBucketInput { bucket: string; label?: string; headcount: number }
export interface BandInput { dimension: string; buckets: BandBucketInput[] }
export interface BandGroup { dimension: string; label: string; buckets: { bucket: string; label: string; headcount: number }[] }
// A cycle's full lifecycle record. starts_on/ends_on/deadline are the PLANNED window; opened_at/
// closed_at are what actually happened. status ∈ draft|open|closed|archived (at most one 'open').
export interface CycleFull {
  id: number; name: string;
  starts_on: string | null; ends_on: string | null; deadline: string | null;
  status: string; auto_close: boolean; reminders_label: string;
  scope_mode: "all" | "selected"; scope_entity_ids: number[] | null;
  opened_at: string | null; opened_by: string;
  closed_at: string | null; closed_by: string;
}
// A per-entity deadline extension within a cycle.
export interface CycleExtensionRow {
  id: number; entity_id: number; entity: string; code: string;
  extended_deadline: string | null; reason: string; granted_by: string;
}
// A cycle row in the history list — the record plus this cycle's own progress (received/approved
// counted against submissions belonging to THIS cycle, so a closed cycle reports its own outcome).
export interface CycleSummary extends CycleFull {
  departments_total: number; received: number; approved: number;
  extensions?: CycleExtensionRow[];
}
export interface CyclesPayload { cycles: CycleSummary[]; current_id: number | null }

// Cross-cycle history: each cycle's outcome (snapshot for closed, live for open) plus the entities
// that finished late in more than one cycle.
export interface CycleHistoryRow extends CycleFull {
  departments_total: number; received: number; approved: number;
  received_pct: number; approved_pct: number; avg_turnaround_days: number;
  late_entity_codes: string[]; ran: boolean;
}
export interface ChronicallyLate { code: string; name: string; cycles_late: number }
export interface CyclesHistoryPayload {
  cycles: CycleHistoryRow[]; chronically_late: ChronicallyLate[]; cycles_run: number;
}

export interface CyclePayload {
  cycle: CycleFull | null;
  departments_total: number; departments_received: number; approved: number;
  departments_outstanding: number; entities: number;
}

export interface DriverInput { name: string; unit: string; family: Family; volume: number; forecast: number; source?: string; params: DriverParams }
export interface MandateInput { role: string; legal_basis: string; positions: number }
export interface SubmissionSave {
  current_fte?: number; approved_positions?: number; notes?: string;
  drivers?: DriverInput[]; mandates?: MandateInput[];
  workforce?: WorkforceRowInput[]; bands?: BandInput[]; adjustments?: AdjustmentInput[];
}

// Live sizing for the stepper — instant feedback while typing.
//
// The arithmetic runs client-side (a round-trip per keystroke would feel broken), but the FORMULAS
// come from the method registry, i.e. the same calc_methods rows the server evaluates and the
// "View calculation" trace explains. Nothing about the method is written here: no expression, no
// productive-hours default, no rounding rule, no family order.
//
// This replaced a hardcoded TypeScript mirror of the engine. That mirror was a correctness bug
// waiting to happen: change a standard in the DB and the stepper would keep showing the old number
// while the server stored — and the trace explained — a different one.
import { applyRounding, evaluate, renderExpression } from "./formula";

const FINAL_ROUNDING_KEY = "sizing.final_rounding";

function methodFor(reg: MethodRegistry | undefined, family: Family): RegistryMethod | undefined {
  return reg?.methods.find((x) => x.family === family);
}

/** Parameter values the formula will read: the method's declared defaults, with the driver's own on
 *  top — the same precedence as the backend's resolved_params. */
function resolveParams(mt: RegistryMethod, params: DriverParams): Record<string, number> {
  const out: Record<string, number> = {};
  for (const spec of mt.param_specs ?? []) out[spec.key] = Number(spec.default) || 0;
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function driverFteRaw(reg: MethodRegistry | undefined, family: Family, volume: number, params: DriverParams): number {
  const p = params || {};
  if (p.fte_override != null) return Number(p.fte_override) || 0;
  const mt = methodFor(reg, family);
  if (!mt) return 0; // registry not loaded yet, or family not configured — never guess a formula
  try {
    return evaluate(mt.expression_raw, { ...resolveParams(mt, p), volume: Number(volume) || 0 });
  } catch {
    // Missing/zero denominator = "cannot size". 0 here, surfaced as a flag — never an invented number.
    return 0;
  }
}

/** One driver's contribution after its family's own rounding. */
export function driverFte(reg: MethodRegistry | undefined, family: Family, volume: number, params: DriverParams): number {
  const mt = methodFor(reg, family);
  const raw = driverFteRaw(reg, family, volume, params);
  return Math.round(mt ? applyRounding(mt.rounding, raw) : raw);
}

/** Largest-remainder apportionment — integer slices sum EXACTLY to `total` (donut == Required). */
function apportion(reg: MethodRegistry | undefined, raw: Record<string, number>, total: number, floorBinds: boolean): FamilySplit[] {
  const keys = Object.keys(raw).filter((k) => raw[k] > 0);
  if (!keys.length || total <= 0) return [];
  const s = keys.reduce((a, k) => a + raw[k], 0);
  const exact: Record<string, number> = {};
  const out: Record<string, number> = {};
  for (const k of keys) { exact[k] = (raw[k] / s) * total; out[k] = Math.floor(exact[k]); }
  const rem = total - keys.reduce((a, k) => a + out[k], 0);
  const order = keys.slice().sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])));
  for (let i = 0; i < rem; i++) out[order[i % order.length]] += 1;
  // Family order follows the registry, so the donut can't drift from the server's ordering.
  const families = (reg?.methods ?? []).map((x) => x.family);
  return families
    .filter((f) => (out[f] ?? 0) > 0)
    .map((f) => ({ family: f, fte: out[f], ...(f === "mandate" && floorBinds ? { binds: true } : {}) }));
}

/** The volume a measure reads for one driver. A forecast of 0 means "not stated", not "no work next
 *  year", so it falls back to the reported volume — mirrors the backend's _driver_volume. */
export function measureVolume(d: DriverInput, volumeField: string): number {
  const v = Number((d as unknown as Record<string, number>)[volumeField] ?? 0) || 0;
  return v > 0 ? v : Number(d.volume) || 0;
}

/** Size one period. Same formulas, same rounding — only the volume column differs. */
function sizeMeasure(reg: MethodRegistry | undefined, drivers: DriverInput[], floor: number,
                     volumeField: string, rule: string) {
  let build = 0;
  const split: Record<string, number> = {};
  const perDriver: number[] = [];
  for (const d of drivers) {
    const mt = methodFor(reg, d.family);
    const raw = driverFteRaw(reg, d.family, measureVolume(d, volumeField), d.params);
    const eff = mt ? applyRounding(mt.rounding, raw) : raw;
    build += eff;
    split[d.family] = (split[d.family] || 0) + eff;
    perDriver.push(eff);
  }
  return { build, split, perDriver, required: applyRounding(rule, Math.max(build, floor)) };
}

export function computeSizing(reg: MethodRegistry | undefined, drivers: DriverInput[], mandates: MandateInput[], currentFte: number) {
  const floor = mandates.reduce((s, mm) => s + (Number(mm.positions) || 0), 0);
  const rule = String(reg?.parameters.find((x) => x.key === FINAL_ROUNDING_KEY)?.value ?? "round_half_up");

  // Size every configured period, not just the reported one. The headline stays the CURRENT figure
  // (what it always was), but the forecast the entity typed now produces a visible number instead of
  // silently doing nothing to the panel they're looking at.
  const sized: Record<string, ReturnType<typeof sizeMeasure>> = {};
  for (const ms of (reg?.measures ?? []).filter((x) => !x.derived)) {
    sized[ms.key] = sizeMeasure(reg, drivers, floor, ms.volume_field, rule);
  }
  const base = sized.current ?? sizeMeasure(reg, drivers, floor, "volume", rule);

  const results: Record<string, number> = {};
  for (const [k, v] of Object.entries(sized)) results[k] = v.required;
  const measures: SizedMeasure[] = [];
  for (const ms of reg?.measures ?? []) {
    let value: number;
    if (ms.derived) {
      try { value = evaluate(ms.expression, results); } catch { continue; }
    } else {
      if (!(ms.key in sized)) continue;
      value = sized[ms.key].required;
    }
    measures.push({
      key: ms.key, label: ms.label, short_label: ms.short_label, value, derived: ms.derived,
      period_note: ms.period_note, description: ms.description, source: ms.source,
      build_up: ms.derived ? null : Math.round(sized[ms.key].build * 100) / 100,
      volume_field: ms.volume_field,
    });
  }

  const build = base.build;
  const split = base.split;
  const required = base.required;
  const cur = applyRounding(rule, Number(currentFte) || 0);
  const floorBinds = floor > build;
  // The split must sum EXACTLY to required. A floor only enters it when it binds (as a top-up);
  // otherwise it contributes nothing to required and is reported separately.
  const rawByFam: Record<string, number> = {};
  for (const f of Object.keys(split)) if (split[f] > 0) rawByFam[f] = split[f];
  if (floorBinds) rawByFam.mandate = (rawByFam.mandate ?? 0) + (floor - build);
  const familySplit = apportion(reg, rawByFam, required, floorBinds);
  const forecastRequired = results.forecast ?? required;
  return {
    required_fte: required, current_fte: cur, gap: cur - required,
    build_up: Math.round(build * 10) / 10, floor_total: floor, floor_binds: floorBinds,
    family_split: familySplit,
    measures,
    forecast_required_fte: forecastRequired,
    planning_change: forecastRequired - required,
    // An entity that stated no forecast is sized flat — the UI must say "assumed flat" rather than
    // let a +0 planning change read as a confident forecast of no growth.
    forecast_stated: drivers.some((d) => (Number(d.forecast) || 0) > 0),
  };
}

export const FAMILY_LABEL: Record<Family, string> = {
  demand: "Demand", ratio: "Ratio", coverage: "Coverage", project: "Project", mandate: "Mandate",
};
/** The formula hint shown under each family chip — read from the registry, never retyped. The old
 *  hardcoded strings ("volume × min ÷ 60 ÷ 1,600 h × quality") were a second copy of the method that
 *  nothing forced to stay true. */
export function familyHint(reg: MethodRegistry | undefined, family: Family): string {
  const mt = reg?.methods.find((x) => x.family === family);
  return mt ? renderExpression(mt.expression_raw) : "";
}

export const FAMILY_COLOR: Record<Family, string> = {
  demand: "#2f6fae", ratio: "#5b8a72", coverage: "#7a5fa0", project: "#c07f2a", mandate: "#b3382c",
};

// Job levels (reference: Managers / Professionals / Associate Professionals / Clerical Support & Below)
export const JOB_LEVELS: { key: JobLevelKey; label: string }[] = [
  { key: "managers", label: "Managers" },
  { key: "professionals", label: "Professionals" },
  { key: "associate_professionals", label: "Associate Professionals" },
  { key: "clerical_support", label: "Clerical Support & Below" },
];
export const LEVEL_LABEL: Record<string, string> = Object.fromEntries(JOB_LEVELS.map((l) => [l.key, l.label]));
export const LEVEL_COLOR: Record<string, string> = {
  managers: "#7a5fa0", professionals: "#2f6fae", associate_professionals: "#2aa0a0", clerical_support: "#c07f2a",
};
export const COST_PER_FTE: Record<string, number> = {
  managers: 620000, professionals: 380000, associate_professionals: 240000, clerical_support: 150000,
};

/** Compact AED formatting: 1_420_000_000 → "AED 1.42B", 340_000_000 → "AED 340M", 1_400_000 → "AED 1.4M". */
export function fmtAED(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `AED ${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `AED ${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `AED ${(v / 1e3).toFixed(0)}K`;
  return `AED ${Math.round(v)}`;
}

// ═══════════════════════ calculation traceability ═══════════════════════
// Mirrors backend app/services/trace.py. Every FTE on screen can resolve to one of these, so a
// reader can get from a government total down to the single value a named person typed.

export type TraceKind = "driver" | "submission" | "entity" | "government";
export type ParamOrigin =
  | "entity_stated"      // the entity supplied it
  | "entity_adjusted"    // the entity deliberately moved off the standard
  | "typeset_standard"   // the typeset's standard, accepted unchanged
  | "method_default"     // nobody set it; the method's declared default applied
  | "parameter";         // a governed engine parameter

export interface TracePerson { name: string; role: string; initials: string }

export interface TraceInput {
  label: string;
  value: number;
  display: string;
  unit: string;
  role: "volume" | "driver" | "department" | "entity";
  source: string;
  source_ref?: { kind: TraceKind; id: number | null };
  entered_by?: TracePerson | null;
  entered_at?: string | null;
  forecast?: number;
  traceable?: boolean;
  overridden?: boolean;
  estimated?: boolean;
  family?: Family;
}

export interface TraceParameter {
  key: string;
  label: string;
  value: number | string;
  display: string;
  unit: string;
  origin: ParamOrigin;
  source: string;
  standard_value?: number | null;
}

export interface TraceStep { label: string; detail: string; note?: string }

export interface TraceOverride {
  id: number;
  field: string;
  calculated_value: number;
  override_value: number;
  delta: number;
  reason: string;
  active: boolean;
  actor: TracePerson | null;
  actor_role: string;
  created_at: string;
}

export interface TraceMethod {
  family?: Family;
  label: string;
  version?: string;
  ref: string;
  expression: string;        // symbolic — "volume × team size"
  expression_raw?: string;   // exactly what the engine evaluated
  substituted: string;       // values in place — "7 × 6"
  description: string;
  source: string;
  effective_from?: string | null;
  owner?: string;
  rounding?: string;
  rounding_note?: string;
  families?: Family[];
}

export interface TraceTypeset {
  key: string; name: string; version: string;
  primary_family: Family; effective_from: string | null; label: string;
}

export interface CalcTrace {
  kind: TraceKind;
  ref_id: number;
  title: string;
  /** Which period the headline result states. */
  measure?: { key: string; label: string; short_label: string; period_note: string; description: string; source: string; volume_field: string } | null;
  measures?: SizedMeasure[];
  forecast_stated?: boolean;
  unavailable?: string;
  context?: {
    department?: string; department_id?: number | null;
    entity?: string; entity_id?: number | null;
    submission_id?: number | null; submission_status?: string;
  };
  result: { value: number; display: string; unit: string };
  method: TraceMethod;
  typeset?: TraceTypeset | null;
  inputs: TraceInput[];
  parameters?: TraceParameter[];
  steps: TraceStep[];
  rounding?: {
    rule: string; label: string; note: string;
    raw: number; raw_display: string; rounded: number;
  };
  scenario?: { key: string; label?: string; factor?: number; note?: string };
  mandates?: Mandate[];
  flags?: string[];
  excluded?: { label: string; reason: string }[];
  coverage?: Record<string, unknown>;
  official?: boolean;
  partial?: boolean;
  overrides?: TraceOverride[];
  provenance?: {
    entered_by?: TracePerson | null; entered_at?: string | null;
    submitted_by?: TracePerson | null; submitted_at?: string | null;
    decided_by?: TracePerson | null; decided_at?: string | null;
  };
  calculated_at: string;
  inputs_last_changed_at?: string | null;
}

export interface OverrideBody {
  value: number;
  reason: string;
  actor_name: string;
  actor_role: string;
}

export interface MethodSpec {
  key: string; label: string; unit: string; default: number;
}
export interface RegistryMethod {
  family: Family; label: string; version: string; ref: string;
  expression: string; expression_raw: string; description: string; source: string;
  rounding: string; rounding_note: string; effective_from: string | null;
  owner: string; param_specs: MethodSpec[];
}
export interface RegistryParameter {
  key: string; label: string; value: number | string; unit: string;
  description: string; source: string; owner: string; effective_from: string | null;
}
export interface RegistryScenario {
  key: string; label: string; note: string; factors: Record<string, number>;
}
/** The published method — every formula/parameter/scenario the engine will apply, from the rows it
 *  reads. Lets the methodology be inspected rather than merely described. */
export interface RegistryMeasure {
  key: string; label: string; short_label: string;
  volume_field: string; expression: string;
  description: string; period_note: string; source: string; derived: boolean;
}
export interface MethodRegistry {
  methods: RegistryMethod[];
  parameters: RegistryParameter[];
  scenarios: RegistryScenario[];
  measures: RegistryMeasure[];
}
