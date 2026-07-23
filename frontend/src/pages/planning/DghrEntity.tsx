import { useQuery } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Users, Target, TrendingUp, ArrowUpRight, Inbox, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityLogo } from "@/components/shared/EntityLogo";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { THEAD_TR } from "@/components/ui/table";
import { TraceableValue } from "@/components/shared/TraceableValue";
import { Acronym } from "@/components/shared/Acronym";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";
import { MiniBar, GapPill, StatCard, HcTiles, LevelBar, ProjectedGapChart, SupplyChain, SmartRemarkCell, DistributionBars, fmtFte } from "./widgets";

const STATUS_DOT: Record<string, string> = {
  approved: "rgb(var(--success))", submitted: "rgb(var(--primary))", in_clarification: "rgb(var(--warning))",
  rejected: "rgb(var(--danger))", draft: "rgb(var(--text-3))", no_submission: "rgb(var(--border-strong))",
};

export function PlanningDghrEntity() {
  const { entityId } = useParams();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["q-dghr-entity", entityId], queryFn: () => api.planning.dghrEntity(Number(entityId)), enabled: !!entityId, refetchInterval: 4000 });
  const { data: hc } = useQuery({ queryKey: ["q-hc", entityId], queryFn: () => api.planning.humanCapital(Number(entityId)), enabled: !!entityId, refetchInterval: 4000 });
  const { data: proj } = useQuery({ queryKey: ["q-proj", entityId], queryFn: () => api.planning.projection(Number(entityId)), enabled: !!entityId, refetchInterval: 4000 });
  const t = data?.totals;
  const rows = data?.departments ?? [];
  const maxD = Math.max(1, ...rows.filter((d) => d.required_fte != null).map((d) => Math.max(d.current_fte, d.required_fte ?? 0)));
  const gap = t?.gap ?? 0;
  const received = rows.filter((d) => ["submitted", "in_clarification", "approved"].includes(d.status)).length;
  const pct = rows.length ? Math.round((received / rows.length) * 100) : 0;
  const counts = rows.reduce<Record<string, number>>((a, d) => ({ ...a, [d.status]: (a[d.status] ?? 0) + 1 }), {});
  const awaiting = rows.filter((d) => ["submitted", "in_clarification"].includes(d.status));
  const withGap = rows.filter((d) => d.gap != null && d.required_fte != null);
  const topShortage = withGap.filter((d) => (d.gap ?? 0) < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0)).slice(0, 4);
  const topSurplus = withGap.filter((d) => (d.gap ?? 0) > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 4);

  return (
    <>
      <PageHeader title={data?.entity.name ?? "Entity"} subtitle="All departments and their submission status. Open any to see the full submission and take action."
        leading={data?.entity ? <EntityLogo name={data.entity.name} code={data.entity.code} size={48} rounded="lg" /> : undefined}
        actions={<Button variant="secondary" size="sm" onClick={() => navigate("/dghr/government")}><ChevronLeft size={15} /> Government view</Button>} />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<Users size={20} />} tone="#2563EB" value={fmtFte(t?.current_fte ?? 0)} label="Available FTE" sub={<Acronym short={data?.entity.code ?? ""} full={data?.entity.name} />} />
          <StatCard icon={<Target size={20} />} tone="#7C3AED" label="Required FTE" sub="From received submissions"
            value={<TraceableValue kind="entity" refId={data?.entity_id ?? 0} label={`Required FTE for ${data?.entity.name ?? "this entity"}`}>{t?.required_fte ?? 0}</TraceableValue>} />
          <StatCard icon={<TrendingUp size={20} />} tone={gap < 0 ? "#E11D48" : "#15803D"} value={`${gap > 0 ? "+" : ""}${gap}`} label="Net Gap (this year)" sub={gap < 0 ? "Shortfall to close" : "Surplus to redeploy"} />
          <StatCard icon={<Inbox size={20} />} tone="#B45309" value={`${received}/${rows.length}`} label="Submissions Received" sub={`${pct}% of departments`} />
        </div>

        {/* Human Capital Overview + projected gap for this entity */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <div className="text-sm font-semibold text-text1">Human Capital Overview</div>
            <div className="mb-4 text-xs text-text3">This entity's workforce: people, time, job levels, Emiratization and cost, from received submissions.</div>
            {hc?.has_data ? (
              <>
                <HcTiles hc={hc} />
                <div className="mt-4"><LevelBar levels={hc.by_level} /></div>
              </>
            ) : <p className="text-sm text-text3">No workforce data submitted yet.</p>}
          </Card>

          {/* Why this entity is short: vacant posts, part-timers, and people lent away. */}
          <Card>
            <div className="text-sm font-semibold text-text1">Supply reconciliation</div>
            <div className="mb-3 text-xs text-text3">From approved posts to the FTE actually available to plan against.</div>
            {hc?.supply?.has_data ? <SupplyChain s={hc.supply} /> : <p className="text-sm text-text3">No workforce data submitted yet.</p>}
          </Card>
          <Card>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-text1">Projected demand vs supply</div>
              <span className="text-[11px] text-text3">{proj?.assumptions?.horizon_years ?? "-"} yrs</span>
            </div>
            <div className="mb-3 text-xs text-text3">Where this entity is heading if nothing changes.</div>
            <ProjectedGapChart points={proj?.points ?? []} height={212} />
            {proj?.assumptions && (
              <p className="mt-2 text-[11px] leading-relaxed text-text3">{proj.assumptions.demand} {proj.assumptions.supply}</p>
            )}
          </Card>
        </div>

        {/* S5: structurally-driven roles, tenure distribution, and where this entity is most stretched. */}
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-sm font-semibold text-text1">Tenure distribution</div>
              {hc?.structural_roles ? <span className="text-[11px] text-text3">{hc.structural_roles.count} structural roles</span> : null}
            </div>
            <div className="mb-3 text-xs text-text3">Years of service across received submissions, alongside the job-level mix above.</div>
            <DistributionBars items={(hc?.tenure ?? []).map((t) => ({ label: t.label, headcount: t.headcount, pct: t.pct }))} />
            {hc?.structural_roles && hc.structural_roles.count > 0 && (
              <div className="mt-4 rounded-card border border-border bg-inset p-3.5 text-xs leading-relaxed text-text2">
                <b className="text-text1">{hc.structural_roles.count}</b> structurally-driven roles: {hc.structural_roles.by_role.map((r) => `${r.headcount} ${r.role}`).join(", ")}. Managers, directors, executive directors, DGs and CEOs are a common source of organisational creep in FTE sizing.
              </div>
            )}
          </Card>
          <Card className="min-w-0 p-0">
            <div className="border-b border-border px-5 py-3.5 text-sm font-semibold text-text1">Top departments in shortage & surplus</div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-danger"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Shortage</div>
                {topShortage.length === 0 ? <p className="text-xs text-text3">None.</p> : (
                  <div className="divide-y divide-border/60">
                    {topShortage.map((d) => (
                      <div key={d.department_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />Surplus</div>
                {topSurplus.length === 0 ? <p className="text-xs text-text3">None.</p> : (
                  <div className="divide-y divide-border/60">
                    {topSurplus.map((d) => (
                      <div key={d.department_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          {/* hero: departments */}
          <Card className="min-w-0 p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
              <span className="text-sm font-semibold text-text1">Departments</span>
              <span className="flex items-center gap-3 text-[11px] text-text3"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-text3/50" />Current</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Required</span></span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead><tr className={THEAD_TR}>
                <th className="px-5 py-2.5">Department</th><th className="w-[16%] px-3 py-2.5">Current vs Required</th>
                <th className="px-3 py-2.5 text-right">Current</th><th className="px-3 py-2.5 text-right">Required</th><th className="px-3 py-2.5 text-right">Gap</th><th className="px-3 py-2.5">Status</th><th className="px-5 py-2.5">Smart remarks</th></tr></thead>
              <tbody>
                {rows.map((d) => {
                  const openable = d.submission_id != null && d.status !== "no_submission";
                  return (
                    <tr key={d.department_id} className={`border-b border-border transition-colors duration-fast last:border-0 ${openable ? "cursor-pointer hover:bg-surface2" : ""}`}
                      onClick={() => openable && navigate(`/dghr/gov-submission/${d.submission_id}`)}>
                      <td className="px-5 py-4">
                        <div className={`flex items-center gap-2 font-semibold ${openable ? "text-text1" : "text-text2"}`}>{d.name} {openable && <ArrowUpRight size={13} className="text-text3" />}</div>
                        <div className="mt-0.5 text-[11px] text-text3">{d.typeset ?? "-"}</div>
                      </td>
                      <td className="px-3 py-4">{d.required_fte != null ? <MiniBar current={d.current_fte} required={d.required_fte} max={maxD} /> : <span className="text-xs text-text3">Not submitted</span>}</td>
                      <td className="px-3 py-4 text-right tabular-nums text-text2">{d.current_fte}</td>
                      <td className="px-3 py-4 text-right font-semibold tabular-nums text-text1">
                        {d.required_fte != null && d.submission_id != null ? (
                          <TraceableValue kind="submission" refId={d.submission_id} label={`Required FTE for ${d.name}`}>
                            {d.required_fte}
                          </TraceableValue>
                        ) : (d.required_fte ?? "-")}
                      </td>
                      <td className="px-3 py-4 text-right"><GapPill gap={d.gap} /></td>
                      <td className="px-3 py-4"><StatusBadge value={Q_STATUS_VALUE[d.status]} label={Q_STATUS_LABEL[d.status]} />{d.status_date && <div className="mt-0.5 text-[10px] text-text3">{new Date(d.status_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>}</td>
                      <td className="px-5 py-4"><SmartRemarkCell remark={d.remark} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </Card>

          {/* context rail */}
          <aside className="space-y-4">
            <Card>
              <div className="mb-3 text-sm font-semibold text-text1">Collection progress</div>
              <div className="mb-1 flex justify-between text-xs text-text3"><span><b className="text-text1">{received}</b> of {rows.length} received</span><span>{pct}%</span></div>
              <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-inset"><div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} /></div>
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
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><AlertTriangle size={15} className="text-warning" /> Awaiting your review</div>
              {awaiting.length === 0 ? <p className="text-sm text-text3">Nothing waiting, all received submissions are decided.</p> : (
                <div className="space-y-1.5">
                  {awaiting.map((d) => (
                    <button key={d.department_id} onClick={() => navigate(`/dghr/gov-submission/${d.submission_id}`)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface2">
                      <span className="flex-1 truncate text-text1">{d.name}</span>
                      <GapPill gap={d.gap} />
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
