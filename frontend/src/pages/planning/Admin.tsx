import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarClock, Bell, Lock, Unlock, Building2, Layers, Inbox, CheckCircle2, ArrowUpRight, Plus, PlayCircle, Users, Copy, CalendarPlus } from "lucide-react";
import { api } from "@/lib/api";
import type { CycleSummary } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StatCard, ReceivedChip } from "./widgets";
import { PipelineByEntity } from "@/components/shared/SubmissionPipeline";
import { NewCycleDialog, ScopeDialog, ExtensionsDialog } from "./CycleDialogs";

const ACCESS = [
  ["HQ administrator (DGHR)", "All entities", "Cycle control, method & typesets, all dashboards, reviews"],
  ["Entity power user", "Own entity", "Add departments, fill & submit each department's drivers"],
];

// Lifecycle status → StatusBadge tone + label. The vocabulary is the cycle's own (draft/open/
// closed/archived), mapped onto the canonical badge palette.
const CYCLE_BADGE: Record<string, { value: string; label: string }> = {
  open: { value: "submitted", label: "Open" },
  closed: { value: "approved", label: "Closed" },
  draft: { value: "draft", label: "Draft" },
  archived: { value: "not_started", label: "Archived" },
};

export function PlanningAdmin() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [extOpen, setExtOpen] = useState(false);
  const [selId, setSelId] = useState<number | null>(null);

  const { data } = useQuery({ queryKey: ["q-cycle"], queryFn: () => api.planning.cycle(), refetchInterval: 4000 });
  const { data: cyclesData } = useQuery({ queryKey: ["q-cycles"], queryFn: api.planning.cycles, refetchInterval: 4000 });
  const { data: gov } = useQuery({ queryKey: ["q-gov", "received", "base"], queryFn: () => api.planning.government("base"), refetchInterval: 4000 });
  const { data: pipe } = useQuery({ queryKey: ["q-admin-pipeline"], queryFn: () => api.planning.pipeline(), refetchInterval: 4000 });

  const list = cyclesData?.cycles ?? [];
  // The selected cycle: an explicit pick, else the one the app defaults to (open, else latest).
  const selectedId = selId ?? cyclesData?.current_id ?? list[0]?.id ?? null;
  const sel = list.find((c) => c.id === selectedId) ?? null;

  // Top stat cards reflect the CURRENT live cycle (cycle_info). The per-cycle progress below tracks
  // the SELECTED cycle, so a closed historical cycle shows its own outcome, not today's state.
  const pct = data && data.departments_total ? Math.round((data.departments_received / data.departments_total) * 100) : 0;
  const selPct = sel && sel.departments_total ? Math.round((sel.received / sel.departments_total) * 100) : 0;
  const pending = (gov?.entities ?? []).filter((e) => e.received < e.dept_count).sort((a, b) => a.received - b.received);
  const labels = gov?.rollup_labels;

  const remind = async () => { const r = await api.planning.remind(); qc.invalidateQueries(); toast.success(`Reminders sent to ${r.reminded} entit${r.reminded === 1 ? "y" : "ies"}.`); };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); await qc.invalidateQueries(); toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); }
  };
  const openCycle = (c: CycleSummary) => act(() => api.planning.openCycle(c.id), `${c.name} is now open.`);
  const closeCycle = (c: CycleSummary) => act(() => api.planning.closeCycle(c.id), `${c.name} closed.`);
  const cloneCycle = async (c: CycleSummary) => {
    try { const nc = await api.planning.cloneCycle(c.id); await qc.invalidateQueries(); setSelId(nc.id); toast.success(`Cloned to draft “${nc.name}”.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Clone failed."); }
  };

  return (
    <>
      <PageHeader
        title="Cycle & Administration"
        subtitle="Run collection cycles ad hoc: open a window, chase the entities that still owe submissions, then close it."
        actions={<Button size="sm" onClick={() => setNewOpen(true)}><Plus size={15} /> New cycle</Button>}
      />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<Building2 size={20} />} tone="#2563EB" value={data?.entities ?? 0} label="Entities" sub="In this cycle" />
          <StatCard icon={<Layers size={20} />} tone="#7C3AED" value={data?.departments_total ?? 0} label="Departments" sub="Registered across government" />
          <StatCard icon={<Inbox size={20} />} tone="#B45309" value={data?.departments_received ?? 0} label="Received" sub={`${pct}% of departments`} />
          <StatCard icon={<CheckCircle2 size={20} />} tone="#15803D" value={data?.approved ?? 0} label="Approved" sub="Signed off" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <Card>
              {/* Cycle selector — every cycle, newest first. Switching shows that cycle's window,
                  scope and progress; the actions below follow its status. */}
              {list.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {list.map((cy) => (
                    <button key={cy.id} onClick={() => setSelId(cy.id)}
                      className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-fast ${cy.id === selectedId ? "border-primary bg-primary text-white shadow-sm" : "border-border bg-card text-text2 hover:border-border-strong hover:bg-surface2 hover:text-text1"}`}>
                      {cy.name}
                    </button>
                  ))}
                </div>
              )}

              {!sel ? (
                <div className="py-8 text-center text-sm text-text3">
                  No collection cycle yet. <button onClick={() => setNewOpen(true)} className="font-semibold text-primary hover:underline">Create one</button> to get started.
                </div>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarClock size={16} /></span>
                      <span className="text-base font-bold text-text1">{sel.name}</span>
                    </div>
                    <StatusBadge {...(CYCLE_BADGE[sel.status] ?? { value: sel.status, label: sel.status })} />
                  </div>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    {[["Opens", sel.starts_on], ["Closes", sel.ends_on], ["Deadline", sel.deadline]].map(([l, v]) => (
                      <div key={l as string} className="rounded-lg bg-inset p-3.5">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-text3">{l}</div>
                        <div className="mt-1 text-base font-bold text-text1 nums">{(v as string) ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text3">
                    <span>Auto-close on deadline: <b className="text-text2">{sel.auto_close ? "On" : "Off"}</b></span>
                    <span>Scope: <b className="text-text2">{sel.scope_mode === "all" ? "All entities" : `${sel.scope_entity_ids?.length ?? 0} selected`}</b></span>
                    {sel.reminders_label && <span>Auto-reminders: <b className="text-text2">{sel.reminders_label}</b></span>}
                    {sel.extensions && sel.extensions.length > 0 && <span>Extensions: <b className="text-text2">{sel.extensions.length}</b></span>}
                    {sel.opened_by && <span>Opened by {sel.opened_by}</span>}
                    {sel.closed_by && <span>Closed by {sel.closed_by}</span>}
                  </div>
                  <div className="mb-1.5 flex justify-between text-xs text-text3"><span><b className="text-text1">{sel.received}</b> of {sel.departments_total} departments received</span><span className="font-semibold text-text2 nums">{selPct}%</span></div>
                  <div className="h-3 overflow-hidden rounded-full bg-inset"><div className="h-full rounded-full bg-success transition-all" style={{ width: `${selPct}%` }} /></div>
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                    {sel.status === "draft" && <Button size="sm" onClick={() => openCycle(sel)}><PlayCircle size={15} /> Open cycle</Button>}
                    {sel.status === "open" && <Button size="sm" onClick={remind}><Bell size={15} /> Send reminders</Button>}
                    {sel.status === "open" && <Button variant="secondary" size="sm" onClick={() => closeCycle(sel)}><Lock size={15} /> Close cycle</Button>}
                    {sel.status === "closed" && <Button variant="secondary" size="sm" onClick={() => openCycle(sel)}><Unlock size={15} /> Re-open cycle</Button>}
                    {(sel.status === "draft" || sel.status === "open") && <Button variant="secondary" size="sm" onClick={() => setScopeOpen(true)}><Users size={15} /> Edit scope</Button>}
                    {sel.status === "open" && <Button variant="secondary" size="sm" onClick={() => setExtOpen(true)}><CalendarPlus size={15} /> Extensions{sel.extensions?.length ? ` (${sel.extensions.length})` : ""}</Button>}
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => cloneCycle(sel)}><Copy size={15} /> Clone</Button>
                  </div>
                </>
              )}
            </Card>

            <Card className="min-w-0 p-0">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Access control</div>
              <table className="w-full text-left text-sm">
                <thead><tr className={THEAD_TR}><th className={`${TH} pl-5`}>Role</th><th className={TH}>Scope</th><th className={`${TH} pr-5`}>Rights</th></tr></thead>
                <tbody>{ACCESS.map((r) => (
                  <tr key={r[0]} className={TROW}>
                    <td className={`${TD} pl-5 font-semibold`}>{r[0]}</td>
                    <td className={`${TD} text-text2`}>{r[1]}</td>
                    <td className={`${TD} pr-5 text-text2`}>{r[2]}</td>
                  </tr>
                ))}</tbody>
              </table>
            </Card>

            {/* Submission pipeline (G7): where each entity's departments sit, double-click to drill in. */}
            <Card className="min-w-0 p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="text-sm font-semibold text-text1">Submission pipeline by entity</span>
                <span className="text-[11px] text-text3">{pipe?.received ?? 0} of {pipe?.total ?? 0} received</span>
              </div>
              <div className="p-2">
                {(pipe?.entities ?? []).length === 0
                  ? <p className="p-3 text-sm text-text3">No entities in scope yet.</p>
                  : <PipelineByEntity entities={pipe?.entities ?? []} onOpen={(id) => navigate(`/dghr/gov-entity/${id}`)} />}
              </div>
            </Card>
          </div>

          <aside className="space-y-4">
            <Card className="min-w-0 p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-text1"><Bell size={15} className="text-warning" /> Still to submit</span>
                <span className="text-xs font-semibold text-text3 nums">{pending.length}</span>
              </div>
              <div className="max-h-[520px] overflow-y-auto">
                {pending.length === 0 ? <p className="p-5 text-sm text-text3">Every entity has submitted all departments.</p> : pending.map((e) => (
                  <button key={e.entity_id} onClick={() => navigate(`/dghr/gov-entity/${e.entity_id}`)}
                    className="flex w-full items-center gap-2 border-b border-border px-5 py-3 text-left transition-colors duration-fast last:border-0 hover:bg-surface2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-text1">{e.name} <ArrowUpRight size={12} className="shrink-0 text-text3" /></div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <ReceivedChip received={e.received} total={e.dept_count} />
                        {labels && <StatusBadge value={e.rollup_status} label={labels[e.rollup_status]} />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </PageBody>

      <NewCycleDialog open={newOpen} onClose={() => setNewOpen(false)} onCreated={(id) => setSelId(id)} />
      <ScopeDialog open={scopeOpen} onClose={() => setScopeOpen(false)} cycle={sel} />
      <ExtensionsDialog open={extOpen} onClose={() => setExtOpen(false)} cycle={sel} />
    </>
  );
}
