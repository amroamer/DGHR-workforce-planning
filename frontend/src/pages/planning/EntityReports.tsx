import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download, Users, Target, TrendingUp, IdCard } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { usePersona } from "@/stores/persona";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityLogo } from "@/components/shared/EntityLogo";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { NarrativeCard } from "@/components/shared/NarrativeCard";
import { AskDataPanel } from "@/components/shared/AskDataPanel";
import { THEAD_TR, TH, TH_NUM, TROW, TD, TD_NUM } from "@/components/ui/table";
import { GapPill, StatCard, HcTiles, LevelBar, ProjectedGapChart, ProjectedGapTable, SmartRemarkCell, DistributionBars, fmtFte } from "./widgets";
import { NatureOfSurplusDeficit } from "@/components/shared/NatureOfSurplusDeficit";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";

// Entity Reports — a read-only roll-up of everything the app computed from this entity's
// submissions, plus a real CSV export. Every figure comes from the API.
export function PlanningEntityReports() {
  const { entityId } = useAudience();
  const { persona } = usePersona();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["q-depts", entityId], queryFn: () => api.planning.departments(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: hc } = useQuery({ queryKey: ["q-hc", entityId], queryFn: () => api.planning.humanCapital(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: proj } = useQuery({ queryKey: ["q-proj", entityId], queryFn: () => api.planning.projection(entityId!), enabled: entityId != null, refetchInterval: 4000 });

  const t = data?.totals;
  const rows = data?.departments ?? [];
  const gap = t?.gap ?? 0;
  const received = rows.filter((d) => ["submitted", "in_clarification", "approved"].includes(d.status)).length;
  const withGap = rows.filter((d) => d.gap != null && d.required_fte != null);
  const topShortage = withGap.filter((d) => (d.gap ?? 0) < 0).sort((a, b) => (a.gap ?? 0) - (b.gap ?? 0)).slice(0, 4);
  const topSurplus = withGap.filter((d) => (d.gap ?? 0) > 0).sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0)).slice(0, 4);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Your workforce report: every figure computed from what you submitted. Export it for your own reporting."
        leading={<EntityLogo name={persona.portalTitle} code={persona.code} size={48} rounded="lg" />}
        actions={entityId != null ? (
          <Button size="sm" onClick={() => window.open(api.planning.entityReportCsvUrl(entityId), "_blank")}>
            <Download size={15} /> Export CSV
          </Button>
        ) : undefined}
      />
      <PageBody>
        {rows.length === 0 ? (
          <Card><EmptyState icon={<Target size={26} />} title="Nothing to report yet"
            description="Once you add departments and submit their drivers, your report builds itself here."
            action={<Button size="sm" onClick={() => navigate("/entity/departments")}>Go to Departments</Button>} /></Card>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={<Users size={20} />} tone="#2563EB" value={fmtFte(t?.current_fte ?? 0)} label="Available FTE" sub="Net of secondments" />
              <StatCard icon={<Target size={20} />} tone="#7C3AED" value={fmtFte(t?.required_fte ?? 0)} label="Required FTE" sub="Sized from your drivers" />
              <StatCard icon={<TrendingUp size={20} />} tone={gap < 0 ? "#E11D48" : "#15803D"} value={`${gap > 0 ? "+" : ""}${gap}`} label="Net Gap (this year)" sub={gap < 0 ? "Shortfall to close" : "Surplus to redeploy"} />
              <StatCard icon={<IdCard size={20} />} tone="#0D9488" value={hc?.headcount ?? 0} label="Headcount" sub={`${hc?.emiratization_pct ?? 0}% Emiratization`} />
            </div>

            <NarrativeCard
              hint="A written read of your report — coverage, the gap, where it concentrates, and what to do next."
              generate={() => api.aiReportNarrative("entity", entityId!)} />

            {/* Ask-the-data chat scoped to this entity — grounded in the same figures on this page. */}
            <AskDataPanel scope="entity" entityId={entityId!} />

            <div className="mb-4">
              <Card>
                <div className="text-sm font-semibold text-text1">Human Capital</div>
                <div className="mb-4 text-xs text-text3">Headcount, job levels, Emiratization and cost across your departments.</div>
                {hc?.has_data ? (<><HcTiles hc={hc} /><div className="mt-4"><LevelBar levels={hc.by_level} /></div></>)
                  : <p className="text-sm text-text3">No workforce profile submitted yet.</p>}
              </Card>
            </div>

            <Card className="mb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-text1">Projected demand vs supply</div>
                <span className="text-[11px] text-text3">{proj?.assumptions?.horizon_years ?? "—"} yrs</span>
              </div>
              <div className="mb-3 text-xs text-text3">Where you're heading if nothing changes.</div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <ProjectedGapChart points={proj?.points ?? []} height={264} />
                <ProjectedGapTable points={proj?.points ?? []} />
              </div>
              {proj?.assumptions && <p className="mt-2 text-[11px] leading-relaxed text-text3">{proj.assumptions.demand} {proj.assumptions.supply}</p>}
            </Card>

            {/* S16 (mirrors S5): structural roles, tenure distribution, top shortage/surplus. */}
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Tenure distribution</div>
                  {hc?.structural_roles ? <span className="text-[11px] text-text3">{hc.structural_roles.count} structural roles</span> : null}
                </div>
                <div className="mb-3 text-xs text-text3">Years of service across your submitted departments.</div>
                <DistributionBars items={(hc?.tenure ?? []).map((t) => ({ label: t.label, headcount: t.headcount, pct: t.pct }))} />
                {hc?.structural_roles && hc.structural_roles.count > 0 && (
                  <div className="mt-4 rounded-lg bg-inset p-3 text-xs leading-relaxed text-text2">
                    <b className="text-text1">{hc.structural_roles.count}</b> structurally-driven roles: {hc.structural_roles.by_role.map((r) => `${r.headcount} ${r.role}`).join(", ")}. Managers, directors, executive directors, DGs and CEOs are a common source of organisational creep in FTE sizing.
                  </div>
                )}
              </Card>
              <Card className="min-w-0 p-0">
                <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Top departments in shortage & surplus</div>
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="p-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase text-danger">Shortage</div>
                    {topShortage.length === 0 ? <p className="text-xs text-text3">None.</p> : topShortage.map((d) => (
                      <div key={d.department_id} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                      </div>
                    ))}
                  </div>
                  <div className="p-4">
                    <div className="mb-2 text-[11px] font-semibold uppercase text-success">Surplus</div>
                    {topSurplus.length === 0 ? <p className="text-xs text-text3">None.</p> : topSurplus.map((d) => (
                      <div key={d.department_id} className="flex items-center justify-between gap-2 py-1 text-sm">
                        <span className="min-w-0 truncate text-text2">{d.name}</span><GapPill gap={d.gap} />
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>

            <Card className="min-w-0 p-0">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <span className="text-sm font-semibold text-text1">Departments</span>
                <span className="text-[11px] text-text3">{received} of {rows.length} submitted</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className="px-5 py-2.5">Department</th><th className={TH_NUM}>Current</th>
                    <th className={TH_NUM}>Required</th><th className={TH_NUM}>Gap</th>
                    <th className={TH_NUM}>Headcount</th><th className={TH_NUM}>Emr %</th>
                    <th className={TH}>Status</th><th className="px-5 py-2.5">Smart remarks</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((d) => {
                      const h = hc?.departments?.find((x) => x.department_id === d.department_id);
                      return (
                        <tr key={d.department_id} className={`${TROW} cursor-pointer`}
                          onClick={() => navigate(`/entity/departments/${d.department_id}`)}>
                          <td className="px-5 py-3.5 text-sm font-semibold text-text1">{d.name}<div className="text-[11px] font-normal text-text3">{d.typeset ?? "—"}</div></td>
                          <td className="px-3 py-3.5 text-right text-sm text-text2 nums">{fmtFte(d.current_fte)}</td>
                          <td className={`${TD_NUM} font-semibold`}>{d.required_fte != null ? fmtFte(d.required_fte) : "—"}</td>
                          <td className="px-3 py-3.5 text-right"><GapPill gap={d.gap} /></td>
                          <td className="px-3 py-3.5 text-right text-sm text-text2 nums">{h?.headcount ?? "—"}</td>
                          <td className="px-3 py-3.5 text-right text-sm text-text2 nums">{h ? `${h.emiratization_pct}%` : "—"}</td>
                          <td className={TD}><StatusBadge value={Q_STATUS_VALUE[d.status]} label={Q_STATUS_LABEL[d.status]} />{d.status_date && <div className="mt-0.5 text-[10px] text-text3">{new Date(d.status_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>}</td>
                          <td className="px-5 py-3.5 text-sm"><SmartRemarkCell remark={d.remark} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* S16: nature-of-surplus/deficit analysis (illustrative MHRSD reference framework). */}
            <div className="mt-4"><NatureOfSurplusDeficit /></div>
          </>
        )}
      </PageBody>
    </>
  );
}
