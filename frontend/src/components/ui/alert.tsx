import * as React from "react";
import { cn } from "@/lib/utils";

// Alert / banner (SPEC §14): one compact treatment, thin left accent, semantic tone.
// Replaces the ad-hoc `border-l-4 + bg-*-bg` blocks scattered across pages.

export type AlertTone = "info" | "success" | "warning" | "danger" | "purple";

const TONE: Record<AlertTone, { surface: string; accent: string; fg: string }> = {
  info: { surface: "bg-info-bg", accent: "border-l-info", fg: "text-info" },
  success: { surface: "bg-success-bg", accent: "border-l-success", fg: "text-success" },
  warning: { surface: "bg-warning-bg", accent: "border-l-warning", fg: "text-warning" },
  danger: { surface: "bg-danger-bg", accent: "border-l-danger", fg: "text-danger" },
  purple: { surface: "bg-purple-bg", accent: "border-l-purple", fg: "text-purple" },
};

export function Alert({
  tone = "info",
  icon,
  title,
  action,
  className,
  children,
}: {
  tone?: AlertTone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("flex items-start gap-2.5 rounded-card border border-l-4 border-border px-4 py-3", t.surface, t.accent, className)}>
      {icon && <span className={cn("mt-0.5 shrink-0", t.fg)}>{icon}</span>}
      <div className={cn("min-w-0 flex-1 text-sm", t.fg)}>
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
