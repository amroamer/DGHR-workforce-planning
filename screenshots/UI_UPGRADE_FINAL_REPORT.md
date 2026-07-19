# DGHR Workforce Planning — UI Look-and-Feel Upgrade
## Final Report (per the transformation brief §23)

**Scope:** a complete visual-system upgrade of the whole application — premium, executive,
government-grade — with **no change to any functionality, data, calculations, APIs, routes, or copy.**
Verified against the brief section by section. Screenshots for all 23 screens in **both light and
dark** are in this folder and indexed in `screens-index.xlsx`.

---

### 1. Summary of what was changed
The upgrade was built **token-first** so it cascades consistently to every page and both themes,
rather than page-by-page one-offs. A single design-token layer drives colour, surfaces, elevation,
radius, typography and motion; the shared components were rebuilt on it; then each of the 23 screens
received its brief-specific refinements; finally a controlled motion system was added. The result is
one coherent product across every page, table, form, chart, card, status and theme.

### 2. Shared design-system changes
- **Tokens** (`styles/tokens.css`): refined light + dark palettes; 4 surface levels
  (card / secondary / elevated / inset); a 3-step elevation shadow scale; focus-ring + `border-strong`
  tokens; a full motion scale (durations + easings); a soft light-mode header gradient.
- **Tailwind** (`tailwind.config.ts`): radius scale (card / card-lg / btn / sm / modal), elevation
  shadows, surface colours, motion utilities.
- **Standardised**: focus rings app-wide, tabular numerals (`.nums`), a standardised `<select>` chevron
  (`.select-field`), one dash style (`—`) for missing values, a smooth theme cross-fade, and a
  tab/scenario cross-fade (`.animate-fade`).
- **Accessibility**: a measured WCAG contrast pass on every text/semantic token → 0 fails in both themes.

### 3. Shared components updated
App shell, **Sidebar** (sliding active pill via framer-motion, wrapping labels, dark separation),
**PageHeader**, **Card** (4 levels), **KPI card**, **Button** (hierarchy + press motion), **Field kit**
(Input / Select / Textarea / Label / ReadOnlyField / CalcField), **Alert** banner, **DataTable** +
shared table classes, **StatusBadge**, **ProgressBar**, **EmptyState**, chart wrappers
(`charts.tsx`, `dashcharts.tsx`) with final-value labels and mount-once entrance animation.

### 4. Pages updated (all 23)
**DGHR / central:** Human Capital Overview, Demand Analysis, Supply Analysis, Government-Wide Position,
Entity Drill-Down, Submission Review, Method & Typeset Library, Alerts & Smart Flags, Reports,
Cycle & Administration, Cycle History, Knowledge Center.
**Entity:** Departments, the 5-step submission wizard (Your team, Smart Assist, Your drivers,
Fixed requirements, Review & submit), My Submissions, Reports, Documents, Programme & Wave Management,
Help & Support. Each applied its §19 brief items (hero KPI emphasis, chart prominence + value labels,
softened filters, compact banners, tinted read-only / calc fields, mono formulas, taller table rows,
grouped reconciliation, etc.).

### 5. Animation changes
Page entry fade-in; button press (scale-98); card hover-lift; **sliding sidebar active pill**;
tab/scenario cross-fade; KPI count-up; progress-bar fill; **mount-once chart entrances** (guarded so the
4-second poll never re-animates); smooth theme colour cross-fade; a gentle current-date pulse on the
programme timeline. All respect `prefers-reduced-motion`.

### 6. Accessibility improvements
Standardised always-visible focus rings; dark sidebar now separates from the page; sidebar labels no
longer truncate (wrap + tooltip); **measured WCAG contrast (0 fails both themes)**; verified no
horizontal overflow at **100 / 125 / 150 %** zoom; tabular numerals for scannability; reduced-motion
honoured; status meaning not conveyed by colour alone (icon + label + badge).

### 7. Files changed (high level)
`styles/tokens.css`, `tailwind.config.ts`, `stores/theme.ts`, `lib/useChartTheme.ts`, `lib/utils.ts`;
shared UI (`ui/button`, `ui/card`, `ui/field`, `ui/alert`, `ui/table`); shared components (Sidebar,
KpiCard, DataTable, ProgressBar, EmptyState, StatusBadge, charts, dashcharts, widgets,
SubmissionPipeline, ClarificationsView, DemoPanel, EntityDrawer, PctChip, Modal); and the 23 page files
across `pages/dghr`, `pages/entity`, `pages/planning`. Full tracked detail in `docs/UI_POLISH_TODO.md`.

### 8. Functionality unchanged ✅
No features added or removed; no workflows, forms, filters, buttons, or user journeys changed.

### 9. Business logic unchanged ✅
No calculations, statuses, or numeric values changed. Every displayed number still comes from the API.

### 10. APIs unchanged ✅
No endpoint, contract, or request/response shape was touched.

### 11. Routes unchanged ✅
No route added, removed, or repointed.

### 12. Light and dark tested ✅
All 23 screens captured and reviewed in both themes (this folder). Parity verified: **0** `dark:` rules
alter layout, size, or visibility — only colour/shadow/gradient differ.

### 13. Linting / type checks passed ✅
`tsc -b --noEmit` clean · `vite build` clean · Playwright functional suite **62 passed**
(accessibility, light/dark, calculation traceability, layout, responsive at 1280/1440/1920).

### 14. Remaining visual limitations
- Chart **series colours** and the Calendar **SVG timeline** remain concrete hex — CSS `var()` cannot
  resolve inside SVG (this is why a chart-theme hook exists). They are tuned to read in both themes.
- The full-red destructive button is used only inside confirmation dialogs (the context the brief allows).
- "Before" screenshots were not retained from prior to the upgrade; the sets here are the current
  (post-upgrade) state in both themes.

### 15. Screenshots
All 23 screens × 2 themes (46 PNGs), full-page at 1440 px, in this folder and indexed in
`screens-index.xlsx` (with an added **MD Compliance** sheet). Representative examples:

| Screen | Light | Dark |
|---|---|---|
| Human Capital Overview | `dghr-01-hc-overview-light.png` | `dghr-01-hc-overview-dark.png` |
| Government-Wide Position | `dghr-04-government-position-light.png` | `dghr-04-government-position-dark.png` |
| Method & Typeset Library | `dghr-07-method-and-typesets-light.png` | `dghr-07-method-and-typesets-dark.png` |
| Alerts & Smart Flags | `dghr-08-alerts-and-smart-flags-light.png` | `dghr-08-alerts-and-smart-flags-dark.png` |
| Cycle History | `dghr-11-cycle-history-light.png` | `dghr-11-cycle-history-dark.png` |
| Departments | `entity-01-departments-light.png` | `entity-01-departments-dark.png` |
| Submission wizard — Your drivers | `entity-02c-step3-your-drivers-light.png` | `entity-02c-step3-your-drivers-dark.png` |
| Programme & Wave Management | `entity-06-programme-wave-light.png` | `entity-06-programme-wave-dark.png` |

*Report generated after the final verification pass. See `docs/UI_POLISH_TODO.md` for the full
section-by-section audit trail.*
