import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nf = new Intl.NumberFormat("en-AE");

/** Format a number with en-AE grouping (SPEC §17). Missing values use the em-dash "-",
 *  the single dash style used app-wide for empty markers (§4.3). */
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return nf.format(n);
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return "-";
  return `${n.toFixed(digits)}%`;
}

/** Relative time like "10 min ago", "in 6 days" (SPEC §17). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const suffix = (v: string) => (diffMs >= 0 ? `${v} ago` : `in ${v}`);
  if (mins < 1) return "just now";
  if (mins < 60) return suffix(`${mins} min`);
  if (hours < 24) return suffix(`${hours} hr${hours > 1 ? "s" : ""}`);
  return suffix(`${days} day${days > 1 ? "s" : ""}`);
}
