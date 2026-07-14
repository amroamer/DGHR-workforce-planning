# Surfaced source conflicts & reconciliations (per SPEC §1 / APPLICATION_CONTEXT §13 rule 5)

Per the precedence rules I never silently resolve a conflict. Each item below is flagged for the operator; the reconciliation I implemented keeps the automated §7.7 gate green and the seed internally consistent. Tell me if you want a different resolution before Phase 2 (these only affect the DM Home/Tracker/Quality screens).

## C1 — Dubai Municipality (DM) package progress / completeness is over-specified and self-contradictory
Three different DM datasets appear in the SPEC:
- **§7.1 tracker table:** per-package Org 80 / Wkf 85 / Wkl 55 / Drv 0 / Evd 60, **overall 56**.
- **§7.5:** "Org 100 · Workforce 85 · Workload 55 · Future 0 · Evidence 0 → Home overall mean = **68%**" — but the arithmetic mean of those five is 48, not 68. Two packages at 0 make a mean of 68 impossible (max of the other three is 300/5 = 60).
- **§7.7 gate:** asserts **DM package mean = 68**.
- **Home mockup (06):** Org 100 (Submitted) · Workforce 72 · Workload 45 · Future 0 (Not Started) · Evidence 0 (Not Started); headline "68% Submission Progress".

**Reconciliation implemented:** DM applicable-package progresses = **[Org 100, Current Workforce 85, Workload 55, Future Drivers 40, Evidence 60]** → mean exactly **68**; `entity.completeness = 68`; `entity.status = returned` (pinned). This satisfies the §7.7 mechanical gate and SPEC §7.5's explicit directive that "consistency wins over per-pixel mockup numbers."
**Deviation from the Home mockup:** Future Drivers shows 40% and Evidence 60% rather than the mockup's two "Not Started 0%" rows. If you prefer the mockup exactly, I'll set Future/Evidence to 0 and change the DM headline + the checks assertion to a consistent value (e.g. mean 48, or a separately-stored completeness). Your call before Phase 2.

## C2 — Quality score per entity differs between screens 01 and 04
- **Screen 01 (actions queue):** DHA 62 · RTA 48 · DM 55.
- **Screen 04 (quality bars, pinned in §7.4):** DEWA 94 · DP 90 · **DM 82** · RTA 76 · DHA 74 · Land Department 68 · Dubai Culture & Arts Authority 64.
**Reconciliation implemented:** the §7.4 quality-bar values are canonical `entity.quality_score` (more specific pin, feeds the Data Quality screen). The Command Center actions queue renders the same `entity.quality_score`, so it will show DM 82 / DHA 74 / RTA 76 rather than screen-01's 55 / 62 / 48.

## C3 — "Dubai Culture" vs "Dubai Culture & Arts Authority"
§7.1 pins entity #8 as "Dubai Culture" (DC); §7.4 quality bar and some issue rows say "Dubai Culture & Arts Authority". Implemented as a single entity named **"Dubai Culture" (DC)**; its quality bar uses that name. Flag if these should be two distinct entities.

## C5 — Command Center "Missing Data" figures are mutually inconsistent (Phase 1)
Screen 01 shows a headline KPI **"12 Entities with Missing Data"** and a separate **Missing Data Summary** card with per-category counts **Org 18 · Workforce 22 · Workload 25 · Future Drivers 31 · Evidence 20**. These can't both be derived from one coherent dataset: if 31 entities have a Future-Drivers gap, then ≥31 entities have "missing data", so the headline can't be 12.
**Reconciliation implemented:**
- Headline KPI **12** = derived, coherent: distinct entities that are **overdue OR returned** ("Require attention"). The seed places 2 overdue∩returned overlaps so |overdue ∪ returned| = 9 + 5 − 2 = 12.
- Per-category card (18/22/25/31/20) = seeded display stats in `dashboard_stats` (like the screen-04 evidence aggregates), since I only seeded DM's row-level package detail, not all 59 entities'. The generator was also made realistic (Org completes first → Evidence last) so any future derivation would order correctly.

## C4 — Command Center status donut vs 59 total
Earlier mockup (screen 01) legend counts overlapped/exceeded 59 with a footnote about overlap. SPEC §7.1 reconciles to a clean partition summing to 59 (Not Started 12 · In Progress 15 · Submitted 13 · Under Review 6 · Returned 5 · Approved 8). Implemented the §7.1 partition; the verbatim footnote about overlap is retained on the card as copy.
