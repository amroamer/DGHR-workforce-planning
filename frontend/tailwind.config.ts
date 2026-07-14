import type { Config } from "tailwindcss";

// Design tokens (SPEC §4.1) mirrored from styles/tokens.css.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { 900: "#0B1B3B", 800: "#13284F" },
        primary: { DEFAULT: "#2563EB", hover: "#1D4ED8" },
        page: "#F5F7FA",
        card: "#FFFFFF",
        border: "#E6EAF2",
        text1: "#0F172A",
        text2: "#475569",
        text3: "#94A3B8",
        success: { DEFAULT: "#16A34A", bg: "#E8F7EE" },
        warning: { DEFAULT: "#EA8A00", bg: "#FEF3E2" },
        danger: { DEFAULT: "#E11D48", bg: "#FDEBEC" },
        info: { DEFAULT: "#0EA5E9", bg: "#E7F6FE" },
        purple: { DEFAULT: "#7C3AED", bg: "#F1EAFE" },
        teal: { DEFAULT: "#0D9488", bg: "#E6F7F4" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { card: "14px", btn: "10px" },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.04), 0 1px 3px rgba(16,24,40,.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
