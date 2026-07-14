import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Activity, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePersona } from "@/stores/persona";
import { Button } from "@/components/ui/button";

// Demo control panel (SPEC §14). Ctrl+Shift+D. Never in nav. Phase 0: reset + health/seed dots.
// Simulate/anomaly/trend actions are wired in later phases.
export function DemoPanel() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { persona } = usePersona();
  const qc = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 5000 });
  const seed = useQuery({
    queryKey: ["seed-check"],
    queryFn: () => fetch(`${api.base}/api/demo/seed-check`).then((r) => r.json()),
    enabled: open,
  });

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); qc.invalidateQueries(); toast.success(msg); }
    catch { toast.error("Action failed."); }
    finally { setBusy(false); }
  };
  const reset = () => run(() => api.resetDemo(), "Demo data reset to the canonical scenario.");
  const simulate = () => run(async () => {
    const r = await api.simulateSubmissions();
    return r;
  }, "3 entities are submitting — watch the dashboards move.");
  const anomaly = () => run(() => api.triggerAnomaly(), "Fresh AI anomaly triggered.");
  const advance = () => run(() => api.advanceTrend(), "Collection progress trend advanced.");

  if (!open) return null;

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-border bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-bold text-text1">Demo Control Panel</span>
        <button onClick={() => setOpen(false)} className="text-text3 hover:text-text1">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text2">Current persona</span>
            <span className="font-semibold text-text1">{persona.name}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-text2">API health</span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: health.data?.status === "ok" ? "#16A34A" : "#E11D48" }}
              />
              <span className="text-xs text-text2">{health.data?.status ?? "…"}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-text2">Seed consistency</span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: seed.data?.passed ? "#16A34A" : "#EA8A00" }}
              />
              <span className="text-xs text-text2">{seed.isFetching ? "checking…" : seed.data?.passed ? "passing" : "—"}</span>
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <Button variant="secondary" className="w-full justify-start" onClick={reset} disabled={busy}>
            <RotateCcw size={16} /> {busy ? "Working…" : "Reset Demo Data"}
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={simulate} disabled={busy}>
            <Activity size={16} /> Simulate 3 Submissions
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={anomaly} disabled={busy}>
            <Activity size={16} /> Trigger AI Anomaly
          </Button>
          <Button variant="secondary" className="w-full justify-start" onClick={advance} disabled={busy}>
            <Activity size={16} /> Advance Trend
          </Button>
        </div>
        <p className="text-[11px] text-text3">Press Ctrl+Shift+D to toggle this panel.</p>
      </div>
    </div>
  );
}
