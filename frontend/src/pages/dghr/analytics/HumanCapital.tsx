import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtAED } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import {
  Panel, KpiTile, LevelMixBar, EmploymentChart, AreaTrend, DemographicDonut, Gauge,
  GapDualLine, Segmented, DashSkeleton,
} from "@/components/shared/dashcharts";
import { CountUp, Reveal } from "@/components/shared/motionkit";
import { useAnalyticsControls, ControlsBar } from "./_controls";

const fmtMn = (v: number) => `${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M`;

export function HumanCapitalOverview() {
  const ctrl = useAnalyticsControls();
  const [view, setView] = useState<"total" | "level">("total");
  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: ["an-hc", ctrl.entityId, ctrl.basis, ctrl.scenario],
    queryFn: () => api.planning.analyticsHumanCapital(ctrl.basis, ctrl.scenario, ctrl.entityId),
    refetchInterval: 4000,
    // Filter switches keep the old figures on screen and morph to the new ones —
    // no "Loading…" flash. The brief opacity dim below signals the refresh.
    placeholderData: keepPreviousData,
  });

  const yoy = data && data.cost_series.length > 1 && data.cost_series[0].cost_aed
    ? Math.round((data.cost_series[1].cost_aed / data.cost_series[0].cost_aed - 1) * 100) : undefined;
  const lastYear = data ? data.employment_series[data.employment_series.length - 1]?.year : undefined;
  const netGap = data ? Math.round(data.totals.gap) : 0;

  return (
    <>
      <PageHeader title="Human Capital Overview"
        subtitle="Strategic workforce planning: employment, cost, Emiratization and demographics, computed live from submitted data." />
      <PageBody>
        <ControlsBar ctrl={ctrl} bases={data?.bases} scenarios={data?.scenarios} />

        {!data && isPending ? (
          <DashSkeleton hero />
        ) : !data?.has_data ? (
          <Panel><div className="py-10 text-center text-sm text-text3">No submitted workforce data for this scope yet.</div></Panel>
        ) : (
          <div className={cn("transition-opacity duration-300", isPlaceholderData && "opacity-60")}>
            {/* Employment (FTEs) + executive summary */}
            <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Reveal i={0}>
                <Panel className="h-full" title="Employment (FTEs)" live
                  subtitle={`${data.scope.label}, ${data.reporting_period.label}`}
                  action={<Segmented size="sm" value={view} options={[{ value: "total", label: "Total" }, { value: "level", label: "Job Level" }]} onChange={(v) => setView(v as "total" | "level")} />}>
                  <EmploymentChart data={data.employment_series} animKey={`${ctrl.animKey}|${view}`}
                    byLevel={view === "level" ? data.employment_by_level : undefined} height={320} />
                </Panel>
              </Reveal>
              <Reveal i={1}>
                {/* The page's hero: the story an exec should leave with, numbers first. */}
                <Panel className="flex h-full flex-col border-l-4 !border-l-primary bg-gradient-to-br from-primary/5 via-card to-card"
                  title={<span className="inline-flex items-center gap-1.5"><Sparkles size={15} className="text-primary" />Executive Summary</span>}>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <span className={cn("nums rounded-full px-2.5 py-1 text-[11px] font-bold",
                      netGap < 0 ? "bg-danger-bg text-danger" : "bg-success-bg text-success")}>
                      {netGap < 0 ? "▼" : "▲"} {Math.abs(netGap).toLocaleString()} FTE {netGap < 0 ? "shortfall" : "surplus"} by {lastYear}
                    </span>
                    <span className={cn("nums rounded-full px-2.5 py-1 text-[11px] font-bold",
                      data.emiratization_pct >= data.emiratization_target_pct ? "bg-success-bg text-success" : "bg-warning-bg text-warning")}>
                      {data.emiratization_pct}% Emiratization vs {data.emiratization_target_pct}% target
                    </span>
                  </div>
                  <ul className="divide-y divide-border text-[13px] leading-relaxed text-text2">
                    <li className="py-2.5 first:pt-0 last:pb-0"><b className="nums text-text1">{data.headcount.toLocaleString()}</b> people ({data.fte.toLocaleString()} FTE) across {data.departments_counted} departments.</li>
                    <li className="py-2.5 first:pt-0 last:pb-0">Required workforce reaches <b className="nums text-text1">{data.employment_target.toLocaleString()}</b> FTE by {lastYear}, a projected {netGap < 0 ? "shortfall" : "surplus"} of <b className={`nums ${netGap < 0 ? "text-danger" : "text-success"}`}>{Math.abs(netGap).toLocaleString()}</b> FTE.</li>
                    <li className="py-2.5 first:pt-0 last:pb-0">Emiratization is <b className="nums text-text1">{data.emiratization_pct}%</b> against a {data.emiratization_target_pct}% target.</li>
                    {data.assumptions && <li className="py-2.5 text-text3 first:pt-0 last:pb-0">{data.assumptions.demand} {data.assumptions.supply}</li>}
                  </ul>
                </Panel>
              </Reveal>
            </div>

            {/* KPI row */}
            <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Reveal i={2}>
                <KpiTile value={<CountUp value={data.headcount} />} label="Employment" tone="#2563EB"
                  sub={`Target ${data.employment_target.toLocaleString()} FTE`}
                  progress={{ value: data.headcount, target: data.employment_target }} />
              </Reveal>
              <Reveal i={3}>
                <KpiTile value={<CountUp value={data.annual_cost_aed} format={fmtAED} />} label="Total Employee (FTE) Cost" yoy={yoy}
                  sub={`${fmtAED(data.cost_per_fte)}/FTE`} />
              </Reveal>
              <Reveal i={4} className="col-span-2">
                <Panel className="h-full" title="Employment by Job Level" live>
                  <LevelMixBar levels={data.by_level} />
                </Panel>
              </Reveal>
            </div>

            {/* Cost trend */}
            <Reveal i={5}>
              <Panel className="mb-4" title="Total Employee (FTE) Cost (Mn AED)" live
                subtitle="Projected cost to staff the required workforce each year: demand × blended cost per FTE.">
                <AreaTrend data={data.cost_series} yKey="cost_aed" format={fmtMn} height={230} animKey={ctrl.animKey} />
              </Panel>
            </Reveal>

            {/* Demographics */}
            <Reveal i={6}>
              <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Panel className="flex flex-col" title="Emiratization" live subtitle="Actual vs government target">
                  <div className="flex-1 pt-2"><Gauge value={data.emiratization_pct} target={data.emiratization_target_pct} /></div>
                  <div className="nums mt-1 text-center text-xs text-text3">{data.emirati_count.toLocaleString()} Emirati of {data.headcount.toLocaleString()}</div>
                </Panel>
                {(["gender", "age_band", "grade_band", "region", "nationality"] as const).map((dim) => (
                  data.demographics[dim]?.some((b) => b.headcount > 0) && (
                    <Panel key={dim} title={dim === "nationality" ? "Workforce by Diversity" : `Workforce by ${data.band_labels[dim]}`} live>
                      <DemographicDonut buckets={data.demographics[dim]} animKey={ctrl.animKey} />
                    </Panel>
                  )
                ))}
              </div>
            </Reveal>

            {/* Gap by level */}
            <Reveal i={7}>
              <Panel title="Demand–Supply Gap by Job Level" live
                subtitle="Per-level trajectory: excess demand (vacancies) above zero, excess supply below.">
                <GapDualLine series={data.gap_by_level} animKey={ctrl.animKey} />
              </Panel>
            </Reveal>
          </div>
        )}
      </PageBody>
    </>
  );
}
