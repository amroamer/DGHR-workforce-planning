import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, ArrowUpRight, Users, Target, TrendingUp, Inbox, AlertTriangle, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { Alert } from "@/components/ui/alert";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TraceableValue } from "@/components/shared/TraceableValue";
import { EmptyState } from "@/components/shared/EmptyState";
import { Modal, Field, TextInput, Select } from "@/components/shared/Modal";
import { RowMenu } from "@/components/shared/Dropdown";
import { MiniBar, GapPill, StatCard, HcTiles, LevelBar, ProjectedGapChart, SmartRemarkCell, DistributionBars, fmtFte } from "./widgets";
import { SubmissionPipeline } from "@/components/shared/SubmissionPipeline";
import type { DeptRow } from "@/lib/planning";

export const Q_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", in_clarification: "In Clarification",
  approved: "Approved", rejected: "Rejected", no_submission: "Not Started",
};
export const Q_STATUS_VALUE: Record<string, string> = {
  draft: "in_progress", submitted: "submitted", in_clarification: "returned",
  approved: "approved", rejected: "returned", no_submission: "not_started",
};
const STATUS_DOT: Record<string, string> = {
  approved: "rgb(var(--success))", submitted: "rgb(var(--primary))", in_clarification: "rgb(var(--warning))",
  rejected: "rgb(var(--danger))", draft: "rgb(var(--text-3))", no_submission: "rgb(var(--border-strong))",
};
const RECEIVED_SET = ["submitted", "in_clarification", "approved"];

export function PlanningDepartments() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", typeset_id: 0, current_fte: 0 });

  const { data } = useQuery({ queryKey: ["q-depts", entityId], queryFn: () => api.planning.departments(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: typesets } = useQuery({ queryKey: ["q-typesets"], queryFn: api.planning.typesets });
  const { data: hc } = useQuery({ queryKey: ["q-hc", entityId], queryFn: () => api.planning.humanCapital(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: proj } = useQuery({ queryKey: ["q-proj", entityId], queryFn: () => api.planning.projection(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: pipe } = useQuery({ queryKey: ["q-ent-pipeline", entityId], queryFn: () => api.planning.pipeline(entityId!), enabled: entityId != null, refetchInterval: 4000 });

  const all = data?.departments ?? [];
  // The collection window. When it's shut (no open cycle, or this entity isn't in scope) the entity
  // side is read-only — adding a department / submitting is disabled and the server would refuse it.
  const win = data?.window;
  const locked = !!win && !win.can_submit;
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? all.filter((d) => d.name.toLowerCase().includes(s) || (d.typeset ?? "").toLowerCase().includes(s)) : all;
  }, [all, search]);

  const t = data?.totals;
  const gap = t?.gap ?? 0;
  const received = all.filter((d) => RECEIVED_SET.includes(d.status)).length;
  const pct = all.length ? Math.round((received / all.length) * 100) : 0;
  const counts = all.reduce<Record<string, number>>((a, d) => ({ ...a, [d.status]: (a[d.status] ?? 0) + 1 }), {});
  const todo = all.filter((d) => ["no_submission", "draft", "rejected", "in_clarification"].includes(d.status));
  const maxD = Math.max(1, ...all.filter((d) => d.required_fte != null).map((d) => Math.max(d.current_fte, d.required_fte ?? 0)));
  const withGap = all.filter((d) => d.gap != null && d.required_fte != null);
  const topShortage = withGap.filter((d) => (d.gap ?? 0) < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0)).slice(0, 4);
  const topSurplus = withGap.filter((d) => (d.gap ?? 0) > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 4);

  const reset = () => { setOpen(false); setEditId(null); setForm({ name: "", typeset_id: typesets?.[0]?.id ?? 0, current_fte: 0 }); };
  const openAdd = () => { setEditId(null); setForm({ name: "", typeset_id: typesets?.[0]?.id ?? 0, current_fte: 0 }); setOpen(true); };
  const openEdit = (d: DeptRow) => { setEditId(d.department_id); setForm({ name: d.name, typeset_id: d.typeset_id ?? 0, current_fte: d.current_fte }); setOpen(true); };
  const save = async () => {
    if (entityId == null) return;
    if (!form.name.trim()) return toast.error("Department name is required.");
    const body = { name: form.name, typeset_id: form.typeset_id || null, current_fte: Number(form.current_fte) };
    if (editId != null) { await api.planning.patchDept(editId, body); toast.success("Department updated."); }
    else { await api.planning.createDept(entityId, body); toast.success("Department added."); }
    qc.invalidateQueries({ queryKey: ["q-depts", entityId] });
    reset();
  };
  const del = async (d: DeptRow) => {
    if (!window.confirm(`Delete "${d.name}" and its submission?`)) return;
    await api.planning.deleteDept(d.department_id);
    qc.invalidateQueries({ queryKey: ["q-depts", entityId] });
    toast.success("Department deleted.");
  };

  return (
    <>
      <PageHeader title="Departments" subtitle="Set up your departments, then submit each one's workforce drivers. The sizing is computed centrally."
        actions={<Button size="sm" onClick={openAdd} disabled={locked}><Plus size={15} /> Add Department</Button>} />
      <PageBody>
        {locked && (
          <Alert tone="warning" icon={<Lock size={16} />} className="mb-4">
            <span className="font-semibold">Submissions are closed.</span> {win?.reason}
          </Alert>
        )}
        <div className="mb-4 grid grid-cols-2 items-stretch gap-4 lg:grid-cols-4">
          <StatCard icon={<Users size={20} />} tone="#2563EB" value={fmtFte(t?.current_fte ?? 0)} label="Available FTE" sub="Net of secondments (submitted)" />
          <StatCard icon={<Target size={20} />} tone="#7C3AED" label="Required FTE" sub="Sized from your drivers"
            value={<TraceableValue kind="entity" refId={data?.entity_id ?? 0} label="your entity's Required FTE">{t?.required_fte ?? 0}</TraceableValue>} />
          {/* Net Gap — the headline the whole page builds to, given the strongest visual weight. */}
          <div className={`flex h-full flex-col rounded-card border border-l-4 bg-card p-5 shadow-card ${gap < 0 ? "border-border border-l-danger" : "border-border border-l-success"}`}>
            <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${gap < 0 ? "bg-danger-bg text-danger" : "bg-success-bg text-success"}`}>
              <TrendingUp size={20} />
            </span>
            <div className={`nums text-[2.5rem] font-bold leading-none ${gap < 0 ? "text-danger" : "text-success"}`}>{gap > 0 ? "+" : ""}{gap}</div>
            <div className="mt-1.5 text-sm font-semibold text-text1">Net Gap (this year)</div>
            <div className="text-xs text-text3">{gap < 0 ? "Shortfall to close" : "Surplus to redeploy"}</div>
          </div>
          <StatCard icon={<Inbox size={20} />} tone="#B45309" value={`${received}/${all.length}`} label="Submitted" sub={`${pct}% of your departments`} />
        </div>

        {/* Human Capital Overview + Workforce Outlook — the payoff of what you submit */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="text-sm font-semibold text-text1">Human Capital Overview</div>
            <div className="mb-4 text-xs text-text3">Your workforce today: headcount, job levels, Emiratization and cost, rolled up from submitted departments.</div>
            {hc?.has_data ? (
              <>
                <HcTiles hc={hc} />
                <div className="mt-4"><LevelBar levels={hc.by_level} /></div>
              </>
            ) : (
              <p className="text-sm text-text3">Add a department's <b className="font-semibold text-text2">Workforce profile</b> in the stepper to see your Human Capital overview.</p>
            )}
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-text1">Workforce Outlook</div>
              <span className="text-[11px] text-text3">Projected, {proj?.assumptions?.horizon_years ?? "—"} yrs</span>
            </div>
            <div className="mb-3 text-xs text-text3">Where demand and supply are heading if nothing changes.</div>
            <ProjectedGapChart points={proj?.points ?? []} height={196} />
            {proj?.assumptions && (
              <p className="mt-2 text-[11px] leading-relaxed text-text3">{proj.assumptions.demand} {proj.assumptions.supply}</p>
            )}
          </Card>
        </div>

        {/* S9 (mirrors S5): structural roles, tenure distribution, and where you're most stretched. */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold text-text1">Tenure distribution</div>
              {hc?.structural_roles ? <span className="text-[11px] text-text3">{hc.structural_roles.count} structural roles</span> : null}
            </div>
            <div className="mb-3 text-xs text-text3">Years of service across your submitted departments.</div>
            <DistributionBars items={(hc?.tenure ?? []).map((t) => ({ label: t.label, headcount: t.headcount, pct: t.pct }))} />
            {hc?.structural_roles && hc.structural_roles.count > 0 && (
              <div className="mt-4 rounded-card border border-border bg-inset p-3 text-xs leading-relaxed text-text2">
                <b className="text-text1">{hc.structural_roles.count}</b> structurally-driven roles: {hc.structural_roles.by_role.map((r) => `${r.headcount} ${r.role}`).join(", ")}. Managers, directors, executive directors, DGs and CEOs are a common source of organisational creep in FTE sizing.
              </div>
            )}
          </Card>
          <Card className="min-w-0 p-0">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Top departments in shortage & surplus</div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-5">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-danger">Shortage</div>
                {topShortage.length === 0 ? <p className="text-xs text-text3">None.</p> : topShortage.map((d) => (
                  <div key={d.department_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                  </div>
                ))}
              </div>
              <div className="p-5">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-success">Surplus</div>
                {topSurplus.length === 0 ? <p className="text-xs text-text3">None.</p> : topSurplus.map((d) => (
                  <div key={d.department_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <Card className="min-w-0 p-0">
            <div className="flex items-center justify-between border-b border-border p-3">
              <div className="relative w-72">
                <Search size={15} className="absolute left-2.5 top-2.5 text-text3" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search departments…" aria-label="Search departments"
                  className="h-9 w-full rounded-btn border border-border pl-8 pr-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
              </div>
              <span className="flex items-center gap-3 text-[11px] text-text3"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-text3/50" />Current</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Required</span></span>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<Users size={26} />} title={search ? "No matches" : "No departments yet"}
                description={search ? "Try a different search." : "Add your first department and pick its type to begin."}
                action={!search ? <Button size="sm" onClick={openAdd}><Plus size={14} /> Add Department</Button> : undefined} />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead><tr className="border-b border-border text-[11px] uppercase text-text3">
                  <th className="px-5 py-2.5">Department</th><th className="w-[14%] px-3 py-2.5">Current vs Required</th>
                  <th className="px-3 py-2.5 text-right">Current</th><th className="px-3 py-2.5 text-right">Required</th>
                  <th className="px-3 py-2.5 text-right">Gap</th><th className="px-3 py-2.5">Status</th><th className="px-4 py-2.5">Smart remarks</th><th /></tr></thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.department_id} className="cursor-pointer border-b border-border last:border-0 hover:bg-page/60" onClick={() => navigate(`/entity/departments/${d.department_id}`)}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 font-semibold text-text1">{d.name} <ArrowUpRight size={13} className="text-text3" /></div>
                        <div className="mt-0.5 text-[11px] text-text3">{d.typeset ?? "—"}</div>
                      </td>
                      <td className="px-3 py-4">{d.required_fte != null ? <MiniBar current={d.current_fte} required={d.required_fte} max={maxD} /> : <span className="text-xs text-text3">Not submitted</span>}</td>
                      <td className="px-3 py-4 text-right tabular-nums text-text2">{d.current_fte}</td>
                      <td className="px-3 py-4 text-right font-semibold tabular-nums text-text1">
                        {d.required_fte != null && d.submission_id != null ? (
                          <TraceableValue kind="submission" refId={d.submission_id} label={`Required FTE for ${d.name}`}>
                            {d.required_fte}
                          </TraceableValue>
                        ) : (d.required_fte ?? "—")}
                      </td>
                      <td className="px-3 py-4 text-right"><GapPill gap={d.gap} /></td>
                      <td className="px-3 py-4"><StatusBadge value={Q_STATUS_VALUE[d.status]} label={Q_STATUS_LABEL[d.status]} />{d.status_date && <div className="mt-0.5 text-[10px] text-text3">{new Date(d.status_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>}</td>
                      <td className="px-4 py-4"><SmartRemarkCell remark={d.remark} /></td>
                      <td className="px-2" onClick={(e) => e.stopPropagation()}><RowMenu label={`Actions for ${d.name}`} items={[
                        { label: "Open submission", icon: <ArrowUpRight size={15} />, onClick: () => navigate(`/entity/departments/${d.department_id}`) },
                        { label: "Edit department", icon: <Pencil size={15} />, onClick: () => openEdit(d) },
                        { label: "Delete department", icon: <Trash2 size={15} />, tone: "danger", onClick: () => del(d) },
                      ]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card>
              <div className="mb-3 text-sm font-semibold text-text1">Your progress</div>
              <div className="mb-1 flex justify-between text-xs text-text3"><span><b className="text-text1">{received}</b> of {all.length} submitted</span><span>{pct}%</span></div>
              <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-surface2"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
              <div className="mb-4"><SubmissionPipeline stages={pipe?.stages ?? []} total={pipe?.total ?? 0} compact /></div>
              <div className="space-y-1.5">
                {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <div key={s} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_DOT[s] ?? "rgb(var(--border-strong))" }} />
                    <span className="flex-1 text-text2">{Q_STATUS_LABEL[s] ?? s}</span>
                    <span className="font-semibold tabular-nums text-text1">{n}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><AlertTriangle size={15} className="text-warning" /> Still to do</div>
              {todo.length === 0 ? <p className="text-sm text-text3">All departments submitted. Nothing outstanding.</p> : (
                <div className="space-y-1.5">
                  {todo.slice(0, 6).map((d) => (
                    <button key={d.department_id} onClick={() => navigate(`/entity/departments/${d.department_id}`)}
                      className="flex w-full items-center gap-2 rounded-btn bg-surface2 px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface3">
                      <span className="flex-1 truncate text-text1">{d.name}</span>
                      <StatusBadge value={Q_STATUS_VALUE[d.status]} label={Q_STATUS_LABEL[d.status]} />
                    </button>
                  ))}
                  {todo.length > 6 && <p className="pt-1 text-xs text-text3">+{todo.length - 6} more</p>}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </PageBody>

      <Modal open={open} onClose={reset} title={editId != null ? "Edit Department" : "Add Department"}
        footer={<><Button variant="secondary" onClick={reset}>Cancel</Button><Button onClick={save}>{editId != null ? "Save" : "Add Department"}</Button></>}>
        <Field label="Department name"><TextInput value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Customer Happiness Centres" /></Field>
        <Field label="Department type">
          <Select value={form.typeset_id} onChange={(e) => setForm((f) => ({ ...f, typeset_id: Number(e.target.value) }))}>
            {(typesets ?? []).map((ts) => <option key={ts.id} value={ts.id}>{ts.name}</option>)}
          </Select>
        </Field>
        <Field label="Current FTE on payroll"><TextInput type="number" value={form.current_fte} onChange={(e) => setForm((f) => ({ ...f, current_fte: Number(e.target.value) }))} /></Field>
      </Modal>
    </>
  );
}
