import * as React from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/stores/theme";

// EmptyState / PlaceholderPage building block (SPEC §4.3 / §15). A placeholder must
// still look designed: the icon sits on a tinted disc over a soft static glow.
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "#2563EB",
  toneBg = "#DBEAFE",
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  tone?: string;
  toneBg?: string;
  className?: string;
}) {
  const dark = useTheme((s) => s.theme) === "dark";
  const bg = dark ? `color-mix(in srgb, ${tone} 22%, transparent)` : toneBg;
  const fg = dark ? `color-mix(in srgb, ${tone} 72%, white)` : tone;
  return (
    <div className={cn("relative flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      {/* Subtle static glow behind the icon (§15) — no motion, low intensity. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-14 h-40 w-40 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: `radial-gradient(circle, ${dark ? `color-mix(in srgb, ${tone} 26%, transparent)` : toneBg} 0%, transparent 70%)` }}
      />
      <div
        className="relative mb-4 flex h-16 w-16 items-center justify-center rounded-full ring-1 ring-inset ring-black/5"
        style={{ backgroundColor: bg, color: fg }}
      >
        {icon}
      </div>
      <h3 className="relative text-lg font-semibold text-text1">{title}</h3>
      {description && <p className="relative mt-1 max-w-md text-sm text-text2">{description}</p>}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}
