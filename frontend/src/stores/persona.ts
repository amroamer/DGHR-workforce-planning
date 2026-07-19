import { create } from "zustand";

// Persona switching replaces auth (SPEC §1). Switching swaps the entire shell,
// sidebar, and data scope, and persists in localStorage. The DGHR admin plus
// DM/DHA are friendly presets; any of the other entities gets a persona generated
// on the fly from the entity picker (see personaForEntity).

export type PersonaType = "dghr" | "entity";

export interface Persona {
  id: string; // stable key used in localStorage
  type: PersonaType;
  code: string | null; // entity code (DM/DHA/…) for entity personas
  entityId?: number; // direct entity id for dynamically-picked entity personas
  name: string; // header avatar label
  initials: string;
  portalTitle: string; // sidebar portal label line 1
  portalSubtitle: string; // sidebar portal label line 2
  userName: string; // sidebar bottom user card name
  userRole: string; // sidebar bottom user card role
}

export interface EntityLite {
  id: number;
  name: string;
  code: string;
  wave?: string;
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

/** Build (or reuse a preset) persona for any entity chosen from the picker. */
export function personaForEntity(e: EntityLite): Persona {
  const preset = PERSONAS.find((p) => p.type === "entity" && p.code === e.code);
  if (preset) return { ...preset, entityId: e.id };
  const initials = (e.code || e.name).slice(0, 3).toUpperCase();
  return {
    id: `entity-${e.id}`,
    type: "entity",
    code: e.code,
    entityId: e.id,
    name: e.name,
    initials,
    portalTitle: e.name,
    portalSubtitle: "Government Entity",
    userName: "Entity User",
    userRole: "Entity Admin",
  };
}

const STORAGE_KEY = "dghr.persona";

function loadInitial(): Persona {
  try {
    // Deep-link override (?persona=entity-dm) — handy for demo bookmarks; presets only.
    const param = new URLSearchParams(window.location.search).get("persona");
    if (param) {
      const found = PERSONAS.find((p) => p.id === param);
      if (found) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
        return found;
      }
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      // New format: serialized persona object. Old format: bare preset id.
      if (saved.startsWith("{")) {
        const parsed = JSON.parse(saved) as Persona;
        if (parsed?.type) return parsed;
      } else {
        const found = PERSONAS.find((p) => p.id === saved);
        if (found) return found;
      }
    }
  } catch {
    /* ignore */
  }
  return PERSONAS[0];
}

function persist(p: Persona) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface PersonaState {
  persona: Persona;
  setPersona: (id: string) => void; // preset by id (DGHR / DM / DHA)
  setPersonaObject: (p: Persona) => void; // any persona, incl. generated entity ones
}

export const usePersona = create<PersonaState>((set) => ({
  persona: loadInitial(),
  setPersona: (id: string) => {
    const found = PERSONAS.find((p) => p.id === id);
    if (!found) return;
    persist(found);
    set({ persona: found });
  },
  setPersonaObject: (p: Persona) => {
    persist(p);
    set({ persona: p });
  },
}));
