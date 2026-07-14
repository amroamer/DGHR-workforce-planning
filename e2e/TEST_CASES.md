# DGHR Portal — End-to-End Test Cases

Every case is written from the **end-user's point of view** and implemented in `tests/*.spec.ts`
(run against the live app on http://localhost:5183 with real clicks/typing).
Legend: **S**=simple · **M**=medium · **C**=complex · **E**=edge.

## A. App shell, navigation, persona, notifications  (`shell.spec.ts`)
- A1 (S) DGHR shell loads: crest, "DGHR / Workforce Planning Portal", full nav, user card.
- A2 (S) Every DGHR sidebar item navigates and the clicked item becomes the active (blue) pill.
- A3 (S) Roadmap items (Entities/Alerts/Reports/Admin/Knowledge) show a designed "Coming with the full release" placeholder with a working Back button — **no dead links**.
- A4 (M) Persona switcher: clicking the avatar chip **opens a dropdown** listing 3 personas.
- A5 (M) Switching to Dubai Municipality swaps the whole shell (entity nav, entity name, Ahmed Al Mansoori card).
- A6 (E) Persona **persists across reload** (localStorage).
- A7 (M) Notification bell: clicking it **opens a dropdown**; it shows an unread count badge; "Mark all read" clears it.
- A8 (S) Header refresh button re-fetches (no crash); "Last updated" time is present.
- A9 (E) Unknown route redirects to the persona's home.

## B. Command Center  (`command-center.spec.ts`)
- B1 (S) 6 KPI cards render with non-empty values (59, 27, etc.).
- B2 (S) Status donut + legend with 6 statuses visible; footnote present.
- B3 (M) "Entities Requiring Action" table lists rows; a row ⋯ **opens the entity drawer** (visible), which shows package bars + actions.
- B4 (M) Next-action link "Send Reminder" fires a success toast.
- B5 (M) "Approve Ready Entities" fires a toast and the KPI values change (ready count drops).
- B6 (S) Data Readiness tiles + Missing Data Summary (5 icons) + Alerts + Trend chart render.
- B7 (S) "View all →" on the action queue navigates to the Tracker.

## C. Data Request Configuration  (`data-collection.spec.ts`)
- C1 (S) 4 KPI cards (8 / 386 / 7 / deadline) + cycle bar with Active badge render.
- C2 (S) 8 package rows render with icons, field counts, evidence badges, Configured status.
- C3 (M) A package **mandatory toggle** flips on click and shows a success toast.
- C4 (M) "Expand All" reveals field-group chips.
- C5 (C) "Preview Entity View" switches persona to DM and lands on the entity Home.
- C6 (M) "Publish Request Package" fires a success toast.
- C7 (S) Section-Type Templates rail lists 7 active templates.

## D. Submission Tracker  (`tracker.spec.ts`)
- D1 (S) 5 KPI cards render; table shows the pinned DHA/RTA/DM first.
- D2 (M) **Wave dropdown** is visible, opens, and filtering to W2 changes the rows (all W2).
- D3 (C) Composing two filters (Status=Submitted + Wave=W1) narrows the table correctly.
- D4 (M) Sorting by "Overall Completeness" reorders rows.
- D5 (M) Pagination: page 2 loads different rows; page pills work.
- D6 (M) "Clear Filters" resets to the default list.
- D7 (M) Follow-up rail item click applies a filter (e.g. Returned).
- D8 (M) Row ⋯ opens the entity drawer.
- D9 (E) A filter combination that returns nothing shows an empty table gracefully.
- D10 (S) PctChip colours: ≥80 green, mid orange, <40 red (at least present).

## E. Data Quality  (`data-quality.spec.ts`)
- E1 (S) 6 KPI cards render (82/30/1248/126/37/11-ish).
- E2 (M) Validation Issues Queue lists 8 rows with severity badges + AI-confidence bars; pagination works.
- E3 (M) Quality-by-entity bar chart renders with the highlighted Overall Average.
- E4 (C) Clicking an anomaly **opens the anomaly drawer**; "Generate AI Narrative" shows an Analyzing state then a narrative.
- E5 (M) Anomaly drawer "Open Clarification" fires a toast (creates a case).
- E6 (S) Evidence overview tiles (126/214/372) + top gaps render.

## F. Forecasting Readiness  (`readiness.spec.ts`)
- F1 (S) 5 Zone-1 KPIs render (11 ready / 48 blocked / …); readiness ring present.
- F2 (M) Entity Readiness filter **Ready/Blocked** toggles change the table.
- F3 (E) **Every Zone-2 card carries the "Layer B Preview · Illustrative" badge** (count them).
- F4 (S) Skills-gap chart, scenario chart, and 4 insight quotes render.
- F5 (S) Factory-quote footer text is present; "Open Tracker" navigates.

## G. Clarifications — DGHR + Entity  (`clarifications.spec.ts`)
- G1 (S) DGHR: 5 KPIs + grouped case list (Open/Returned/Resolved) render.
- G2 (M) Tabs (Open/Returned/Resolved) filter the list.
- G3 (M) Clicking a case shows its detail (meta, issue, thread, quick actions).
- G4 (C) Typing a message and clicking Send appends it to the thread.
- G5 (M) A DGHR quick action (Escalate) fires a toast and records an audit event.
- G6 (E) Search with a nonsense term yields an empty list without error.
- G7 (M) Entity side: scoped to DM (only DM cases), shows entity actions (Reply/Acknowledge/Resubmit).

## H. Entity Home + package screens  (`entity.spec.ts`)
- H1 (S) Home: 5 KPIs (68% ring etc.), 5 required-submission rows, messages, deadlines.
- H2 (M) A "Continue"/"View" button routes to the right package screen.
- H3 (M) Org Structure: hierarchy tree expands on click; table filter dropdowns work; pagination works.
- H4 (S) Org Structure: Download Template triggers a download; Import opens a file picker.
- H5 (M) Workforce: 1,248-row table paginates; **rows-per-page dropdown** changes page size.
- H6 (C) Workforce: "Map Fields" opens the Mapping Drawer with an Analyzing state then suggestions + Accept.
- H7 (M) Workforce: search filters the table; Run Validation fires a toast.
- H8 (M) Workload: 9 rows with sparklines; coverage donut; Submit fires a toast.
- H9 (C) Demand Drivers: left tabs (Drivers/Map) and right tabs (Evidence/AI/Linked) switch; "Run AI Summary" shows Analyzing then a summary.
- H10 (S) My Submissions: 5 package rows with action buttons.
- H11 (E) DHA persona → Workforce/Workload/Org show a clean **EmptyState** (no data, no crash).

## I. Cross-portal live loop  (`loop.spec.ts`)
- I1 (C) Entity submits a package → DGHR Command Center "received"/progress increases (two contexts).
- I2 (C) DGHR opens a clarification on DM → entity Clarifications badge/list count increases.

## SWEEP — exhaustive per-instance coverage of EVERY control
- **sweep-dropdowns** — every `<select>` (Tracker ×5, Workforce ×4, Org ×2), cycling **every option**.
- **sweep-controls** — **all 8** package toggles, checkboxes (select-all + rows), **every tab**
  (Clarifications ×4, Demand Drivers left ×2 + right ×3), segmented filters (Readiness ×3),
  both sortable headers, pagination on **every** table.
- **sweep-overlays (VISUAL)** — every pop-over/drawer/panel (persona, bell, entity drawer,
  anomaly drawer, mapping drawer, demo panel) must open **fully visible** — asserted with a
  helper that checks the element is inside the viewport **and is the top element at its centre**
  (catches `overflow:hidden` clipping + z-index occlusion, not just DOM presence).
- **sweep-uploads** — **real files pushed through every dropzone in the UI** (Workforce xlsx,
  Org csv, Workload csv, Evidence pdf) via `setInputFiles`, verifying the on-screen result.
- **buttons** — **every visible button on all 13 screens (both portals)** asserted present,
  labeled/iconed and usable; stub buttons clicked to confirm they respond.

### Real issues this sweep found & fixed
1. **Persona + notification dropdowns were clipped** by the page header's `overflow-hidden`
   (functional but visually cut off) → header no longer clips; skyline clips on its own wrapper.
2. **Entity drawer action buttons sat below the fold** in the scroll area → moved to a pinned footer.
3. **Toggle switches had no accessible label** → added `role="switch"` + `aria-label`.
4. Pagination counts weren't thousands-grouped ("1248" → "1,248").

**Result: 98/98 tests pass; demo data reset (wiped) before & after the run.**
