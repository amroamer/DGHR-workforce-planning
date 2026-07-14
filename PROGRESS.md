# DGHR Workforce Planning Portal — Build Progress

Tracked per SPEC §15 phase gates. Screenshots of finished screens go next to their reference PNGs; §9.5 next to a self-review note (no mockup).

## Phase 0 — Foundations
Status: **COMPLETE ✓** (gate passed)

Scope: repo layout · docker-compose (postgres + backend + frontend) · all SQLAlchemy models (incl. §7.6 preview tables) · seed.py + checks.py · FastAPI skeleton (/health, /dghr/command-center, /notifications*) · frontend scaffold, tokens, shared components (incl. GroupedBarChart + VisionBadge) · both AppShells + sidebars + PageHeader + skyline + PersonaSwitcher + NotificationBell · router with every route · typed API client + types.ts.

### Gate checklist
- [x] `docker compose up` → 3 healthy services (postgres + backend + frontend all `healthy`)
- [x] `python -m app.checks` all ✓ (21/21 assertions pass)
- [x] persona switch swaps shells instantly + persists (localStorage; deep-link `?persona=`; badges/bell scope correctly) — see screenshots
- [x] every sidebar item navigates (no dead links — roadmap items → designed placeholder)
- [x] `/docs` shows the contract (10 endpoints)
- [x] Command Center endpoint returns the reconciled payload (59 · 27 · 46% · 11 ready / 48 blocked · donut sums 59 · 9 overdue)

### Evidence (docs/progress/phase-0/)
- `01-dghr-command-center-shell.png` — DGHR shell, nav, skyline, live bell (3 unread)
- `02-entity-dm-shell.png` — Entity shell (DM), Clarifications ③ badge + bell 2, both live-scoped
- `03-placeholder.png` — "Coming with the full release" designed placeholder (no dead link)

### Ports (offset to avoid sibling-project collisions)
Frontend http://localhost:5183 · Backend http://localhost:8010 (/docs) · Postgres host:5544 (internal container ports unchanged)

### Known follow-ups deferred to Phase 1 (not gate items)
- Command Center `missing_data` KPI (currently 35) and per-package missing-summary (30/26/17/17/12) use a
  provisional `<60` rule; calibrate seed + rule to the mockup's 12 and 18/22/25/31/20 when building the real screen.
- See CONFLICTS.md for the surfaced DM / quality-score reconciliations (C1–C4) awaiting operator confirmation.

## Phase 1 — DGHR portal, read-only
Status: **COMPLETE ✓** (gate passed)

Screens 01–04 built pixel-faithful and fully data-bound + the §9.7 entity drawer.

### Backend endpoints added
`/dghr/tracker` (server-side wave/status/reviewer/package/due/search filters + sort + pagination), `/tracker/blocked-summary`, `/tracker/followups`, `/tracker/export.csv`, `/dghr/config` (+ `PATCH /config/packages/{id}` toggle, `POST /config/publish`), `/dghr/quality` (+ `PATCH /issues/{id}`), `/dghr/entities/{id}` (drawer). New `dashboard_stats` table holds pinned aggregates not derivable from row-level data (evidence 126/214/372, blocked breakdown, missing-summary 18/22/25/31/20, pass-rate).

### Gate checklist
- [x] Side-by-side vs PNGs — layout/copy/badges/charts match (see docs/progress/phase-1/)
- [x] `grep` finds no numeric metric literals in `pages/`
- [x] Tracker filters compose server-side (verified wave+status, due+sort, search)
- [x] CSV export downloads (text/csv, attachment, 59 rows)
- [x] Every "View all →" resolves (navigate or "Available in the full release" toast — no dead links)
- [x] Entity drawer works (opened from Command Center + Tracker ⋯)

### Calibration notes (CONFLICTS C5/C6 added)
- Command Center: `missing_data` KPI = 12 (derived: overdue ∪ returned); missing-summary 18/22/25/31/20 seeded.
- Data Quality: avg quality ≈ 82 (renders 83), rules pass-rate pinned to mockup's 86.5% (its per-category rows compute to 88.4%).
- Tracker default order preserves pinned DHA/RTA/DM… (seed order); avg completeness 73 (≈72%).

## Phase 2 — Entity portal, read-only
Status: **COMPLETE ✓** (gate passed)

Screens 06–10 + My Submissions built in the Entity shell (chrome correction §1), data-bound to the persona entity; DHA renders EmptyStates for its unseeded packages.

### Backend endpoints added
`/entity/{id}/home`, `/org-structure` (tree + filtered sections), `/workforce` (server-side filters + pagination over 1,248 rows), `/workload`, `/drivers`, `/my-submissions`. Seed refined: DM org 6 sectors / 27 departments / 142 sections / 7 unmapped / 3 missing owner / 2 missing focal; workforce vacancies sum 61; driver-screen aggregate stats; DM package progress retuned to [100,72,45,63,60] (mean 68) to match the Home mockup's Org/Workforce/Workload exactly.

### Gate checklist
- [x] Visual match vs PNGs (see docs/progress/phase-2/)
- [x] Home buttons route (Continue/Start/View → correct package screens)
- [x] Workforce table paginates 1,248 rows server-side (filters + rows-per-page)
- [x] Sparklines match peak labels (Steady flat, seasonal humps)
- [x] No dead links (all actions toast "wired in Phase 3/4" or navigate)
- [x] Org-tree root = current entity (not "DGHR"); DHA persona → DHA-scoped data + EmptyStates
- [x] grep-clean (no metric literals in pages/); tsc strict clean; checks 21/21

### Note (CONFLICTS C1)
DM Home shows Future Demand Drivers 63% / Evidence 60% "In Progress" rather than the mockup's two "Not Started 0%" rows — the internal-consistency tradeoff (package mean must be 68). Org/Workforce/Workload match the mockup (100/72/45).

## Phase 3 — The closed loop
Status: **COMPLETE ✓** (gate passed)

Both Clarifications screens (§9.6 DGHR, §10.6 Entity) built as a shared three-pane view; all mutating actions live; cross-portal sync via 4s polling.

### Backend
`services/cases.py` (roll-up state machine, list/detail/kpis, create/message/action, submit/save-draft, remind/approve/bulk-review/return, resubmit/acknowledge). `routers/cases.py` + DGHR `/actions/*` + entity `/packages/{key}/submit`. Every mutation → state change + `audit_events` + notification to opposite audience + last-updated bump (`services/workflow.py`). Clarification KPIs tuned: 24 open · 16 returned · 1.6-day avg response · 5 overdue · 128 resolved.

### Frontend
`useLiveNotifications` hook (mounted in AppShell) polls `/notifications/poll` every 4s, diffs new events → sonner toasts + `invalidateQueries()`. Shared `ClarificationsView` (both portals). Wired live: entity package submits (Org/Workforce/Workload/Drivers), Command Center Approve-Ready / Send-Reminders, Tracker Send-Reminder / Bulk-Review, EntityDrawer remind/return/approve/clarify, Data Quality anomaly → Open Clarification, config Publish, all case actions (reply, return, request-evidence, accept-resubmission, escalate, acknowledge, resubmit).

### Gate checklist (verified via API/poll + curl loop)
- [x] §11 matrix rows propagate: entity submit → DGHR notif; DGHR clarification → entity notif + badge 3→4 (both directions ≤4s)
- [x] CLF-2025-00421 round-trips: reply → responded → accept → resolved (4 msgs, 5 audit events)
- [x] "Approve Ready Entities" advances donut (approved 8→19) & readiness (11→0)
- [x] Audit trail records every step; refresh timestamp updates
- [x] No dead links; tsc strict clean; checks 21/21

Evidence: docs/progress/phase-3/

## Phase 4 — Import engine + AI + demo assets
Status: **COMPLETE ✓** (gate passed)

### Backend
`services/import_engine.py` — pandas/openpyxl parse with case-insensitive header synonyms, friendly 422 on missing Section/Job Title/FTE, rapidfuzz job-title mapping (exact/alias/≥90 mapped · 70–89 partial · <70 unmapped), validations (missing grade, ≤0 FTE, missing employment type, inconsistent job family), workforce/org/workload imports + styled `template.xlsx`. `services/ai_service.py` + `fallbacks.py` — 3 features (driver summary, anomaly narrative, job-title mapping) via Anthropic when configured, deterministic fallback otherwise (analyst voice, §13). `routers/imports.py` (+ evidence upload), `routers/ai.py`, workforce PATCH.

### Demo assets
`demo-assets/generate_demo_files.py` → `HR_Extract_Demo.xlsx` (1,248 rows engineered so import reports **1187 mapped / 34 partial / 27 unmapped** and **18/12/5/2** issues) + 5 evidence PDFs.

### Frontend
Workforce import dropzone (drag/drop + staged "Parsing → Mapping → Validating"), Mapping Drawer (unmapped/partial titles + AI suggestion + confidence + Accept → live remap), Run Validation. AI: Data Quality anomaly "Generate AI Narrative" (✨ Analyzing…), Demand Drivers "Run AI Summary" + evidence upload. Org/Workload import + template downloads.

### Gate checklist (verified)
- [x] `HR_Extract_Demo.xlsx` → 1248 / 95.1% / 34 / 27 and 18/12/5/2 issues
- [x] Mapping Drawer accept-flow patches records live (PATCH /workforce/{id})
- [x] Org + workload imports + template.xlsx downloads (proper headers)
- [x] Three AI features respond ≤10s in the §13 voice (fallback mode)
- [x] Evidence upload stores file + lists (evidence count 32→33)
- [x] tsc strict clean · checks 21/21

Evidence: docs/progress/phase-4/

## Phase 5 — Vision teaser + demo polish
Status: **COMPLETE ✓** (gate passed) — final phase

### Backend
`services/readiness.py` + `GET /dghr/forecasting-readiness` — Zone 1 real (ready 11/blocked 48 via canonical §6 rule, avg completeness/quality, entity readiness table, blockers) + Zone 2 §7.6 preview (vision metrics, skills, scenarios, quotes). Demo control endpoints: `/demo/simulate-submissions`, `/demo/trigger-anomaly`, `/demo/advance-trend`.

### Frontend
§9.5 Forecasting Readiness screen — Zone 1 real data + Zone 2 Layer-B preview with **VisionBadge on every card** + the factory-quote footer. DemoPanel (Ctrl+Shift+D) actions wired live. Polish: count-up on live KPI changes (AnimatedNumber), CSS-transitioned readiness ring, KPI loading skeletons, page fade-in, Recharts entry animations disabled for crisp render.

### Gate checklist
- [x] §9.5 visual quality equals the mockup-backed screens
- [x] Zone 1 numbers real (11/48/73%/83/19%); Zone 2 all VisionBadge-labeled, sourced from §7.6 only
- [x] DemoPanel simulate/anomaly/trend work; `POST /demo/reset` restores exact §7 state (checks 21/21)
- [x] Runs fully offline — `DEMO_AI_MODE=fallback`, no API key; AI features use deterministic fallback
- [x] 3 services healthy · tsc strict clean · no metric literals in pages/

Evidence: docs/progress/phase-5/

---

## ✅ MVP COMPLETE — all 6 phases (0–5) passed their gates
The §16 demo script runs end-to-end: Command Center → persona switch → live Excel import + AI mapping → submit → cross-portal clarification loop → approve (dashboards animate) → the Forecasting Readiness factory close. A stranger with two browser windows can run it unassisted; no dead ends; nothing contradicts APPLICATION_CONTEXT.md. See CONFLICTS.md for surfaced source reconciliations (C1–C6).
