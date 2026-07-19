import { cn } from "@/lib/utils";

// Rounded progress bar (SPEC §4.3 / §11): semantic blue fill, green at 100%.
// Colours come from tokens so both themes stay correct; the fill animates once
// toward its width and respects reduced-motion (handled globally in tokens.css).
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
  const complete = v >= 100;
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-[600ms] ease-out",
            complete ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${v}%` }}
        />
      </div>
      {showValue && <span className="nums w-9 text-right text-xs font-semibold text-text2">{v}%</span>}
    </div>
  );
}
