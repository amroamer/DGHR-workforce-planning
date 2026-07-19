import type { Config } from "tailwindcss";

// Design tokens (SPEC §4.1) sourced from styles/tokens.css CSS variables.
// Colors reference the `--token` channel triples through `<alpha-value>` so both
// runtime theming (`:root[data-theme="dark"]`) and opacity modifiers (`bg-page/60`)
// work off a single source of truth. Elevation/radius/motion map to var()s too, so
// dark mode swaps them automatically.
const withVar = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy: { 900: withVar("--navy-900"), 800: withVar("--navy-800") },
        primary: { DEFAULT: withVar("--primary"), hover: withVar("--primary-hover") },
        page: withVar("--page-bg"),
        card: withVar("--card-bg"),
        surface2: withVar("--surface-2"),
        surface3: withVar("--surface-3"),
        inset: withVar("--surface-inset"),
        sidebar: withVar("--sidebar-bg"),
        border: { DEFAULT: withVar("--border"), strong: withVar("--border-strong") },
        text1: withVar("--text-1"),
        text2: withVar("--text-2"),
        text3: withVar("--text-3"),
        focus: withVar("--focus-ring"),
        success: { DEFAULT: withVar("--success"), bg: withVar("--success-bg") },
        warning: { DEFAULT: withVar("--warning"), bg: withVar("--warning-bg") },
        danger: { DEFAULT: withVar("--danger"), bg: withVar("--danger-bg") },
        info: { DEFAULT: withVar("--info"), bg: withVar("--info-bg") },
        purple: { DEFAULT: withVar("--purple"), bg: withVar("--purple-bg") },
        teal: { DEFAULT: withVar("--teal"), bg: withVar("--teal-bg") },
      },
      fontFamily: {
        sans: ["Dubai", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      // Radius scale (§4.4): cards 14–16, inputs/buttons 8–10, small 8, modal 16–20.
      borderRadius: {
        card: "14px",
        "card-lg": "16px",
        btn: "10px",
        sm: "8px",
        modal: "18px",
      },
      // Elevation (§4.6): light = soft modern shadows; dark values swap via var().
      boxShadow: {
        card: "var(--elev-1)",
        elevated: "var(--elev-2)",
        overlay: "var(--elev-3)",
      },
      // Motion scale (§16) — mirror the CSS-var timings for utility use.
      transitionDuration: {
        fast: "130ms",
        press: "90ms",
        card: "160ms",
        tab: "180ms",
        page: "200ms",
        nav: "220ms",
        theme: "300ms",
      },
      transitionTimingFunction: {
        "out-smooth": "cubic-bezier(0.22, 1, 0.36, 1)",
        standard: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      keyframes: {
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up var(--dur-page) var(--ease-out) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
