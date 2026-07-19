# PRD — FULL FUNCTIONALITY REQUIREMENTS
## DGHR Workforce Planning Portal MVP · "Every button, every click, every popup, every flow — real, stored, and round-trip"

> **Operator note (Amro):** This PRD is the behavior contract: it enumerates, with requirement IDs, every interactive element, popup, page, and cross-portal flow that must demonstrably work. SPEC.md governs how things look and are built; **this PRD governs what must work**; FUNCTIONAL_ACCEPTANCE.md governs how "working" is proven; VERIFICATION_REPORT.md maps every ID here to evidence.

---

## 1. PURPOSE, SCOPE, TRACEABILITY

**Purpose.** Remove every ambiguity about what "the application works" means by assigning a requirement ID to every interactive element (button, link, toggle, select, checkbox, upload, composer, chart interaction), every popup (modal, drawer, dropdown, tooltip-with-content, toast), every page, and every end-to-end flow between the DGHR and Entity portals — each with its required behavior, backend/database effect, and acceptance criterion.

**Scope.** The entire MVP defined in SPEC.md v2: 13 built pages (6 DGHR incl. Forecasting Readiness, 7 Entity incl. My Submissions and Clarifications), 9 placeholder pages, the shared header/sidebar system, ~22 modals/drawers, the notification system, the import engine, 3 AI features, the demo panel, and 10 cross-portal flows.

**Traceability rule.** Every ID below (G-xx, CLS-xx, HDR-xx, CC-xx, …, FLOW-xx, DR-xx) must appear as a row in VERIFICATION_REPORT.md with observed evidence. Coverage target: **100%**. An ID not tested is UNTESTED and blocks the "fully functional" claim (per FUNCTIONAL_ACCEPTANCE §6).

---

## 2. GLOBAL REQUIREMENTS (apply to every page and element)

| ID | Requirement |
|---|---|
| G-01 | **Real data only.** Every number, count, %, badge, chart value, list, and name is fetched from the API, which computes it from PostgreSQL. No metric literals in `frontend/src/pages/`. No frontend mock data paths, even disabled ones. |
| G-02 | **Every mutation is a transaction** that (a) changes the target rows, (b) writes an `audit_events` row, (c) writes a `notifications` row for the opposite audience where §8 flows require it, (d) bumps global last-updated. Partial writes are a defect. |
| G-03 | **Persistence.** Every mutation survives page reload and `docker compose restart backend`. UI state that must persist: persona (localStorage), filters in URL query params. |
| G-04 | **Liveness.** Live query keys refetch every 4s. Cross-portal effects visible ≤5s without manual refresh, with a sonner toast for the rows marked 🔵 in §8. |
| G-05 | **No dead ends.** Every clickable element is either F (real effect) or S (designed "Available in the full release" toast/placeholder). Nothing no-ops, 404s, or logs-and-exits. |
| G-06 | **State-machine legality.** Package transitions only per SPEC §5. Illegal requests → HTTP 409 with a human message; UI hides/disables illegal actions. |
| G-07 | **Idempotency & double-click safety.** Every mutating button disables while in flight; double-click → exactly one state change, one audit event, one notification. Publish and Approve Ready idempotent on repeat. |
| G-08 | **Persona scoping.** Entity APIs scoped by persona entity id; switching persona never leaks another entity's data on any screen, list, badge, or notification. |
| G-09 | **Loading & empty states.** Every card/table shows a skeleton while loading and a designed EmptyState when its dataset is empty (verify with sparse DHA persona). |
| G-10 | **Error handling.** Invalid input → specific inline message or friendly 4xx (bad Excel names missing columns). No blank screens, infinite spinners, or raw stack traces. Zero uncaught console errors, zero unexpected failed network calls. |
| G-11 | **Guard modals, not blockers.** Submissions with open issues warn with the real issue list and offer "Submit anyway" — never hard-block. |
| G-12 | **Dates runtime-relative** (seeded off today); relative labels ("10 min ago"); GST footnote on Data Quality. Numbers via `Intl.NumberFormat('en-AE')`. |
| G-13 | **Cross-screen consistency.** Any fact shown on two screens comes from the same tables and never disagrees. `python -m app.checks` passes at any resting point. |
| G-14 | **Reset restores canon.** `POST /api/demo/reset` returns DB to SPEC §7 exactly; all seed checks ✓. |
| G-15 | **Vision containment.** POV numbers render only in Forecasting Readiness Zone 2, from §7.6 tables, each VisionBadge-labeled. |
| G-16 | **Copy & voice.** Mockup screens verbatim; other copy per SPEC §4.4; AI outputs in analyst insight register (live and fallback). |

---

## 3. INTERACTION CLASSES (behavior templates)

| Class | Baseline required behavior |
|---|---|
| **NAV** | Click routes to named screen/anchor (optionally filters as URL params); target renders; Back returns; sidebar active state correct. |
| **FILTER / SORT / PAGE / SEARCH** | Server-side: changes API query; result set, counts, "Showing X to Y of Z" update; combines with other filters; persists in URL; Clear resets all. |
| **MUT** | Click → single API call → G-02 chain → immediate UI update → success toast; in-flight disabled; failure → error toast + state unchanged. |
| **INLINE-EDIT** | Cell change PATCHes immediately; survives reload; dependent values recompute; failed PATCH reverts the cell with a toast. |
| **MODAL / DRAWER** | Opens on trigger; ESC/✕/click-outside/Cancel closes with zero side effects; primary disabled until valid; action follows MUT; closes on success; error inline; focus returns to trigger. |
| **UPLOAD** | Drag-drop AND browse; client type/size check; staged server processing; result summary; dependent cards/tables/KPIs refresh; file row in history; invalid → friendly 422 naming the problem. |
| **EXPORT** | Generates + downloads a real file reflecting current filtered/selected view; opens and contains on-screen data. |
| **AI** | Shows "✨ Analyzing…" 1.5–3s; returns ≤10s; result rendered + cached where specified; fallback+offline indistinguishable; voice per G-16. |
| **COMPOSER** | Empty input → Send disabled; send posts as current persona side, appends to thread instantly, notifies other side, clears input; attachment per UPLOAD. |
| **TOGGLE / SELECT (config)** | Persists via PATCH; reload-stable; dependent displays recompute. |
| **STUB (S)** | Styled toast "Available in the full release" — consistent, intentional, never silent. |
| **LIVE** | Widget updates ≤5s after a relevant remote mutation, no refresh. |

---

_(Registers §4–§7: shared shell HDR/SB/PLC · DGHR CC/CFG/TRK/DQ/FR/CLR/DRW · Entity EH/MS/OS/WF/WL/DD/ECL · Popups MD-01…MD-22 · Flows FLOW-01…10 · Data DR-01…05 — full text as supplied by the operator; the verification report maps every ID to evidence.)_

See the operator-supplied master for the complete per-ID tables. Requirement IDs are the contract; VERIFICATION_REPORT.md must show each as PASS or STUB-AS-SPECED with concrete evidence.

## 10. ACCEPTANCE, COVERAGE & DEFINITION OF DONE

1. **Coverage:** every ID appears in VERIFICATION_REPORT.md with evidence and a status; 100% PASS or STUB-AS-SPECED. UNTESTED = not done.
2. **Flows:** FLOW-01…10 executed live in a two-window session; each step's opposite-portal + DB effect observed; propagation ≤5s wherever 🔵.
3. **Environment:** all from a clean clone + `docker compose up`, and repeated once with `DEMO_AI_MODE=fallback` + network off for every AI-class ID.
4. The sentence "every functionality is fully functional" is earned, not asserted.

**Definition of done:** a stranger can sit at two browser windows, click any element on any page in any order, and every click either performs its real, persisted, propagated effect or shows its designed stub — and the full DGHR ↔ Entity cycle (FLOW-02 → 03 → 04 → 07) runs back and forth without a single workaround.
