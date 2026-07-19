import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Download, Users, Target, TrendingUp, IdCard, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEAD_TR, TH, TH_NUM, TROW, TD, TD_NUM } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { NarrativeCard } from "@/components/shared/NarrativeCard";
import { GapPill, StatCard, HcTiles, LevelBar, ProjectedGapChart, ProjectedGapTable, fmtFte } from "./widgets";
import { NatureOfSurplusDeficit } from "@/components/shared/NatureOfSurplusDeficit";
import govMark from "@/assets/brand/government-of-dubai.png";

// DGHR Reports — the government-wide roll-up in report form, with a real CSV export.
// Every figure is computed from submitted data; nothing is hardcoded.
export function PlanningGovReports() {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState("base");
  const { data } = useQuery({ queryKey: ["q-gov", scenario], queryFn: () => api.planning.government(scenario), refetchInterval: 4000 });
  const { data: hc } = useQuery({ queryKey: ["q-gov-hc"], queryFn: () => api.planning.govHumanCapital(), refetchInterval: 4000 });
  const { data: proj } = useQuery({ queryKey: ["q-gov-proj", scenario], queryFn: () => api.planning.govProjection(scenario), refetchInterval: 4000 });

  const t = data?.totals;
  const gap = t?.gap ?? 0;
  const entities = (data?.entities ?? []).slice().sort((a, b) => b.required_fte - a.required_fte);
  const hcByEntity = new Map((hc?.entities ?? []).map((e) => [e.entity_id, e]));

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Government-wide workforce report: current vs required, human capital and outlook across every entity."
        leading={
          <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-black/5">
            <img src={govMark} alt="Government of Dubai" className="h-8 w-auto object-contain" />
          </span>
        }
        actions={<Button size="sm" onClick={() => window.open(api.planning.govReportCsvUrl(scenario), "_blank")}>
          <Download size={15} /> Export CSV
        </Button>}
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase text-text3">Scenarios</span>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {(data?.scenarios ?? [{ key: "base", label: "Baseline" }]).map((s) => (
                <button key={s.key} onClick={() => setScenario(s.key)}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${scenario === s.key ? "bg-primary text-white shadow-sm" : "text-text2 hover:text-text1"}`}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="text-xs text-text3">{t?.departments ?? 0} departments counted</div>
        </div>

        {(t?.departments ?? 0) === 0 ? (
          <Card><EmptyState icon={<Target size={26} />} title="No submissions yet"
            description="The report builds itself as entities submit their departments. There are no seeded figures." /></Card>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard icon={<Users size={20} />} tone="#2563EB" value={fmtFte(t?.current_fte ?? 0)} label="Available FTE" sub="Net of secondments" />
              <StatCard icon={<Target size={20} />} tone="#7C3AED" value={t?.required_fte ?? 0} label="Required FTE" sub="Sized from submissions" />
              <StatCard icon={<TrendingUp size={20} />} tone={gap < 0 ? "#E11D48" : "#15803D"} value={`${gap > 0 ? "+" : ""}${gap}`} label="Net Gap (this year)" sub={gap < 0 ? "Shortfall to close" : "Surplus to redeploy"} />
              <StatCard icon={<IdCard size={20} />} tone="#0D9488" value={hc?.headcount ?? 0} label="Headcount" sub={`${hc?.emiratization_pct ?? 0}% Emiratization`} />
            </div>

            {/* key resets the narrative when the scenario flips — a base-case summary must not sit over stress-case numbers */}
            <NarrativeCard key={scenario}
              hint="A written read of the government-wide position under the selected scenario."
              generate={() => api.aiReportNarrative("gov", undefined, scenario)} />

            <Card className="mb-4">
              <div className="text-sm font-semibold text-text1">Human Capital</div>
              <div className="mb-4 text-xs text-text3">Headcount, job levels, Emiratization and cost across all submitted departments.</div>
              {hc?.has_data ? (
                <>
                  <HcTiles hc={hc} />
                  <div className="mt-5 border-t border-border pt-4"><LevelBar levels={hc.by_level} /></div>
                </>
              ) : <p className="text-sm text-text3">No workforce data yet.</p>}
            </Card>

            <Card className="mb-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-text1">Projected demand vs supply</div>
                <span className="text-[11px] text-text3">{proj?.assumptions?.horizon_years ?? "—"} yrs</span>
              </div>
              <div className="mb-4 text-xs text-text3">Government-wide trajectory if nothing changes.</div>
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
                <ProjectedGapChart points={proj?.points ?? []} height={260} />
                <div className="min-w-0 lg:border-l lg:border-border lg:pl-6">
                  <ProjectedGapTable points={proj?.points ?? []} />
                </div>
              </div>
              {proj?.assumptions && <p className="mt-3 text-[11px] leading-relaxed text-text3">{proj.assumptions.demand} {proj.assumptions.supply}</p>}
            </Card>

            <Card className="min-w-0 p-0">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">By entity</div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className={`${TH} pl-5`}>Entity</th>
                    <th className={TH_NUM}>Required</th>
                    <th className={TH_NUM}>Gap</th>
                    <th className={TH_NUM}>Headcount</th>
                    <th className={`${TH_NUM} pr-5`}>Emr %</th>
                  </tr></thead>
                  <tbody>{entities.map((e) => {
                    const h = hcByEntity.get(e.entity_id);
                    return (
                      <tr key={e.entity_id} className={`${TROW} cursor-pointer`}
                        onClick={() => navigate(`/dghr/gov-entity/${e.entity_id}`)}>
                        <td className={`${TD} pl-5`}><div className="flex items-center gap-1.5 font-semibold text-text1">{e.name} <ArrowUpRight size={12} className="text-text3" /></div></td>
                        <td className={`${TD_NUM} font-semibold`}>{e.required_fte}</td>
                        <td className={TD_NUM}><GapPill gap={e.gap} /></td>
                        <td className={`${TD_NUM} text-text2`}>{h?.headcount ?? "—"}</td>
                        <td className={`${TD_NUM} pr-5 text-text2`}>{h ? `${h.emiratization_pct}%` : "—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </Card>

            {/* S6: nature-of-surplus/deficit analysis (illustrative MHRSD reference framework). */}
            <div className="mt-4"><NatureOfSurplusDeficit /></div>
          </>
        )}
      </PageBody>
    </>
  );
}
