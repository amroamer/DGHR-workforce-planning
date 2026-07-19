import { useEffect, useState } from "react";
import { useTheme } from "@/stores/theme";

/**
 * Chart entrance animation that runs ONCE on mount and never again (§13/§16 — charts
 * animate once, must not re-animate on the 4s poll refetch). Returns `true` only for the
 * first `duration`ms of this component's life, then stays `false` across all later
 * re-renders. Honours prefers-reduced-motion by never animating.
 */
export function useAnimateOnce(duration = 650): boolean {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [on, setOn] = useState(!reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setOn(false), duration + 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return on && !reduce;
}

/**
 * Like useAnimateOnce, but re-arms whenever `key` changes — used by the executive
 * dashboards so charts morph when Scope/Basis/Scenario switches, while staying inert
 * across the 4s poll refetch (whose data arrives under an unchanged key).
 */
export function useAnimateOnKey(key: string | undefined, duration = 800): boolean {
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [on, setOn] = useState(!reduce);
  useEffect(() => {
    if (reduce) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), duration + 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return on && !reduce;
}

// Recharts and hand-rolled SVG take concrete color strings; CSS `var()` does not
// resolve inside SVG presentation attributes, so charts read their palette from
// this hook (driven by the same theme store as everything else) instead of tokens.
export interface ChartColors {
  axis: string; // tick labels
  grid: string; // baselines / reference lines
  track: string; // empty bar / donut track
  tooltipBg: string;
  tooltipBorder: string;
  tooltipFg: string;
  primary: string; // main series (blue)
  success: string; // positive series (green)
  danger: string;
  neutral: string; // muted series (slate)
  text1: string; // strong labels inside SVG
}

const LIGHT: ChartColors = {
  axis: "#5B6472",
  grid: "#E6EAF2",
  track: "#EEF2F7",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#E6EAF2",
  tooltipFg: "#0F172A",
  primary: "#2563EB",
  success: "#16A34A",
  danger: "#E11D48",
  neutral: "#94A3B8",
  text1: "#0F172A",
};

const DARK: ChartColors = {
  axis: "#9AA9C6", // brighter dark-mode axis contrast (§13)
  grid: "#26324F",
  track: "#26324F",
  tooltipBg: "#131B30",
  tooltipBorder: "#26324F",
  tooltipFg: "#E9EEF7",
  primary: "#3B82F6",
  success: "#4ADE80",
  danger: "#FB7185",
  neutral: "#7A899E",
  text1: "#E9EEF7",
};

export function useChartTheme(): ChartColors {
  return useTheme((s) => s.theme) === "dark" ? DARK : LIGHT;
}

/** Recharts <Tooltip> props for a themed tooltip. Spread onto the element. */
export function tooltipProps(c: ChartColors) {
  return {
    contentStyle: {
      background: c.tooltipBg,
      border: `1px solid ${c.tooltipBorder}`,
      borderRadius: 10,
      color: c.tooltipFg,
      boxShadow: "0 4px 12px rgba(0,0,0,.12)",
    },
    labelStyle: { color: c.tooltipFg },
    itemStyle: { color: c.tooltipFg },
  } as const;
}
