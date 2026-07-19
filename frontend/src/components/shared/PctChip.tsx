import { cn } from "@/lib/utils";

// Tracker % chip (SPEC §4.3): >=80 green, 40-79 orange, <40 red (100% solid-green text).
// Semantic tokens theme automatically in dark mode.
export function PctChip({ value, className }: { value: number | null; className?: string }) {
  if (value === null || value === undefined) {
    return <span className={cn("text-text3", className)}>—</span>;
  }
  const tone =
    value >= 80 ? "bg-success-bg text-success"
    : value >= 40 ? "bg-warning-bg text-warning"
    : "bg-danger-bg text-danger";
  return (
    <span
      className={cn("inline-flex min-w-[44px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold", tone, className)}
    >
      {value}%
    </span>
  );
}
