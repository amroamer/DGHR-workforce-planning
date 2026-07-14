import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { PERSONAS, usePersona } from "@/stores/persona";

// Avatar chip → PersonaSwitcher (SPEC §4.2). Switching swaps the entire shell +
// data scope instantly and persists (handled in the store).
export function PersonaSwitcher() {
  const { persona, setPersona } = usePersona();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const choose = (id: string) => {
    setPersona(id);
    setOpen(false);
    qc.clear(); // reset all cached data to the new scope
    const p = PERSONAS.find((x) => x.id === id)!;
    navigate(p.type === "dghr" ? "/dghr/command-center" : "/entity/home");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-2.5 hover:bg-page"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">
          {persona.initials.slice(0, 2)}
        </span>
        <span className="text-sm font-semibold text-text1">{persona.name}</span>
        <ChevronDown size={15} className="text-text3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-card border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3">
              Switch persona
            </div>
            {PERSONAS.map((p) => (
              <button
                key={p.id}
                onClick={() => choose(p.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-page"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">
                  {p.initials.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-text1">{p.name}</div>
                  <div className="text-xs text-text3">
                    {p.type === "dghr" ? "DGHR Portal" : "Entity Portal"}
                  </div>
                </div>
                {p.id === persona.id && <Check size={16} className="text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
