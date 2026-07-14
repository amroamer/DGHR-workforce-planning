import { cn } from "@/lib/utils";

// Canonical status/label → color mapping (SPEC §4.3). Never use ad-hoc colors for these.
type BadgeStyle = { bg: string; text: string; ring?: string };

const MAP: Record<string, BadgeStyle> = {
  // package / entity statuses
  not_started: { bg: "#F1F5F9", text: "#64748B" },
  "not started": { bg: "#F1F5F9", text: "#64748B" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  "in progress": { bg: "#DBEAFE", text: "#1D4ED8" },
  submitted: { bg: "#DCFCE7", text: "#15803D" },
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
  not_in_scope: { bg: "#F1F5F9", text: "#64748B" },
  "not in scope": { bg: "#F1F5F9", text: "#64748B" },
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
  const key = value.toLowerCase();
  const style = MAP[key] ?? { bg: "#F1F5F9", text: "#64748B" };
  const text = label ?? LABELS[key] ?? value;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
      style={{
        backgroundColor: style.bg,
        color: style.text,
        boxShadow: style.ring ? `inset 0 0 0 1px ${style.ring}` : undefined,
      }}
    >
      {text}
    </span>
  );
}
