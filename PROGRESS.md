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
Status: not started

## Phase 3 — The closed loop
Status: not started

## Phase 4 — Import engine + AI + demo assets
Status: not started

## Phase 5 — Vision teaser + demo polish
Status: not started
