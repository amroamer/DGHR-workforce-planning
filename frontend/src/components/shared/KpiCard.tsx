import * as React from "react";
import { cn, fmt } from "@/lib/utils";

// KPI card (SPEC §4.3): 44px tinted icon circle, value, label, sublabel, optional link.
// Ring variant shows a 56px donut with a % center.

export type KpiTone = "blue" | "green" | "orange" | "teal" | "red" | "purple";

const TONE: Record<KpiTone, { fg: string; bg: string }> = {
  blue: { fg: "#2563EB", bg: "#DBEAFE" },
  green: { fg: "#16A34A", bg: "#E8F7EE" },
  orange: { fg: "#EA8A00", bg: "#FEF3E2" },
  teal: { fg: "#0D9488", bg: "#E6F7F4" },
  red: { fg: "#E11D48", bg: "#FDEBEC" },
  purple: { fg: "#7C3AED", bg: "#F1EAFE" },
};

function Ring({ pct, tone }: { pct: number; tone: KpiTone }) {
  const { fg } = TONE[tone];
  const r = 24;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" className="shrink-0">
      <circle cx="28" cy="28" r={r} fill="none" stroke="#E6EAF2" strokeWidth="6" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        stroke={fg}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle" className="fill-text1 text-[13px] font-bold">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

export interface KpiCardProps {
  icon?: React.ReactNode;
  tone?: KpiTone;
  value?: React.ReactNode;
  label: string;
  sublabel?: React.ReactNode;
  ring?: number; // if set, renders ring variant
  link?: { text: string; onClick?: () => void };
  className?: string;
}

export function KpiCard({
  icon,
  tone = "blue",
  value,
  label,
  sublabel,
  ring,
  link,
  className,
}: KpiCardProps) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-card border border-border bg-card p-4 shadow-card",
        className,
      )}
    >
      {ring !== undefined ? (
        <Ring pct={ring} tone={tone} />
      ) : (
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: t.bg, color: t.fg }}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0">
        {value !== undefined && (
          <div className="text-[26px] font-bold leading-tight text-text1">
            {typeof value === "number" ? fmt(value) : value}
          </div>
        )}
        <div className="text-[13px] font-semibold text-text1">{label}</div>
        {sublabel && <div className="mt-0.5 text-xs text-text3">{sublabel}</div>}
        {link && (
          <button
            onClick={link.onClick}
            className="mt-1 text-xs font-semibold text-primary hover:underline"
          >
            {link.text} →
          </button>
        )}
      </div>
    </div>
  );
}
