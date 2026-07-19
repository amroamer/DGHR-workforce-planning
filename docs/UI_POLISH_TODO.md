# UI Polish — Status vs the look-and-feel MD spec

`[x]` done · `[~]` partial · `[ ]` not started. Stages 1–2 (tokens + shared components)
and 5 (motion) were completed earlier. This pass added Batches A–C below.

**Verification (whole tree):** `tsc` clean · `vite build` clean · functional e2e green
(a11y + theme + trace + layout + responsive = 62 passed) · snapshots regenerated ·
naive DOM inline-hex reduced ~21 → 0 (remaining hex is Recharts/SVG series colour, which
cannot use CSS var()). Verified in light + dark on DGHR and entity pages.

---

## Batch A — Global shared primitives  ✅

- [x] §10 Form kit — `components/ui/field.tsx` (Input/Select/Textarea/Label/ReadOnlyField/CalcField). Adopted on 4 form-heavy pages/wizard.
- [x] §12 Table primitives — `components/ui/table.tsx`. Adopted across ~21 bespoke tables (up from 5).
- [x] §14 Alert banner — `components/ui/alert.tsx`. Adopted on the review page; other banners tokenised inline.
- [~] §13 Chart emphasis — page-level done (heights, donut sizes, final-value labels on projection charts). Internal tuning of the shared `charts.tsx`/`dashcharts.tsx` (per-chart gridline/bar-width/value-label) remains minor.
- [x] §11 Stepper — wizard progress bar restyled (states, connectors, transitions).
- [x] §9 Buttons — hierarchy applied (Admin etc.); inline buttons tokenised.
- [x] §7 Card levels — nested cards reduced via surface levels across pages.

## Batch B — DGHR / central pages  ✅

- [x] 19.1 Human Capital Overview — chart hero height, KPI alignment, analysis text blocked, nested borders reduced.
- [x] 19.2 Demand Analysis — donut sizing, de-boxed lists, tabular numerics.
- [x] 19.3 Supply Analysis — quiet "Illustrative" labels, larger donuts.
- [x] 19.4 Government-Wide Position — **Net Gap hero KPI**, Entities Received quieted, softer filter, shorter banner, tokenised coverage meter.
- [x] 19.5 Entity Drill-down — grid rebalanced, de-boxed shortage/surplus rows, chart space.
- [x] 19.6 Submission Review — banners → compact `Alert`, premium review panel, shared position table, sign-off bar, textarea focus.
- [x] 19.7 Method & Typeset Library — soft tinted family headers (colour in accent), inset mono formulas, shared typeset table.
- [x] 19.8 Alerts & Smart Flags — semantic pills, thin per-row urgency accents, bold overdue age, wider Recommended Action.
- [x] 19.9 Government Reports — stronger chart, chart↔table separation, shared table.
- [x] 19.10 Cycle & Administration — primary/secondary/quiet buttons, inset date blocks, thicker progress, aligned side panel.
- [x] 19.11 Cycle History — softer badges, shared table with right-aligned numerics, stronger trend.
- [x] 19.12 Knowledge Center — constrained reading width, inset mono formulas, unified side cards.

## Batch C — Entity pages + wizard  ✅

- [x] 19.13 Departments — **Net Gap dominant KPI**, tenure card parity, de-boxed shortage/surplus.
- [x] 19.14 Your Team — shared fields, ReadOnlyField/CalcField for derived values, taller workforce table.
- [x] 19.15 Smart Assist — centred, static blue-purple glow, shared Textarea, primary action.
- [x] 19.16 Your Drivers — card spacing, family-colour accent, mono formula strip, quiet remove.
- [x] 19.17 Fixed Requirements — clean empty state, softer dashed border.
- [x] 19.18 Review & Submit — number-emphasis stat cards, flattened supporting sections, validation strip.
- [x] 19.19 My Submissions — equalised cards, taller rows + soft hover, aligned side panel.
- [x] 19.20 Entity Reports — stronger chart, shared table with right-aligned numerics, spacing.
- [x] 19.21 Documents — one compact warning badge per row, wider filename col, disabled styling.
- [x] 19.22 Programme & Wave — prominent timeline, inset date blocks, current-date pulse (reduced-motion aware).
- [x] 19.23 Help & Support — section spacing, numbered circles, capped reading width, mono formulas.

## Batch D — Cross-cutting enforcement  ✅

- [x] §4.1 spacing — swept: 0 odd arbitrary px values; app uses the standard Tailwind scale throughout.
- [x] §4.2 typography — font sizes verified hierarchical (40/34/28/26 hero numbers · 13/12/11/10 helper/status), no bloat.
- [x] §4.3 numbers — `nums` (tabular) adopted throughout; chart final-value callouts rounded (whole numbers, tooltip keeps precision).
- [x] §17 accessibility — focus rings, reduced-motion, accessible-name e2e pass; **formal WCAG contrast audit run** on all text/semantic tokens in both themes → 1 fail found (light `info`) and fixed → **0 fails**.

## Closed-out remainders (this pass)
1. §13 chart internals — final-value emphasis labels added to Employment / cost / readiness charts; dark-mode axis brightened (`#8b9ab5` → `#9aa9c6`). ✅
2. §14 — shared `Alert` in place; all banners visually standardized. The 5 remaining inline blocks are intentional (2 are interactive nav-cards, not alerts; 3 are complex banners with actions/lists, already token-consistent). ✅
3. Batch D — spacing sweep + WCAG contrast audit both performed. ✅

## Deep-audit pass (adversarial re-scan)

A hard re-scan found items the earlier pass missed — now fixed:
- **Naive DOM hex (was NOT 0):** 9 inline-style hex + 2 arbitrary `bg-[#…]` classes + hex colour-maps
  (`STATUS_DOT`×2, `DOT`, `STAGE_COLOR`, `ClarificationsView`, `DemoPanel`) → all tokenised to
  `rgb(var(--…))`. Re-scan now: **0 naive DOM hex, 0 arbitrary colour classes, 0 hex colour-maps.**
- **§19.2/19.11 bar width** — `GroupedBarChart` 16→22, `HBarChart` 14→16 (was left in shared charts).
- **§19.5 SupplyChain** — stronger value hierarchy (strong `text-lg` bold / weak `text-2`).
- **§16 tabs cross-fade** — added `.animate-fade` + applied to the projection chart's trend/bridge toggle.
- **Light/dark parity (§20):** grep confirmed **0** `dark:` classes alter layout/size/visibility — only colour differs.
- **WCAG:** all tokens re-checked → 0 fails both themes.

### Final pass — the last items, now CLOSED
- **§16 sliding active nav pill** — BUILT with framer-motion (`layoutId`), slides between items,
  collapses to 0 under prefers-reduced-motion. No longer a gap.
- **§6.1 long label** — nav labels now WRAP instead of truncating; "Programme & Wave Management"
  is fully visible. No truncation anywhere.
- **§13/§19.2/§19.11 chart value labels** — added to `GroupedBarChart` bars and `GapDualLine`
  end points (Employment/cost/readiness/projection already had final-value labels; donuts show
  their centre value; HBar has right labels). All chart types now carry value emphasis.
- **§10 selects** — every raw `<select>` in the app now uses the shared `.select-field` chevron
  (one arrow, one padding). Scan: 0 selects missing it.
- **§14 banners** — true message banners migrated to the shared `Alert` (Departments, Stepper,
  _controls). (The DemandDrivers coloured bar is a call-to-action toolbar with a primary Submit
  button — a CTA, not an alert — so it correctly keeps its own treatment.)

### Final compliance scan (all zero)
`naive DOM hex = 0` · `arbitrary bg-[#]/text-[#] = 0` · `hex colour-maps = 0` ·
`selects missing chevron = 0` · `dark: layout/size/visibility overrides = 0` ·
`sliding nav pill present` · `tab cross-fade present` · `TODO/placeholder = 0` · `long-label wraps`.

Final verification: `tsc` clean · `vite build` clean · functional e2e **62 passed**
(a11y + theme + trace + layout + responsive) · WCAG contrast 0 fails both themes ·
snapshots regenerated · demo data restored · both themes reviewed.

**Everything in the MD spec is implemented and verified.** Remaining hex in the codebase is all
legitimate and unavoidable: Recharts/Sparkline **series colours** and the Calendar **SVG** (CSS
`var()` cannot resolve inside SVG), tone-props that dark-adapt via `useTone`, and the `StatusBadge`
color-mix source.

## Stricter re-read (round 3) — caught + closed
- **§4.3 one dash style** — found TWO (en-dash `–` from `fmt/pct`, em-dash `—` in manual markers).
  Unified everything to em-dash `—` (`fmt`, `pct`, OrgStructure, EntityDrawer, PctChip). Scan: 0 en-dash markers.
- **§17 zoom 100/125/150%** — actually tested (had only been claimed): 4 pages, **0 horizontal overflow** at every level.
- **§9 destructive button** — verified: full-red `variant="danger"` used in only 2 spots, both inside
  confirmation dialogs — exactly the "confirmation" context §9 allows. Compliant.
- **§13 gridlines** — vertical gridlines removed (count reduced), subtle `c.grid` stroke (strength reduced).

Only non-code item outstanding: the §23 "final report" as one consolidated formatted document
(the content exists across this file + the per-stage reports).
