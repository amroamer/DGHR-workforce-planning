import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, Search } from "lucide-react";
import { api } from "@/lib/api";
import { PERSONAS, personaForEntity, usePersona, type Persona } from "@/stores/persona";

// Avatar chip → PersonaSwitcher (SPEC §4.2). Switching swaps the entire shell +
// data scope instantly and persists (handled in the store). The DGHR admin plus a
// searchable list of every entity (act as any of them — no auth).
export function PersonaSwitcher() {
  const { persona, setPersona, setPersonaObject } = usePersona();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const dghr = PERSONAS.find((p) => p.type === "dghr")!;
  const { data: entities } = useQuery({ queryKey: ["entities-list"], queryFn: api.entitiesList, enabled: open });

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = entities ?? [];
    if (!term) return list;
    return list.filter((e) => e.name.toLowerCase().includes(term) || e.code.toLowerCase().includes(term));
  }, [entities, q]);

  const applyAndGo = (p: Persona) => {
    setPersonaObject(p);
    setOpen(false);
    setQ("");
    qc.clear();
    navigate(p.type === "dghr" ? "/dghr/command-center" : "/entity/home");
  };
  const chooseDghr = () => {
    setPersona(dghr.id);
    setOpen(false);
    setQ("");
    qc.clear();
    navigate("/dghr/command-center");
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 hover:bg-page"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">
          {persona.initials.slice(0, 2)}
        </span>
        <span className="text-sm font-semibold text-text1">{persona.name}</span>
        <ChevronDown size={15} className="text-text3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setQ(""); }} />
          <div className="absolute right-0 z-50 mt-2 flex max-h-[70vh] w-72 flex-col rounded-card border border-border bg-card shadow-lg">
            <div className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text3">
              Switch persona
            </div>

            {/* DGHR */}
            <button
              onClick={chooseDghr}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-page"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">DG</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text1">{dghr.name}</div>
                <div className="text-xs text-text3">DGHR Portal</div>
              </div>
              {persona.type === "dghr" && <Check size={16} className="text-primary" />}
            </button>

            {/* Entity search */}
            <div className="border-t border-border px-2 py-2">
              <div className="flex items-center gap-2 rounded-btn border border-border px-2.5">
                <Search size={14} className="text-text3" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search entities…"
                  className="h-8 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pb-1">
              {(entities ?? []).length === 0 && (
                <div className="px-3 py-2 text-xs text-text3">Loading entities…</div>
              )}
              {filtered.map((e) => {
                const active = persona.type === "entity" && (persona.entityId === e.id || persona.code === e.code);
                return (
                  <button
                    key={e.id}
                    onClick={() => applyAndGo(personaForEntity(e))}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-page"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">
                      {(e.code || e.name).slice(0, 3).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text1">{e.name}</div>
                      <div className="text-xs text-text3">{e.code}, {e.wave}</div>
                    </div>
                    {active && <Check size={16} className="text-primary" />}
                  </button>
                );
              })}
              {filtered.length === 0 && (entities ?? []).length > 0 && (
                <div className="px-3 py-2 text-xs text-text3">No entities match “{q}”.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
