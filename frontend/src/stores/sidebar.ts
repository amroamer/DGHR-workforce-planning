import { create } from "zustand";

// Collapsible sidebar (4th mockup). At lg+ the rail can collapse to an icon-only strip to give the
// executive dashboards more width; the choice persists in localStorage. Patterned after
// stores/persona.ts and stores/theme.ts. Below lg the sidebar is an off-canvas drawer (handled in
// Sidebar.tsx) and collapse does not apply.

const STORAGE_KEY = "dghr.sidebar.collapsed";

function loadInitial(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function persist(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (c: boolean) => void;
}

export const useSidebar = create<SidebarState>((set, get) => ({
  collapsed: loadInitial(),
  toggle: () => {
    const next = !get().collapsed;
    persist(next);
    set({ collapsed: next });
  },
  setCollapsed: (c: boolean) => {
    persist(c);
    set({ collapsed: c });
  },
}));
