# DGHR Workforce Planning Portal — MASTER BUILD SPECIFICATION (v2)

> Execute phase by phase (Phase 0 → Phase 5); do not skip ahead. Each phase ends with acceptance criteria that must pass before the next phase begins. Paired with `APPLICATION_CONTEXT.md` (the product brief).

---

## 1. MISSION BRIEF

A **high-impact MVP demo** of the **DGHR Workforce Planning Portal**. Two layers:
- **Layer A — Data Collection & Orchestration Engine** (10 UI mockups): DGHR configures what **59 Dubai Government entities** submit across **8 data packages**; entities submit through guided screens + Excel import; a tracker, rules+AI validation engine, and clarification/resubmission workflow drive everything toward **forecasting readiness**. **This is the MVP and must work end-to-end, live.**
- **Layer B — Planning & Forecasting Engine** (POV deck): **NOT built** — except one read-only teaser screen (§9.5).

**Two portals, one app:**
1. **DGHR Portal** — Command Center, Data Request Configuration, Entity Submission Tracker, Data Quality & Validation, Clarifications & Resubmissions, Forecasting Readiness (teaser).
2. **Entity Portal** — Home, Organization Structure, Current Workforce Data, Workload & Service Data, Future Demand Drivers & Evidence, Clarifications, My Submissions.

**The "wow" (two acts):**
- Act 1 — the closed live loop: entity submits → DGHR Command Center + Tracker update within seconds with a toast; DGHR raises a clarification → entity inbox badge.
- Act 2 — the factory close: the demo ends on **Forecasting Readiness** — real readiness funnel from live data, then a labeled Layer-B preview.

**Non-goals (do NOT build):** auth, RBAC, SSO, user management, email/SMS, multi-tenancy, i18n framework (optional AR toggle Phase 5), a11y audits, mobile below 1280px (target 1440–1920px), any functional Layer B feature.

**Persona switching replaces auth:** avatar-menu switcher toggles DGHR Admin / Dubai Municipality / Dubai Health Authority; swaps shell/sidebar/data scope instantly; persist localStorage. Analyst-model copy rule: clarifications authored by "DGHR Analyst …"; reviewers are analysts; entities are SMEs, never unsupported data-entry clerks.

**Design fidelity:** mockups = visual source of truth for the 11 mockup-backed screens. **Database is the source of truth for every number** — no metric hardcoded in the frontend. §7 defines the single reconciled seed. Precedence: SPEC seed governs MVP renders · POV numbers only in §9.5 (labeled "Illustrative") · POV deck governs vocabulary · surface any new conflict.

**Known mockup corrections (do not "fix back"):** screenshots 07–10 are entity-side screens wrapped in the Entity Portal shell; screenshot 07's org-tree root is the current entity (e.g. "Dubai Municipality"); sidebar items with no MVP screen route to a "Part of the full release" placeholder (§9.8) — no dead links. Exception: Forecasting Readiness is a real screen (§9.5).

---

## 2. LOCKED TECH STACK

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript (strict), Vite, React Router v6, TailwindCSS, shadcn/ui, lucide-react, Recharts, TanStack Query v5, Zustand, sonner, framer-motion (Phase 5) |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, uvicorn, pandas + openpyxl, rapidfuzz, python-multipart, anthropic SDK (optional, §13) |
| Database | PostgreSQL 16 (docker) |
| Infra | docker-compose (postgres + backend + frontend), volume for uploads, `.env` |
| Fonts | Inter (Google Fonts), fallback system-ui |

Frontend ↔ backend via `VITE_API_URL` (default `http://localhost:8000`). CORS enabled. Real-time sync = TanStack Query polling (`refetchInterval` 4000ms) + `/api/notifications/poll` driving bell badges and toasts. No WebSockets.

---

## 3. REPOSITORY LAYOUT

```
dghr-portal/
├── SPEC.md · APPLICATION_CONTEXT.md · CLAUDE.md · docker-compose.yml · .env.example
├── design-reference/            # 10 UI PNGs  +  pov/pov-01..10.png
├── demo-assets/                 # generate_demo_files.py, HR_Extract_Demo.xlsx, evidence/
├── backend/
│   ├── Dockerfile · pyproject.toml · alembic/
│   └── app/
│       ├── main.py · db.py
│       ├── models/ · schemas/
│       ├── routers/   # dghr.py, entity.py, cases.py, imports.py, ai.py, demo.py, notifications.py, readiness.py
│       ├── services/  # kpi.py, workflow.py, import_engine.py, validation.py, ai_service.py, fallbacks.py
│       ├── seed.py    # canonical seed (§7) — idempotent, `python -m app.seed`
│       └── checks.py  # consistency assertions (§7.7) — `python -m app.checks`
└── frontend/src/
    ├── main.tsx · App.tsx · router.tsx
    ├── styles/tokens.css · lib/api.ts · lib/types.ts · stores/persona.ts
    ├── components/ui/ · components/shared/
    ├── pages/dghr/ · pages/entity/
```

---

## 4. DESIGN SYSTEM

### 4.1 Tokens
```
--navy-900: #0B1B3B;  --navy-800: #13284F;
--primary: #2563EB;   --primary-hover: #1D4ED8;
--page-bg: #F5F7FA;   --card-bg: #FFFFFF;   --border: #E6EAF2;
--text-1: #0F172A;    --text-2: #475569;    --text-3: #94A3B8;
--success: #16A34A / bg #E8F7EE;   --warning: #EA8A00 / bg #FEF3E2;
--danger: #E11D48 / bg #FDEBEC;    --info: #0EA5E9 / bg #E7F6FE;
--purple: #7C3AED / bg #F1EAFE;    --teal: #0D9488 / bg #E6F7F4;  (teal = POV AI/vision accent)
```
Card radius 14px, button 10px, badge 999px; card border 1px --border; shadow `0 1px 2px rgba(16,24,40,.04),0 1px 3px rgba(16,24,40,.06)`; page gutter 24–28px; card padding 20–24px.
Type (Inter): page title 28/700; subtitle 14/400 text-2; card title 16/600; KPI value 26/700; KPI label 13/600; sublabel 12 text-3; table header 12/600 text-3; cell 13–14.

### 4.2 App shells (two variants, one AppShell)
Sidebar 232px navy-900 full height: Dubai Government crest (original generic white SVG) + wordmark; portal label (DGHR: "DGHR / Workforce Planning Portal"; Entity: "{Entity} / Government Entity"); nav items 40px (18px icon + 14px label, 80% white, hover navy-800, active = solid primary full-width pill); badge support; bottom user card (DGHR: "DGHR Central Team / Central Engine"; Entity: "Ahmed Al Mansoori / Entity Admin").
DGHR nav (fixed): Command Center, Entities, Data Collection, Submissions, Data Quality, **Forecasting Readiness**, Alerts & AI Flags, Reports, Admin, Knowledge Center. Built: Command Center, Data Collection, Submissions, Data Quality, Forecasting Readiness; Clarifications reached from within (keep Submissions highlighted on /dghr/clarifications). Others → PlaceholderPage.
Entity nav (fixed): Home, My Submissions, Data Collection, Clarifications (badge = open cases), Reports, Documents, Calendar, Help & Support. Built: Home, My Submissions, Clarifications, 4 package screens. Reports/Documents/Calendar/Help → PlaceholderPage.
Page header band (white): title + subtitle; right utility row = search (command palette), NotificationBell (red badge + dropdown + mark-all-read), avatar chip → PersonaSwitcher; second right row = "📅 Last updated: Today, HH:MM AM" + refresh (invalidates queries, bumps timestamp). Dubai skyline watermark (original light-gray SVG, right-aligned, ~6–8% opacity, every page header, both shells).

### 4.3 Core components (Phase 0)
KpiCard (44px tinted icon circle, value, label, sublabel, optional link; ring variant = 56px donut w/ % center). StatusBadge (pill, tinted bg + colored text — mapping below). PctChip (≥80 green, 40–79 orange, <40 red; 100% solid-green text). ProgressBar (6px, blue fill, green at 100%). DataTable (52–56px rows, hover #F8FAFC, divider #EEF2F7, checkbox col, sortable, sticky header, server-side pagination footer, row ⋯). Charts (Recharts): DonutChart, HBarChart (green gradient), TrendLine, Sparkline (90×24), GroupedBarChart (3-series). VisionBadge (teal chip "✨ Layer B Preview · Illustrative" — only on §9.5 cards). EmptyState / PlaceholderPage. DemoPanel (Ctrl+Shift+D). Toasts (sonner): success green; cross-portal blue with entity + action.

StatusBadge mapping (never ad-hoc): Not Started gray · In Progress blue · Submitted green · Under Review purple · Returned orange · Approved green · Overdue red · Open red-tint · Resolved green · Draft blue-outline · Complete green · Missing Data orange · Needs Attention orange · Configured/Active green-soft · Mapped green · Partial orange · Unmapped red · Not in Scope gray · Severity High red/Medium orange/Low gray-blue · Quality High green/Medium orange.

### 4.4 Copy & voice
Static copy on mockup-backed screens = verbatim from mockups. All other copy uses APPLICATION_CONTEXT vocabulary. AI text = insight register (specific, cross-entity, quietly challenging, work-first-not-headcount-first). AI claims bounded by APPLICATION_CONTEXT §11.

### 4.5 Fidelity checklist per screen
Open reference PNG side-by-side; confirm card grid proportions, icon/badge colors, column order/alignment, chart types, footer bars, button hierarchy (primary solid blue / secondary white-border / tertiary blue link →), verbatim copy — before marking done.

---

## 5. DOMAIN MODEL

A Collection Cycle defines 8 Data Packages (mandatory/optional counts, evidence rules, section-type applicability across 7 templates). 59 Entities (waves W1–W3, assigned reviewer/analyst, due date) progress each applicable package through a state machine. Rules engine (7 categories) + AI layer (anomalies, confidence). Problems → Cases (CLF-… clarifications, RTN-… returns) with priority, SLA, thread, audit trail. Every action emits Notifications + Audit Events. Destination = forecasting readiness.

**Package state machine (per entity × package):** not_started → in_progress → submitted → under_review → { returned → in_progress → submitted … } | approved.
**Entity roll-up (derived):** approved if all applicable approved; else returned if any returned; else under_review if any under review and none in progress; else submitted if all applicable submitted; else in_progress if any in progress/submitted; else not_started. overdue is a flag (due_date < today AND status ∉ {approved}), not a status.
**Case lifecycle:** open → responded → resolved. Returns: entity Resubmit → package submitted, case responded; DGHR Accept Resubmission → package under_review/approved, case resolved.

---

## 6. POSTGRESQL SCHEMA (key fields; timestamps everywhere)

```
users(id, name, initials, role[dghr_admin|dghr_analyst|dghr_reviewer|entity_admin|entity_contact], entity_id FK NULL, avatar_color)
entities(id, name, code, wave[W1|W2|W3], reviewer_id FK NULL, due_date, status, overdue bool, completeness int, quality_score int NULL, forecasting_ready bool, blocked_reason text NULL)
collection_cycles(id, name, starts_on, ends_on, deadline, status[active|published|closed], version_label, late_policy, reviewer_rule, reminders_label, approval_workflow_label)
section_types(id, name, description, active bool)
data_packages(id, cycle_id, position, key, name, description, total_fields, mandatory_fields, optional_fields, mandatory_enabled bool, evidence_required[yes|optional], evidence_fields_label, status[configured], icon_key)
package_field_groups(id, package_id, name, field_count)
package_section_types(package_id, section_type_id)
entity_packages(id, entity_id, package_id, applicable bool, status, progress int, updated_at)
org_sections(id, entity_id, sector, department, name, owner_name, owner_initials, hr_focal_point, in_scope bool, employee_count int NULL, status[mapped|unmapped|partial|not_in_scope])
job_families(id, name)
standard_job_titles(id, family_id, title, aliases text[])
workforce_records(id, entity_id, section, job_title, job_family NULL, grade int NULL, current_fte numeric, vacancies numeric, employment_type NULL, critical_role bool, map_status[mapped|partial|unmapped], issues text[])
workload_sections(id, entity_id, name, metrics_count, service_type, key_metric, current_volume int NULL, prev_volume int NULL, unit, complexity, source_system, status[complete|draft|missing_data|overdue], monthly_pattern int[12], peak_label)
demand_drivers(id, entity_id, category, description, impact, horizon, status[in_progress|captured])
evidence_docs(id, entity_id, filename, source_org, linked_driver_id FK NULL, linked_label, quality, uploaded_by, uploaded_at, filepath)
validation_issues(id, entity_id, package_key, issue_type, severity, ai_confidence int, status[open|in_progress|cleared], next_action[Review|Investigate], assigned_to FK NULL)
rule_stats(id, category, passed int, failed int)
anomalies(id, entity_id, title, detail, package_key, severity, confidence int, narrative text NULL)
cases(id, ref, kind[clarification|return], entity_id, package_label, priority, category, status[open|responded|resolved], assigned_to FK, due_date, issue_summary, corrections jsonb[], returned_on date NULL, resolved_on date NULL)
case_messages(id, case_id, author_id FK, side[dghr|entity], body, created_at)
package_comments(id, entity_id, package_key, author_name, author_role, body, related_label NULL, created_at)
audit_events(id, case_id NULL, entity_id NULL, label, actor_name, created_at)
notifications(id, audience[dghr|entity], entity_id NULL, kind[clarification|announcement|reminder|status|ai_flag], title, body, created_at, read bool)
alerts(id, severity[danger|warning|info], title, body, created_at)
uploads(id, entity_id, kind, filename, path, uploaded_by, uploaded_at, meta jsonb)
# Layer-B preview tables (feed ONLY §9.5 vision zone; seeded, labeled Illustrative)
vision_metrics(id, key, label, value_numeric NULL, value_text NULL, unit, grouping)
skills_gap_preview(id, skill, gap_fte int, rank)
scenario_preview(id, scenario[baseline|high_growth|efficiency], headcount int, cost_aed_b numeric, gaps int)
insight_quotes(id, body, tag)
```

**KPI formulas (services/kpi.py; no numeric literals in JSX):**
- Submissions Received = entities status ∈ {submitted, under_review, approved} → 27.
- Overall Collection Progress = 27/59 = 45.8% → shown 46%.
- Entities with Missing Data = entities with ≥1 applicable package progress < 100 flagged critical → 12.
- Validation-Ready / Forecasting-Ready = completeness ≥ 80 AND quality_score ≥ 75 AND status ∈ {submitted, under_review} → 11 (Blocked = 48; 18.6% / 81.4%).
- Overdue Items = overdue flag → 9. Tracker Avg Completeness = mean(completeness) → 72%.
- Quality Avg = mean(quality_score) → 82; Rules Passed = Σ rule_stats.passed = 1,248, pass rate 86.5%.
- "Entities with Issues" = distinct entities with open/in-progress validation issues.

---

## 7. CANONICAL SEED (app/seed.py — idempotent; POST /api/demo/reset re-runs)

All dates relative to runtime `today`: cycle = today−28d → today+17d; deadline = today+11d ("11 days remaining"); entity due dates today−3d → today+21d so exactly 9 overdue; "Last updated" = now.

### 7.1 Entities — 59 total
Waves W1=20, W2=20, W3=19. Status distribution (sums 59): Not Started 12 · In Progress 15 · Submitted 13 · Under Review 6 · Returned 5 · Approved 8. Overdue flag on 9. Completeness avg 72; quality avg 82. First 10 pinned EXACTLY as tracker 03:

| Entity | Code | Wave | Org | Wkf | Wkl | Drv | Evd | Overall | Reviewer | Status |
|---|---|---|---|---|---|---|---|---|---|---|
| Dubai Health Authority | DHA | W1 | 100 | 85 | 80 | 75 | 90 | 86 | M. Al Blooshi | Overdue+In Progress |
| Roads & Transport Authority | RTA | W1 | 100 | 100 | 95 | 90 | 100 | 97 | H. Al Qasimi | Submitted |
| Dubai Municipality | DM | W1 | 80 | 85 | 55 | 0 | 60 | 56 | F. Al Marri | Returned |
| Dubai Police | DP | W1 | 100 | 100 | 100 | 100 | 100 | 100 | M. Al Blooshi | Submitted |
| Dubai Electricity & Water Authority | DEWA | W2 | 90 | 80 | 70 | 50 | 80 | 74 | H. Al Qasimi | In Progress |
| Knowledge & Human Dev. Authority | KHDA | W2 | 100 | 90 | 70 | 60 | 80 | 78 | F. Al Marri | In Progress |
| Dubai Civil Aviation Authority | DCAA | W2 | 80 | 50 | 40 | 30 | 40 | 48 | M. Al Blooshi | Not Started |
| Dubai Culture | DC | W2 | 100 | 100 | 100 | 80 | 100 | 96 | H. Al Qasimi | Submitted |
| Dubai Sports Council | DSC | W3 | 60 | 40 | 30 | 20 | 20 | 34 | F. Al Marri | Not Started |
| Dubai Tourism | DET | W3 | 70 | 60 | 50 | 40 | 60 | 56 | Unassigned | Not Started |

Remaining 49: realistic Dubai entity names (Dubai Courts, Land Department, Dubai Customs, Islamic Affairs & Charitable Activities Dept., Education & Knowledge Dept., GDRFA, Dubai Statistics Center, Awqaf, Dubai Ambulance, Dubai Media, Dubai Ports, …) per the distributions. Seed 5 unassigned-reviewer entities and 14 entities with completeness < 60.

### 7.2 Users
DGHR: DGHR Admin (DG), Aisha Khan (analyst), M. Al Blooshi / H. Al Qasimi / F. Al Marri (reviewers/analysts), Omar Al Zaabi (Forecasting Reviewer), Aisha Al Mansoori (Workforce Planning Lead), Maryam Al Zaabi (Reviewer). Entity DM: Ahmed Al Mansoori (Entity Admin), Sara Al Mansoori. Entity DHA: Fatima Al Mansoori (Entity Contact).

### 7.3 Cycle configuration (screen 02 — verbatim)
Cycle "Workforce Planning Cycle 2025", Active. 8 packages:
| # | Package | Fields | Mand/Opt | Toggle | Evidence | Section types |
|---|---|---|---|---|---|---|
| 1 | Organization Structure — "Legal entity, departments, units, and reporting lines." | 46 | 32/14 | on | Yes · 18 | 5 |
| 2 | Current Workforce — "Headcount, demographics, contracts, compensation bands." | 78 | 48/30 | on | Yes · 24 | 5 |
| 3 | Workforce Movement — "Hires, transfers, promotions, exits, turnover and reasons." | 52 | 28/24 | on | Yes · 16 | 4 |
| 4 | Workload & Service Data — "Service volumes, queues, SLAs, productivity metrics." | 48 | 28/20 | on | Yes · 14 | 4 |
| 5 | Future Demand Drivers — "Strategic initiatives, population and demand drivers." | 36 | 20/16 | on | Optional · 8 | 4 |
| 6 | Skills & Roles — "Critical skills, role taxonomy, proficiency levels." | 46 | 26/20 | on | Yes · 12 | 5 |
| 7 | Budget & Cost — "Payroll, operating costs, budgets, and forecasts." | 44 | 24/20 | on | Yes · 12 | 4 |
| 8 | Evidence & Documents — "Supporting files, justifications, methodologies." | 36 | 6/30 | off | Yes · All | 5 |
Totals 386 / 212 / 174. Seed 3–5 package_field_groups per package. 7 section-type templates all Active. Config options verbatim: deadline; "Allow with approval"; "By Section Type"; "7, 3, 1 days before due date"; "Reviewer → Approver → DGHR"; "v2.1 · Latest". Audit "v2.1 updated by DGHR Admin · Today, 10:30 AM". Applicability: DM and DHA → exactly 5 packages apply (Organization Structure, Current Workforce, Workload & Service, Future Demand Drivers, Evidence & Documents).

### 7.4 Quality & validation (screen 04 — verbatim, internally consistent)
rule_stats: Completeness 412/58 · Consistency 238/32 · Duplicates 156/21 · Hierarchy Logic 142/18 · Workforce Logic 131/17 · Workload Logic 101/11 · Evidence Checks 68/7 → totals 1,248/164. Validation issues: 38 open/in-progress, first 8 pinned as mockup queue. KPI cards: Missing Mandatory Fields 126 across 24 entities · Duplicate Job Titles 37 across 18 entities · Ready for Review 11. Quality bars pinned: DEWA 94 · Dubai Police 90 · Dubai Municipality 82 · Overall Average 82 (highlighted) · RTA 76 · DHA 74 · Land Department 68 · Dubai Culture & Arts Authority 64. Anomalies (4 pinned): "Headcount spike of +35% detected in short time period" DM/Workforce/High/95 · "Workload per employee is 2.4x higher than peer average" RTA/Workload/Medium/87 · "Unusual ratio of support roles to total headcount" DHA/Workforce/Medium/82 · "Large number of part-time roles without workload" Land Dept/Workload/Low/71. Evidence overview: Missing 126 (24, 17.8%) · Weak 214 (31, 30.2%) · Acceptable 372 (42, 52.6%); Top gaps: Role Justification Documents 86 · Workload Methodology 62 · Organizational Charts 38.

### 7.5 Cases, Dubai Municipality data, notifications
Cases: 24 open clarifications + 16 returns + resolved set (monthly counter 128). Pin CLF-2025-00421 fully per 05 (DHA · "Workforce Plan Q2 2025" · High · "FTE Calculation" · Aisha Khan · due today+6d · issue summary + 3 requested corrections + 3-message thread verbatim + 4 audit events). Pin CLF-2025-00419 (DM, "Request for headcount breakdown by nationality…", Medium), CLF-2025-00412 (RTA, Low), RTN-2025-00391/00377/00355, resolved CLF-2025-00310. DM has 3 open cases.
DM packages (single source for Home AND Tracker): Org Structure Submitted 100 · Current Workforce In Progress 85 · Workload In Progress 55 · Future Drivers Not Started 0 · Evidence Not Started 0 → Home overall mean = 68%; tracker row per 7.1 with roll-up Returned. Consistency wins over per-pixel mockup numbers.
Org structure (DM): 6 sectors / 27 departments / 142 sections / 7 unmapped / 3 missing owner / 2 missing focal point / 95% completeness. Pin visible tree + 8 table rows (root = Dubai Municipality). Reviewer comment by Maryam Al Zaabi verbatim.
Workforce (DM): 1,248 records across ~10 sections; map split 1,187 / 34 / 27; validation 18+12+5+2 = 37; vacancies 61; completeness 92. Pin 7 visible rows. Upload history "HR_Extract_May2025.xlsx · Uploaded Today 10:15 AM by Sara Al Mansoori · Imported".
Workload (DM): 9 sections verbatim from 09; monthly_pattern shaped to peak labels. KPIs 9/9 · 156 metrics (+12) · 8 missing drivers · 82% avg · "Up to date, Today 9:45 AM". Coverage donut: CS 92 · I&C 88 · HR 85 · Finance 70 · IT 90 · Other 75.
Demand drivers (DM): 7 drivers verbatim · KPIs 14/9/7/32/6/72% · 5 pinned evidence rows + 27 generated · 2 reviewer comments verbatim.
Alerts: 3 pinned verbatim (screen 01). Notifications: DM gets 2 clarification messages + "DGHR Announcement: Workforce Planning 2025 data collection is now open…"; DGHR gets recent status notifications. Deadlines: Future Demand Drivers & Evidence Upload = deadline (12 days left), Final Submission = deadline+7 (19 days left).

### 7.6 Layer-B vision preview seed (feeds ONLY §9.5; labeled Illustrative)
vision_metrics: current_workforce 2,842 FTEs · forecast_demand_fy_plus1 3,214 FTEs · workforce_gaps 372 FTEs · growth +512 · reduction −140 · budget_impact "AED 1.42B potential" · evidence_items_total 3,456 · evidence_missing 684. skills_gap_preview: Data analytics 128 · AI/ML 96 · Cybersecurity 74 · Cloud engineering 61 · Change management 45. scenario_preview: Baseline 3,214/1.42/372 · High growth 3,486/1.58/486 · Efficiency 3,074/1.31/228. insight_quotes: "Entity A shows a 22% increase in administrative roles despite planned automation." · "Customer service demand is rising across 7 entities." · "Data and AI roles appear under inconsistent job titles." · "Five entities may share common new capabilities."

### 7.7 Consistency gate — `python -m app.checks` must assert (Phase 0 gate)
status counts sum 59 · received=27 · 27/59≈45.8% · overdue=9 · forecasting 11+48=59 · DM package mean=68 · workforce 1187+34+27=1248 · workforce issues 18+12+5+2=37 · rule_stats totals 1248/164 · packages 386/212/174 · DM applicable=5 · DM open cases=3 · pinned tracker rows exist · skills_gap_preview 5 ranked rows · scenario_preview exactly 3 · vision_metrics keys complete. Print ✓ per assertion.

---

## 8. API CONTRACT (FastAPI; prefix /api; OpenAPI /docs)

Shared: GET /health · GET /meta/last-updated · GET /notifications?audience=&entity_id= · POST /notifications/mark-read · GET /notifications/poll?since=
DGHR: GET /dghr/command-center · GET /dghr/tracker?filters · GET /dghr/tracker/blocked-summary · GET /dghr/tracker/followups · GET /dghr/tracker/export.csv · GET /dghr/config · PATCH /dghr/config/packages/{id} · POST /dghr/config/publish · GET /dghr/quality · PATCH /dghr/issues/{id} · GET /dghr/entities/{id} · GET /dghr/forecasting-readiness
Cases: GET /cases?side=&entity_id=&tab=&search&page · GET /cases/{id} · POST /cases · POST /cases/{id}/messages · POST /cases/{id}/action (resolve|escalate|assign|request_evidence|accept_resubmission|return_to_entity)
Entity: GET /entity/{id}/home · GET/POST /entity/{id}/org-structure (+/sections CRUD, /validate, /import, /template.xlsx) · GET /entity/{id}/workforce?filters&page · PATCH /entity/{id}/workforce/{recordId} · POST /entity/{id}/workforce/import · POST /entity/{id}/workforce/validate · GET /entity/{id}/workforce/export.csv · GET/POST /entity/{id}/workload (+/import,/validate) · GET/POST /entity/{id}/drivers · PATCH /entity/{id}/drivers/{id} · POST /entity/{id}/evidence · GET/POST /entity/{id}/comments?package= · POST /entity/{id}/packages/{key}/submit · POST /entity/{id}/packages/{key}/save-draft · GET /entity/{id}/my-submissions
Workflow: POST /dghr/actions/remind · POST /dghr/actions/approve · POST /dghr/actions/bulk-review · POST /dghr/actions/return · POST /dghr/actions/escalate
AI: POST /ai/driver-summary/{entity_id} · POST /ai/anomaly-narrative/{anomaly_id} · POST /ai/map-titles
Demo: POST /demo/reset · POST /demo/simulate-submissions · POST /demo/trigger-anomaly · POST /demo/advance-trend
Every mutating endpoint: audit_events row + notifications to opposite audience + last-updated bump. Pydantic schemas mirrored in frontend/src/lib/types.ts.

---

## 9–10. SCREEN SPECIFICATIONS
See conversation handoff / reference PNGs. DGHR: §9.1 command-center (01), §9.2 data-collection (02), §9.3 submissions (03), §9.4 data-quality (04), §9.5 forecasting-readiness (NEW, no mockup — real Zone 1 + Illustrative Zone 2 with VisionBadge on every preview card + factory-quote footer), §9.6 clarifications (05), §9.7 entity detail drawer (shared), §9.8 placeholders. Entity: §10.1 home (06), §10.2 org-structure (07), §10.3 workforce (08, Excel-import wow), §10.4 workload (09), §10.5 demand-drivers (10, packages 4&5), §10.6 clarifications (entity mirror), §10.7 my-submissions. "F" = functional, "S" = stub toast "Available in the full release". All numbers from API. Entity screens use Entity shell (chrome correction §1); org-tree root = current entity.

---

## 11. CROSS-PORTAL WORKFLOW & LIVE SYNC (the demo loop — highest priority)

| Actor | Action | State change | Other side sees (≤5s) |
|---|---|---|---|
| Entity | Submit package | entity_packages → submitted; roll-up recomputed | DGHR toast "🔵 {Entity} submitted {Package}"; bell +1; Command Center + Tracker update |
| Entity | Reply / attach evidence | case → responded; message appended | DGHR bell +1; thread updates; avg response time recomputes |
| Entity | Resubmit (returned) | package → submitted; case responded | DGHR toast; Tracker flips Returned→Submitted |
| DGHR | Open clarification | case created (CLF-{yyyy}-{seq}) | Entity toast + bell; Home "Pending Clarifications" +1; sidebar badge +1 |
| DGHR | Return submission | package → returned; RTN case created | Entity toast; Home row → Returned "Action required" |
| DGHR | Send reminder | notification only | Entity bell + Home message |
| DGHR | Accept resubmission / Approve | package → under_review/approved; case resolved | Entity toast "✅ {Package} approved"; Home ring animates |
| DGHR | Escalate / Assign | case fields updated | audit trail + priority chip |
| DGHR | Publish request package | cycle published | All-entity announcement |

Mechanics: every mutation → services/workflow.py → state change, audit_events, notifications for opposite audience, global last-updated bump. Frontend: TanStack Query keys per widget; live keys (command-center, tracker, entity-home, cases, notifications-poll, forecasting-readiness) use refetchInterval 4000. useLiveNotifications hook diffs /notifications/poll → sonner toasts + bell. KPI count-up 400ms (Phase 5; instant Phase 3).

---

## 12. EXCEL IMPORT ENGINE (services/import_engine.py)

Workforce import (primary): .xlsx/.xls/.csv (pandas/openpyxl). Case-insensitive header synonyms: Section|Department|Org Unit → section; Job Title|Position|Title; Grade|Level; FTE|Current FTE|Headcount; Vacancies|Open Positions; Employment Type|Contract Type; Critical|Critical Role. Friendly 422 listing missing required columns (Section, Job Title, FTE). Job-title mapping vs standard_job_titles (~120 titles / 12 families): exact → mapped · alias → mapped · rapidfuzz token_sort_ratio ≥90 → mapped · 70–89 → partial (store suggestion) · <70 → unmapped. Validations: missing grade · FTE ≤0 · missing employment type · duplicate title within section · same title mapped to ≠ families. Response {imported, mapped, partial, unmapped, issues_summary{4}, sample_issues[]}. Org/workload imports: same skeleton, simpler columns. Templates: GET …/template.xlsx via openpyxl. Demo asset generate_demo_files.py → HR_Extract_Demo.xlsx (~1,248 rows → ≈95.1% mapped / 2.7% partial / 2.2% unmapped, exactly 18/12/5/2 issues) + 5 evidence PDFs (reportlab).

---

## 13. AI LAYER (exactly three features; never blocking)

services/ai_service.py: if ANTHROPIC_API_KEY set and DEMO_AI_MODE != "fallback" → Anthropic Messages API (MODEL_NAME, default current Claude Sonnet), 10s timeout, temperature 0.4; on any error/timeout → services/fallbacks.py deterministic canned output. Demo indistinguishable offline. Frontend always shows 1.5–3s "✨ Analyzing…". Voice per §4.4. Three features: Driver AI Summary (POST /ai/driver-summary/{entity} → 150–200-word structured narrative), Anomaly narrative (POST /ai/anomaly-narrative/{id} → 3–4 sentences + 2 checks, cached), Job-title mapping (POST /ai/map-titles → best title + family + confidence; AI wins ties vs fuzzy).

---

## 14. DEMO CONTROL PANEL (Ctrl+Shift+D — invisible to client)

Right drawer: Reset Demo Data (POST /demo/reset → re-seed §7) · Simulate 3 Entities Submitting (3 in-progress → submitted, staggered 2s) · Trigger AI Anomaly · Advance Trend. Panel shows current persona, API health dot, seed-check status.

---

## 15. PHASE PLAN — execute strictly in order; stop at each gate

**PHASE 0 — Foundations.** Build: repo layout · docker-compose (postgres 16 + backend + frontend; backend entrypoint alembic upgrade head + python -m app.seed) · all SQLAlchemy models + initial migration (incl §7.6 preview tables) · full seed.py + checks.py · FastAPI skeleton (/health, /dghr/command-center real, /notifications*) · frontend scaffold, tokens, all shared components (incl GroupedBarChart + VisionBadge), both AppShells + sidebars + PageHeader + skyline + PersonaSwitcher + NotificationBell · router with every route (unbuilt → "TODO" in correct shell; placeholders final) · typed API client + types.ts.
Gate: docker compose up → 3 healthy · python -m app.checks all ✓ · persona switch swaps shells instantly + persists · every sidebar item navigates (no dead links) · /docs shows contract · Command Center returns reconciled payload.

**PHASE 1 — DGHR portal, read-only** (§9.1–9.4 + §9.7). Gate: side-by-side vs PNGs match · grep finds no numeric metric literals in pages/ · tracker filters compose · CSV export downloads · every "View all →" resolves.

**PHASE 2 — Entity portal, read-only** (§10.1–10.5, §10.7). Gate: visual match · Home buttons route · workforce table paginates 1,248 rows server-side · sparklines match peak labels · no dead links.

**PHASE 3 — The closed loop** (§11 + §9.6 + §10.6). Gate: two browser windows — every §11 row passes ≤5s · CLF-2025-00421 round-trips · "Approve Ready Entities" animates donut & ring · audit trail records every step · refresh timestamp updates.

**PHASE 4 — Import engine + AI + demo assets** (§12–13). Gate: HR_Extract_Demo.xlsx yields ≈1,248/95.1%/34/27 and 18/12/5/2 · Mapping Drawer accept-flow updates rows live · org & workload imports + templates · three AI features ≤10s in §13 voice · evidence upload stores/lists.

**PHASE 5 — Vision teaser + demo polish.** Build §9.5 (backend readiness.py + screen, both zones, VisionBadge + factory footer) · count-up KPI animations · animated rings/bars · staggered fade-in · loading skeletons · DemoPanel (§14) · optional EN/AR toggle. Gate: §9.5 quality = mockup screens; Zone 1 real, Zone 2 all VisionBadge from §7.6 only · full demo script (§16) twice, once DEMO_AI_MODE=fallback + network off · POST /demo/reset restores exact §7 state.

---

## 16. THE DEMO SCRIPT (final acceptance — 7 beats)

1. DGHR Command Center — 59 entities, 46% ring, alerts ticking (may hit "Simulate 3 submissions").
2. Persona switch → Dubai Municipality — Home: 68%, 5 packages, 3 pending clarifications, deadline countdown.
3. Workforce Data — drag HR_Extract_Demo.xlsx → parse → 95.1% mapped → Mapping Drawer, accept one AI suggestion → Run Validation → fix one cell → Submit.
4. Persona switch → DGHR — toast fired; Tracker updated; Data Quality shows fresh AI anomaly → drawer → Generate AI Narrative → Send Back to Entity (two clicks).
5. Persona switch → Entity — badge +1; open case, read thread, Reply, attach evidence, Resubmit.
6. Persona switch → DGHR — Accept Resubmission → Approve; Command Center donut & ring advance; audit trail shows every step.
7. The factory close — Forecasting Readiness: real funnel just moved; scroll to Layer B preview; land on the factory quote.

---

## 17. ENGINEERING CONVENTIONS

TypeScript strict; no `any` in pages/; API responses typed via lib/types.ts mirroring Pydantic. Python ruff + black; routers thin, services fat; one transaction per mutation. Never hardcode a metric in JSX (grep-audited gates 1/2/5). Every card handles loading + empty. Mockup copy verbatim; other copy per §4.4. POV-scenario numbers only in §9.5 Zone 2 (§7.6, VisionBadge). Dates relative where mockups show relative; GST label on Data Quality footer. Numbers via Intl.NumberFormat('en-AE'). Commit per logical unit; keep PROGRESS.md updated at each gate with screenshots.

**Definition of done:** a stranger with two browser windows can run the §16 script unassisted; no click leads to a dead end; nothing contradicts APPLICATION_CONTEXT.md in numbers, vocabulary, or claims.
