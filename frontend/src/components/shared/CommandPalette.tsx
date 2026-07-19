import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, CornerDownLeft, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { usePersona } from "@/stores/persona";
import { DGHR_NAV, ENTITY_NAV } from "./nav";

type Item = { id: string; label: string; sub?: string; onSelect: () => void; icon?: React.ReactNode };

// HDR-01 / MD-18 — command palette. Opens on ⌘K/Ctrl+K or the header search button
// (which dispatches "open-command-palette"). Searches screens + entities; keyboard-navigable.
export function CommandPalette() {
  const { persona } = usePersona();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-command-palette", onOpen); };
  }, []);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const { data: entities } = useQuery({ queryKey: ["entities-list"], queryFn: api.entitiesList, enabled: open });

  const items = useMemo<Item[]>(() => {
    const term = q.trim().toLowerCase();
    const nav = persona.type === "dghr" ? DGHR_NAV : ENTITY_NAV;
    const screens: Item[] = nav
      .filter((n) => !term || n.label.toLowerCase().includes(term))
      .map((n) => ({ id: `screen-${n.to}`, label: n.label, sub: "Screen", onSelect: () => navigate(n.to) }));
    const ents: Item[] = persona.type === "dghr"
      ? (entities ?? [])
          .filter((e) => !term || e.name.toLowerCase().includes(term) || e.code.toLowerCase().includes(term))
          .slice(0, 8)
          .map((e) => ({ id: `ent-${e.id}`, label: e.name, sub: `Entity, ${e.code}`, icon: <Building2 size={15} />,
                         onSelect: () => navigate(`/dghr/submissions?search=${encodeURIComponent(e.name)}`) }))
      : [];
    return [...ents, ...screens];
  }, [q, entities, persona.type, navigate]);

  useEffect(() => { if (active >= items.length) setActive(0); }, [items.length, active]);

  const choose = (i: number) => { const it = items[i]; if (it) { it.onSelect(); setOpen(false); } };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-card border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search size={16} className="text-text3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); choose(active); }
            }}
            placeholder="Search screens and entities…"
            className="h-12 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-text3">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {items.length === 0 && <div className="px-4 py-6 text-center text-sm text-text3">No matches for “{q}”.</div>}
          {items.map((it, i) => (
            <button
              key={it.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm ${i === active ? "bg-page" : ""}`}
            >
              <span className="text-text3">{it.icon ?? <Search size={15} />}</span>
              <span className="flex-1 font-medium text-text1">{it.label}</span>
              <span className="text-[11px] text-text3">{it.sub}</span>
              {i === active && <CornerDownLeft size={13} className="text-text3" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
