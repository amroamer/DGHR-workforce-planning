// Shared class strings for hand-rolled tables (SPEC §12). Not a wrapper component — the
// bespoke tables across the app keep their own markup and just adopt these classes so row
// height, hover tint, quiet headers, numeric alignment and separators are consistent with
// the shared DataTable. Import and spread into className.

/** <thead> row: quiet, non-heavy header with horizontal separator. */
export const THEAD_TR =
  "border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text3";

/** <th> cell padding. Add `text-right` yourself for numeric columns. */
export const TH = "px-3 py-2.5";

/** <tbody> row: soft hover tint + separator (no heavy cell boxes). */
export const TROW = "border-b border-border transition-colors duration-fast last:border-0 hover:bg-surface2";

/** <td> cell: comfortable row height. Add `text-right nums` for numeric columns. */
export const TD = "px-3 py-3.5 text-sm text-text1";

/** Numeric <td>/<th> — right-aligned, tabular figures. */
export const TD_NUM = "px-3 py-3.5 text-right text-sm text-text1 nums";
export const TH_NUM = "px-3 py-2.5 text-right";
