import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

// Teal "Layer B Preview · Illustrative" chip (SPEC §4.3). MANDATORY on every §9.5
// vision-zone card; must never appear elsewhere.
export function VisionBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-teal-bg px-2.5 py-0.5 text-[11px] font-semibold text-teal",
        className,
      )}
    >
      <Sparkles size={12} />
      Layer B Preview · Illustrative
    </span>
  );
}
