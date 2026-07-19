import { useTheme } from "@/stores/theme";

// Accent "tones" (an arbitrary hex passed to StatCard/Kpi/SummaryStat etc.) are tuned
// for light surfaces. On dark cards the darker tones (green/amber/orange) go muddy, so
// brighten the foreground and strengthen the chip tint. Light mode is left identical.
export interface Tone {
  /** foreground/icon color for the tone */
  fg: (hex: string) => string;
  /** background tint for an icon chip carrying the tone */
  chip: (hex: string) => string;
}

export function useTone(): Tone {
  const dark = useTheme((s) => s.theme) === "dark";
  return {
    fg: (hex) => (dark ? `color-mix(in srgb, ${hex} 72%, white)` : hex),
    chip: (hex) => (dark ? `color-mix(in srgb, ${hex} 26%, transparent)` : `${hex}1a`),
  };
}
