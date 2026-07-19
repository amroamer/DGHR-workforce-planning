import { create } from "zustand";

// Light/dark theme, toggled via a `data-theme` attribute on <html> that swaps the
// CSS variables in styles/tokens.css. Default is light (the original design);
// the user's choice persists in localStorage. An inline script in index.html
// applies the stored theme before first paint, so this store only has to stay
// in sync with (and drive) an attribute that may already be set.

export type Theme = "light" | "dark";

const STORAGE_KEY = "dghr.theme";

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

// Briefly flag <html> so tokens.css can cross-fade colours on switch only
// (never on first paint or hover). Reduced-motion zeroes the transition in CSS.
let themingTimer: ReturnType<typeof setTimeout> | undefined;
function flagThemeTransition() {
  const el = document.documentElement;
  el.classList.add("theming");
  clearTimeout(themingTimer);
  themingTimer = setTimeout(() => el.classList.remove("theming"), 320);
}

function loadInitial(): Theme {
  try {
    // Respect the attribute the FOUC guard may have already set, else storage.
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark" || attr === "light") return attr;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    /* ignore */
  }
  return "light";
}

function persist(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const initial = loadInitial();
apply(initial); // ensure attribute + store agree even if the guard was skipped

export const useTheme = create<ThemeState>((set, get) => ({
  theme: initial,
  setTheme: (t: Theme) => {
    flagThemeTransition();
    apply(t);
    persist(t);
    set({ theme: t });
  },
  toggle: () => get().setTheme(get().theme === "dark" ? "light" : "dark"),
}));
