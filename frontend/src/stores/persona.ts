import { create } from "zustand";

// Persona switching replaces auth (SPEC §1). Switching swaps the entire shell,
// sidebar, and data scope, and persists in localStorage.

export type PersonaType = "dghr" | "entity";

export interface Persona {
  id: string; // stable key used in localStorage
  type: PersonaType;
  code: string | null; // entity code (DM/DHA) for entity personas
  name: string; // header avatar label
  initials: string;
  portalTitle: string; // sidebar portal label line 1
  portalSubtitle: string; // sidebar portal label line 2
  userName: string; // sidebar bottom user card name
  userRole: string; // sidebar bottom user card role
}

export const PERSONAS: Persona[] = [
  {
    id: "dghr-admin",
    type: "dghr",
    code: null,
    name: "DGHR Admin",
    initials: "DG",
    portalTitle: "DGHR",
    portalSubtitle: "Workforce Planning Portal",
    userName: "DGHR Central Team",
    userRole: "Central Engine",
  },
  {
    id: "entity-dm",
    type: "entity",
    code: "DM",
    name: "Dubai Municipality",
    initials: "DM",
    portalTitle: "Dubai Municipality",
    portalSubtitle: "Government Entity",
    userName: "Ahmed Al Mansoori",
    userRole: "Entity Admin",
  },
  {
    id: "entity-dha",
    type: "entity",
    code: "DHA",
    name: "Dubai Health Authority",
    initials: "DHA",
    portalTitle: "Dubai Health Authority",
    portalSubtitle: "Government Entity",
    userName: "Fatima Al Mansoori",
    userRole: "Entity Contact",
  },
];

const STORAGE_KEY = "dghr.persona";

function loadInitial(): Persona {
  // Deep-link override (?persona=entity-dm) — handy for demo bookmarks; persists the choice.
  try {
    const param = new URLSearchParams(window.location.search).get("persona");
    if (param) {
      const found = PERSONAS.find((p) => p.id === param);
      if (found) {
        localStorage.setItem(STORAGE_KEY, found.id);
        return found;
      }
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const found = PERSONAS.find((p) => p.id === saved);
      if (found) return found;
    }
  } catch {
    /* ignore */
  }
  return PERSONAS[0];
}

interface PersonaState {
  persona: Persona;
  setPersona: (id: string) => void;
}

export const usePersona = create<PersonaState>((set) => ({
  persona: loadInitial(),
  setPersona: (id: string) => {
    const found = PERSONAS.find((p) => p.id === id);
    if (!found) return;
    try {
      localStorage.setItem(STORAGE_KEY, found.id);
    } catch {
      /* ignore */
    }
    set({ persona: found });
  },
}));
