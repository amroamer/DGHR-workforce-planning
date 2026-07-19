# EXECUTION PLAN — PRD_FUNCTIONALITY to 100%
Grounded in a code-level coverage audit (12 agents) of all 194 requirement IDs.

**Baseline coverage:** **DONE 120 · PARTIAL 55 · MISSING 19.**
The functional core (submit → review → approve → clarify, imports, authoring, propagation) is DONE and
independently verified (L0–L6: 25 pytest + 212 e2e green). This plan closes the remaining **74 IDs** and
adds the full **20-category UI e2e harness**.

---

## TRACK A — BUILD-OUT (close 55 PARTIAL + 19 MISSING)

Sequenced so shared foundations land first; each workstream lists its PRD IDs and is verified before the next.

### WS-A0 · Shared foundations (unblocks many IDs)
- **`ConfirmModal`** reusable dialog → MD-13 (bulk confirm), MD-14 (delete confirms), MD-21 (reset confirm).
- **`SubmitGuardModal`** (lists real open issues + "Submit anyway") → MD-07 + OS-13, WF-11, WL-09, DD-02, G-11.
- **`useUrlFilters`** hook (filters ↔ URL query, reload-stable) → G-03, TRK-02, OS-07, and readers CC-07/CC-09/FR-03.
- **In-flight disable** convention on every mutating button → G-07 idempotency.
- **Legality helper** (backend `allowed_actions`, 409 on illegal) → G-06, TRK-15/DRW approve-legal-only.

### WS-A1 · Shell (2)
- **HDR-01 / MD-18** Command palette (⌘K + header search): searchable entities → navigate; entity persona searches its packages/cases.
- **HDR-02** Notification dropdown row → navigate to its case/screen **and** mark that row read (PATCH by id).

### WS-A2 · Command Center wiring (8 PARTIAL)
CC-02 scroll-to-trend · CC-03 donut animate-on-change · CC-05 pagination control · CC-07 read `?entity` filter ·
CC-08 Escalate → **new `POST /dghr/actions/escalate`** (notif+audit) · CC-09 Review Submission → `?status=submitted` ·
CC-14 Escalate Blockers → real endpoint · CC-15 Send Reminders → all in-progress (not just visible 5).

### WS-A3 · Tracker + Entity Drawer (9 PARTIAL)
Row **kebab menu** with: TRK-13 **Open Clarification modal** (MD-01, editable summary/corrections) · TRK-14 **Return modal**
(MD-02, reason required) · TRK-12 Send Reminder · TRK-15 Approve (legal-only) · TRK-02 URL-persist filters · TRK-08 bulk-review
skip reporting ("N moved, M skipped") · TRK-10 export current filtered view · TRK-16 page-size select · TRK-18 fix
Low-Completeness + Unassigned follow-up filters · MD-13 bulk confirm.

### WS-A4 · Data Quality depth (3 MISSING + 1 PARTIAL)
DQ-03 / MD-03 **Issue drawer** (detail + sample affected records) → DQ-04 **Assign Analyst** (persist `assigned_to`) ·
DQ-05 **Send Back to Entity** (creates clarification + issue→in_progress) · DQ-13 finish quick actions.

### WS-A5 · Clarifications (both portals) (1 MISSING + 5 PARTIAL)
CLR-07 **Conversation/Evidence/History tab bar** · CLR-04 list pagination · CLR-05 prev/next/back · CLR-08 attach (ECL-03) +
emoji · CLR-13 / MD-12 **Assign Reviewer** picker (persist) · CLR-15 / MD-15 **Full Audit Trail modal**.

### WS-A6 · Config (3 PARTIAL)
CFG-06 row kebab (Edit/Preview/Disable) · CFG-07 Section-Type drawer (read-only join) · CFG-12 idempotent publish
(no duplicate announcements on repeat).

### WS-A7 · Entity data screens (the bulk — 9 MISSING + ~15 PARTIAL)
- **Org:** OS-08 row Edit/Mark-not-in-scope/Delete (+ `PATCH/DELETE /org-structure/{id}`) · OS-07 department filter ·
  OS-10 Add-Comment composer (+ endpoint) · OS-12 / MD-06 Validate-Structure results modal (+ compute) · OS-13 submit guard.
- **Workforce:** WF-07 **inline-edit grid** (Job Family/Grade/Employment/Critical → PATCH, recount) · WF-08 row Edit/Delete +
  selection · WF-10 **Export CSV** (selected/filtered) · WF-09 real "Draft saved {time}" · WF-11 submit guard.
- **Workload:** WL-05 Validate (+ endpoint) · WL-06 row Edit/Mark-complete · WL-07 collapsible Guided Help.
- **Drivers:** DD-02 Export · DD-03 driver Edit/Delete · DD-04 Driver-Map chip click→edit · DD-05 evidence link/quality/relink/delete ·
  DD-07 / MD-11 Link-to-Sections modal (persist) · DD-08 Reply composer.
- Shared: MD-14 delete confirms · MD-19 upload overlays on org/workload/evidence.

### WS-A8 · Misc (EH-03 unread-clears, MD-21 reset confirm, flow polish FLOW-02/03/06/09/10 gaps).

---

## TRACK B — 20-CATEGORY UI E2E HARNESS (everything, from the UI)

**New infra:** `@axe-core/playwright` (a11y+contrast); Playwright **projects** for Chromium / Firefox / WebKit(Safari) / Edge(channel);
responsive viewport param (1280 / 1440 / 1920); perf timing.

| # | Category | Spec (new unless noted) | What it asserts |
|---|---|---|---|
| 1 | Click | `click.spec` | every button/link → its real effect (not just present) |
| 2 | Form | `form.spec` | every modal/form: type, select, tick, submit → persists |
| 3 | Navigation | `nav.spec` (extend shell) | every nav + View-all + link → right screen, no dead links |
| 4 | Upload/Download | `upload-download.spec` | every UPLOAD + EXPORT through the UI |
| 5 | State/flow | `flow.spec` (extend L4/L5) | FLOW-01…10 two-window |
| 6 | Visibility | `sweep-overlays.spec` ✓ | overlays open fully visible |
| 7 | Layout | `layout.spec` | no overflow/overlap/off-screen (assertElementsInBounds) |
| 8 | Snapshot | `snapshots.spec` ✓ | per-screen pixel baseline |
| 9 | Responsive | `responsive.spec` | screens at 1280/1440/1920, no break |
| 10 | Empty/loading/error | `states.spec` ✓ (extend) | sparse DHA + skeletons + friendly errors |
| 11 | Content | `content.spec` | on-screen numbers == API values |
| 12 | Live-update | `L4_propagation.spec` ✓ | cross-portal ≤5s |
| 13 | Screen-reader label | `a11y.spec` (axe) | every control has an accessible name |
| 14 | Keyboard | `keyboard.spec` | tab to + operate everything, no mouse |
| 15 | Contrast | `a11y.spec` (axe) | text contrast passes |
| 16 | Bad-input | `bad-input.spec` ✓ (extend) | wrong file, empty search, huge numbers |
| 17 | Boundary | `boundary.spec` | first/last page, zero results, long text |
| 18 | Performance | `perf.spec` | 1,248-row table loads within budget |
| 19 | Cross-browser | Playwright projects | all specs on Chromium/Firefox/WebKit/Edge |
| 20 | Console-error | `L3_sweep.spec` ✓ | zero uncaught JS errors / 5xx |

---

## SEQUENCING & ORCHESTRATION
1. WS-A0 foundations → then WS-A1…A8 (each: build → typecheck → targeted e2e → move on).
2. Author Track-B harness in parallel with build (per-category spec files).
3. After all build lands: run the **full 20-category matrix across all 4 browsers**; fix reds; re-run.
4. Update `VERIFICATION_REPORT.md` so **every one of the 194 IDs** has a PASS / STUB-AS-SPECED row with evidence.
5. Adversarial review pass; then (with your go-ahead) commit.

## HONEST SCOPE NOTE
This is ~74 build items (several are substantial: command palette, inline-edit grid, guard modals, issue drawer, tab bars)
plus new cross-browser/a11y/perf test infrastructure. It is a multi-phase effort; I'll drive it phase-by-phase, keep the
app green after each phase, and report progress against the ID list — no "done" claim until every ID maps to evidence.
