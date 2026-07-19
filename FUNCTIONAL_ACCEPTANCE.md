# FUNCTIONAL ACCEPTANCE — What "Fully Functional" Means, and How to Prove It

> **Operator note (Amro):** save as `FUNCTIONAL_ACCEPTANCE.md` in the repo root. Then give Claude Code the prompt in §7. This document overrides any looser interpretation of "done" or "working". Claude Code may not describe the application as "fully functional" except under the conditions in §6.

---

## 1. THE DEFINITION (binding)

**The application is *fully functional* when every user-visible capability specified in SPEC.md can be exercised by a real user through the UI, produces its specified effect end-to-end (UI → API → PostgreSQL → UI), persists across page reloads and container restarts, propagates to the other portal where specified, and does all of this starting from a clean `docker compose up` on a fresh clone — with zero dead ends, zero silent failures, and zero fabricated data — as demonstrated by executed evidence, not by reading the code.**

"Fully functional" is a **claim about observed behavior**, not about code existing. It is falsifiable: it is proven by running the checks in §4 and disproven by a single failing row.

---

## 2. THE FIVE PILLARS (each one is testable; all five are required)

**P1 — Truthful rendering.** Every metric, count, percentage, badge, chart value, and list on every screen comes from the API, which computes it from the database. Reloading the page shows the same values. Changing the underlying data (e.g., approving an entity) changes the rendered value. `grep` finds no numeric metric literals in `frontend/src/pages/`.

**P2 — Effective interaction.** Every interactive element (button, link, toggle, select, checkbox, row action, drawer action, form, upload, composer) does exactly what SPEC.md marks it as:
- **F (functional):** clicking it changes server state — verifiable as a 2xx mutation request, a changed row in PostgreSQL, a written `audit_events` row, a `notifications` row where specified, and a visible UI update without manual refresh.
- **S (stub):** clicking it shows the designed toast/placeholder ("Available in the full release") — styled, intentional, and consistent.
- **There is no third category.** An element that does nothing, logs to console, opens a broken route, or shows a success toast without a state change is a FAIL.

**P3 — Durable state.** Every mutation survives a page reload AND a `docker compose restart backend`. The package state machine only permits legal transitions (§5 of SPEC). `POST /api/demo/reset` restores the exact canonical seed, and `python -m app.checks` prints all ✓ afterward.

**P4 — Live propagation.** With two browser windows open (one per persona), every row of SPEC §11's action→effect matrix demonstrably propagates to the other portal within ≤5 seconds — toast fired, bell badge incremented, affected widgets re-rendered — with no manual refresh.

**P5 — Resilience.** Invalid input produces a friendly, specific error (bad Excel → which columns are missing; guard modals list real issues), never a blank screen, spinner-forever, or stack trace. Every card has a loading skeleton and an empty state. All three AI features return within 10s **and** work with `DEMO_AI_MODE=fallback` and networking disabled, indistinguishably. Sparse-data persona (DHA) renders every screen without errors. Zero uncaught console errors and zero failed network requests (except deliberate 4xx validations) across the full walkthrough.

---

## 3. WHAT DOES *NOT* COUNT AS FUNCTIONAL (explicit anti-definition)

Each of these has previously let agents claim "done" falsely. Any one of them found anywhere = the application is NOT fully functional:

1. "The code is written / it compiles / the build passes" — compilation is not behavior.
2. A button wired to `console.log`, a no-op handler, `href="#"`, or an unimplemented route.
3. A success toast, status change, or progress bar driven by frontend state only, with no persisted server-side change.
4. Screens rendering hardcoded or mocked frontend data instead of API data (including "temporary" mock fallbacks left enabled).
5. Features that work only in one happy path from a fresh seed and break on the second use, after a reload, or after another action touched the same data.
6. The demo script passing only because the presenter avoids certain clicks ("just don't press X").
7. Numbers that disagree between two screens showing the same fact (e.g., Tracker vs Command Center vs Entity Home).
8. Empty catch blocks / swallowed errors that hide failures behind a calm UI.
9. AI features that hang, error, or visibly degrade when the API key is absent or the network is off.
10. **Claiming verification without executing it.** Reading code and inferring it works is not verification. If a check was not run, its status is UNTESTED, not PASS.

---

## 4. THE VERIFICATION PROTOCOL (execute in order; L0 gates everything)

**L0 — Clean-room boot.** Fresh clone into a new directory → `docker compose up` → all 3 services healthy → migrations + seed ran automatically → `python -m app.checks` all ✓ → `/docs` serves the API contract. If L0 fails, stop: nothing else can be claimed.

**L1 — Static audits.**
- `grep -rnE '\b[0-9]{2,}\b' frontend/src/pages/` reviewed: no metric literals (layout constants are fine, values are not).
- Route inventory: every sidebar item, every "View all →", every button-with-navigation resolves to a real screen or the designed PlaceholderPage. Zero dead links.
- `grep -rn "TODO\|FIXME\|mock\|hardcode\|localStorage.setItem('data" frontend/src backend/app` reviewed; nothing load-bearing.

**L2 — API contract tests (pytest).** For every endpoint in SPEC §8: correct status code and response shape; for every mutating endpoint additionally assert the DB row changed, an `audit_events` row was written, and a `notifications` row exists for the opposite audience where §11 requires it. Include negative tests: illegal state transition rejected, bad import file → friendly 422.

**L3 — Full UI element walkthrough.** Build an inventory table of EVERY screen (all 12 built screens + all placeholder pages) and EVERY interactive element on each, from SPEC §9–§10 (they enumerate them). For each element record: expected (F/S + effect) → action performed → observed (network call, DB effect, UI change) → PASS / STUB-AS-SPECED / FAIL / UNTESTED. Browser console open throughout; any uncaught error = FAIL for that screen.

**L4 — The loop.** Two windows, DGHR + Dubai Municipality. Execute every row of SPEC §11's matrix; record propagation time per row. All ≤5s.

**L5 — The demo script.** Run SPEC §16's 7 beats start-to-finish **twice**: once normal, once with `DEMO_AI_MODE=fallback` and network disabled. Then `POST /demo/reset` and confirm `checks.py` all ✓ and beat 1's numbers are restored exactly.

**L6 — Chaos-lite.** Mid-session: reload every screen (state intact) · `docker compose restart backend` then continue working (recovers) · upload a malformed xlsx (friendly error) · double-click Submit (no duplicate state/case) · switch persona mid-flow (scope correct, no data bleed) · open a case that another window just resolved (UI reconciles).

---

## 5. THE EVIDENCE ARTIFACT — `VERIFICATION_REPORT.md` (mandatory output)

The protocol's output is a committed report containing: (a) L0 boot log summary and checks.py output; (b) L1 audit results with any findings; (c) L2 test run summary (`pytest` output: N passed / 0 failed); (d) the **full L3 inventory table** — every element, every screen, with observed evidence per row, and per-screen screenshots; (e) the L4 matrix with measured propagation times; (f) the L5 transcript (beat-by-beat, both runs); (g) L6 results; (h) a **defects list** — every FAIL/UNTESTED with root cause and fix status; (i) the final verdict per §6. Evidence must name concrete observations ("POST /api/entity/3/packages/current_workforce/submit → 200; entity_packages.status=submitted; audit_events id 412; DGHR toast at +2.1s"), not adjectives ("works fine").

---

## 6. THE HONESTY RULE (when the phrase "fully functional" may be used)

Claude Code may state the application is **fully functional** only when `VERIFICATION_REPORT.md` exists, is current for the exact commit being described, and shows: **every** L3 row is PASS or STUB-AS-SPECED, **every** L4 row ≤5s, **both** L5 runs completed with zero workarounds, L2 has zero failures, and L6 has zero unresolved findings. UNTESTED counts as not functional. Otherwise the only permitted phrasing is: **"X of Y verified elements pass; the following N items fail or are untested: …"** — followed by fixing them. Optimistic summaries, "should work", and "everything is implemented" are prohibited substitutes for the report.

---

## 7. PASTE-READY PROMPT FOR CLAUDE CODE

```
Read FUNCTIONAL_ACCEPTANCE.md in full. Your previous claim that the application is
"fully functional" is hereby reset to UNVERIFIED.

Execute the verification protocol in §4 literally and in order (L0 → L6), against a
clean clone. Do not skip a level, do not infer results from reading code — run every
check. Produce VERIFICATION_REPORT.md exactly per §5, with the complete per-element
inventory table and concrete evidence per row.

Report honestly per §6: if anything fails or is untested, list it, fix it, and re-run
the affected levels until the report is 100% PASS / STUB-AS-SPECED. Only then may you
state the application is fully functional. Start with L0 now and show me its output
before proceeding.
```
