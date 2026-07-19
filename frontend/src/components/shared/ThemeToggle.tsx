import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/stores/theme";
import { cn } from "@/lib/utils";

// Light/dark switch (SPEC §4.2 header cluster). Sun in dark mode (tap → go light),
// Moon in light mode (tap → go dark). Themeable colors so it reads on both the white
// light header and the dark gradient header.
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full text-text2 transition-colors hover:bg-black/5 dark:hover:bg-white/10",
        className,
      )}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={dark}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
