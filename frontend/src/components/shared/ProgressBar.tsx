import { cn } from "@/lib/utils";

// 6px rounded bar; blue fill, green at 100% (SPEC §4.3).
export function ProgressBar({
  value,
  showValue = false,
  className,
}: {
  value: number;
  showValue?: boolean;
  className?: string;
}) {
  const v = Math.min(100, Math.max(0, value));
  const color = v >= 100 ? "#16A34A" : "#2563EB";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF2F7]">
        <div className="h-full rounded-full transition-all" style={{ width: `${v}%`, backgroundColor: color }} />
      </div>
      {showValue && <span className="w-9 text-right text-xs font-semibold text-text2">{v}%</span>}
    </div>
  );
}
