import { cn } from "@/lib/utils";
import { useTheme } from "@/stores/theme";

// Canonical status/label → color mapping (SPEC §4.3). Never use ad-hoc colors for these.
type BadgeStyle = { bg: string; text: string; ring?: string };

const MAP: Record<string, BadgeStyle> = {
  // package / entity statuses
  not_started: { bg: "#F1F5F9", text: "#556070" },
  "not started": { bg: "#F1F5F9", text: "#556070" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  "in progress": { bg: "#DBEAFE", text: "#1D4ED8" },
  submitted: { bg: "#DCFCE7", text: "#15803D" },
  // entity roll-up ladder (services/sizing.py ROLLUP_LADDER) — an entity is a container of
  // departments, so it carries its own status axis. Colors climb the ladder monotonically:
  // grey → blue → amber (chase it) → violet (all in, awaiting sign-off) → green → ringed green.
  // Labels come from the API's rollup_labels so they can't drift from the ladder that defines them.
  partially_submitted: { bg: "#FEF3E2", text: "#C2410C" },
  fully_submitted: { bg: "#F1EAFE", text: "#7C3AED" },
  partially_approved: { bg: "#DCFCE7", text: "#15803D" },
  fully_approved: { bg: "#DCFCE7", text: "#15803D", ring: "#15803D" },
  under_review: { bg: "#F1EAFE", text: "#7C3AED" },
  "under review": { bg: "#F1EAFE", text: "#7C3AED" },
  returned: { bg: "#FFEDD5", text: "#C2410C" },
  approved: { bg: "#DCFCE7", text: "#15803D" },
  overdue: { bg: "#FDE2E2", text: "#B91C1C" },
  // case statuses
  open: { bg: "#FDEBEC", text: "#B91C1C" },
  responded: { bg: "#DBEAFE", text: "#1D4ED8" },
  resolved: { bg: "#DCFCE7", text: "#15803D" },
  // generic states
  complete: { bg: "#DCFCE7", text: "#15803D" },
  missing_data: { bg: "#FEF3E2", text: "#C2410C" },
  "missing data": { bg: "#FEF3E2", text: "#C2410C" },
  needs_attention: { bg: "#FEF3E2", text: "#C2410C" },
  "needs attention": { bg: "#FEF3E2", text: "#C2410C" },
  draft: { bg: "#FFFFFF", text: "#1D4ED8", ring: "#BFDBFE" },
  configured: { bg: "#E8F7EE", text: "#15803D" },
  active: { bg: "#E8F7EE", text: "#15803D" },
  mapped: { bg: "#DCFCE7", text: "#15803D" },
  partial: { bg: "#FEF3E2", text: "#C2410C" },
  unmapped: { bg: "#FDEBEC", text: "#B91C1C" },
  not_in_scope: { bg: "#F1F5F9", text: "#556070" },
  "not in scope": { bg: "#F1F5F9", text: "#556070" },
  // severity
  high: { bg: "#FDEBEC", text: "#B91C1C" },
  medium: { bg: "#FEF3E2", text: "#C2410C" },
  low: { bg: "#EEF2F7", text: "#475569" },
};

const LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  submitted: "Submitted",
  under_review: "Under Review",
  returned: "Returned",
  approved: "Approved",
  overdue: "Overdue",
  open: "Open",
  responded: "Responded",
  resolved: "Resolved",
  complete: "Complete",
  missing_data: "Missing Data",
  needs_attention: "Needs Attention",
  draft: "Draft",
  configured: "Configured",
  active: "Active",
  mapped: "Mapped",
  partial: "Partial",
  unmapped: "Unmapped",
  not_in_scope: "Not in Scope",
};

export function StatusBadge({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const dark = useTheme((s) => s.theme) === "dark";
  const key = value.toLowerCase();
  const base = MAP[key] ?? { bg: "#F1F5F9", text: "#556070" };
  const text = label ?? LABELS[key] ?? value;
  // In dark mode derive a translucent tint + brightened ink from the status's own ink
  // color, so the light pastel chips become cohesive dark chips (no white 'draft' sticker).
  const style = dark
    ? {
        backgroundColor: `color-mix(in srgb, ${base.text} 20%, transparent)`,
        color: `color-mix(in srgb, ${base.text} 68%, white)`,
        boxShadow: base.ring ? `inset 0 0 0 1px color-mix(in srgb, ${base.ring} 55%, white)` : undefined,
      }
    : {
        backgroundColor: base.bg,
        color: base.text,
        boxShadow: base.ring ? `inset 0 0 0 1px ${base.ring}` : undefined,
      };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
      style={style}
    >
      {text}
    </span>
  );
}
