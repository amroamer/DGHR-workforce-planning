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
Status: not started

## Phase 2 — Entity portal, read-only
Status: not started

## Phase 3 — The closed loop
Status: not started

## Phase 4 — Import engine + AI + demo assets
Status: not started

## Phase 5 — Vision teaser + demo polish
Status: not started
