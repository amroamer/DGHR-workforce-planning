import { cn } from "@/lib/utils";

// Tracker % chip (SPEC §4.3): >=80 green, 40-79 orange, <40 red (100% solid-green text).
export function PctChip({ value, className }: { value: number | null; className?: string }) {
  if (value === null || value === undefined) {
    return <span className={cn("text-text3", className)}>–</span>;
  }
  let bg = "#FDEBEC";
  let fg = "#B91C1C";
  if (value >= 80) {
    bg = "#DCFCE7";
    fg = "#15803D";
  } else if (value >= 40) {
    bg = "#FEF3E2";
    fg = "#C2410C";
  }
  return (
    <span
      className={cn("inline-flex min-w-[44px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold", className)}
      style={{ backgroundColor: bg, color: fg }}
    >
      {value}%
    </span>
  );
}
