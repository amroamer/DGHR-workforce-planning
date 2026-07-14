import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles, Check } from "lucide-react";
import { api, type MapSuggestion } from "@/lib/api";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";

// Mapping Drawer (SPEC §10.3): unmapped/partial job titles with fuzzy/AI suggestion +
// confidence + [Accept]. Accepting maps all records with that title live.
export function MappingDrawer({ entityId, open, onClose }: { entityId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<{ title: string; ids: number[]; status: string }[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, MapSuggestion>>({});
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAccepted(new Set());
      const [unmapped, partial] = await Promise.all([
        api.workforce(entityId, { status: "unmapped", page_size: 100 }),
        api.workforce(entityId, { status: "partial", page_size: 100 }),
      ]);
      const byTitle = new Map<string, { title: string; ids: number[]; status: string }>();
      [...unmapped.records.rows, ...partial.records.rows].forEach((r) => {
        const e = byTitle.get(r.job_title) ?? { title: r.job_title, ids: [], status: r.map_status };
        e.ids.push(r.id);
        byTitle.set(r.job_title, e);
      });
      const list = [...byTitle.values()].slice(0, 40);
      // 1.5–3s "Analyzing…" like the live AI feature
      await new Promise((res) => setTimeout(res, 1800));
      const ai = await api.aiMapTitles(list.map((r) => r.title));
      if (cancelled) return;
      const map: Record<string, MapSuggestion> = {};
      ai.suggestions.forEach((s) => { map[s.input] = s; });
      setRows(list);
      setSuggestions(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, entityId]);

  const accept = async (title: string) => {
    const row = rows.find((r) => r.title === title);
    const s = suggestions[title];
    if (!row || !s?.suggested_title) return;
    await Promise.all(row.ids.map((id) => api.patchWorkforce(entityId, id, { job_family: s.family ?? undefined, map_status: "mapped" })));
    setAccepted((a) => new Set(a).add(title));
    qc.invalidateQueries({ queryKey: ["workforce"] });
    toast.success(`Mapped "${title}" → ${s.suggested_title} (${s.family}).`);
  };

  return (
    <Drawer open={open} onClose={onClose} title="Map Job Titles" width={480}>
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-teal">
          <Sparkles size={28} className="mb-2 animate-pulse" />
          <div className="text-sm font-semibold">✨ Analyzing job titles…</div>
          <div className="mt-1 text-xs text-text3">Matching against the DGHR standard taxonomy</div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="mb-2 text-xs text-text3">AI-suggested standard mappings for unmapped and partially-mapped titles. Accept to map all matching records.</p>
          {rows.map((r) => {
            const s = suggestions[r.title];
            const done = accepted.has(r.title);
            return (
              <div key={r.title} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text1">{r.title}</span>
                  <StatusBadge value={r.status} label={r.status === "unmapped" ? "Unmapped" : "Partial"} />
                </div>
                {s?.suggested_title ? (
                  <div className="mt-2 flex items-center gap-2">
                    <Sparkles size={13} className="text-teal" />
                    <div className="flex-1 text-xs text-text2">→ <span className="font-semibold text-text1">{s.suggested_title}</span> · {s.family} <span className="text-text3">({s.confidence}%)</span></div>
                    {done ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-success"><Check size={14} /> Mapped</span>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => accept(r.title)}>Accept</Button>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-text3">No confident suggestion — manual mapping required.</div>
                )}
                <div className="mt-1 text-[11px] text-text3">{r.ids.length} record{r.ids.length > 1 ? "s" : ""}</div>
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
