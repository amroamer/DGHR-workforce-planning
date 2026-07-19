import * as React from "react";
import { cn } from "@/lib/utils";

// Card surfaces (SPEC §7). Levels map to the surface/elevation tokens:
//   1 hero / 2 standard  → card surface, standard elevation
//   3 supporting         → secondary surface, flatter
//   4 inline note        → tinted inset surface, no shadow
// `interactive` adds a ≤2px hover lift (§16) for clickable cards.
type CardLevel = 1 | 2 | 3 | 4;

const LEVEL: Record<CardLevel, string> = {
  1: "rounded-card-lg border border-border bg-card shadow-card",
  2: "rounded-card border border-border bg-card shadow-card",
  3: "rounded-card border border-border bg-surface2",
  4: "rounded-card bg-inset",
};

export function Card({
  className,
  level = 2,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { level?: CardLevel; interactive?: boolean }) {
  return (
    <div
      className={cn(
        // Default padding so a bare <Card> never renders its title/content flush to the
        // border (SPEC §2/§3). twMerge lets any explicit p-* / p-0 in `className` win, so
        // full-bleed and custom-padded cards are unaffected.
        "min-w-0 p-5",
        LEVEL[level],
        interactive &&
          "cursor-pointer transition-[transform,box-shadow] duration-card ease-standard hover:-translate-y-0.5 hover:shadow-elevated",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  className,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 pt-5", className)}>
      <h3 className="text-base font-semibold text-text1">{title}</h3>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
