import { create } from "zustand";

// One shared dictation language for every mic in the app (Stepper voice note, clarification
// replies, DGHR clarify/query, ask-the-data chat). English (UAE) or Arabic (UAE) — the two the
// Web Speech engine ships for this region. Persisted so the choice survives a reload.

export type VoiceLang = "en-AE" | "ar-AE";
const STORAGE_KEY = "dghr.voiceLang";

function load(): VoiceLang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "en-AE" || v === "ar-AE") return v;
  } catch { /* ignore */ }
  return "en-AE";
}

interface VoiceLangState {
  lang: VoiceLang;
  setLang: (l: VoiceLang) => void;
}

export const useVoiceLang = create<VoiceLangState>((set) => ({
  lang: load(),
  setLang: (lang) => {
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
    set({ lang });
  },
}));
