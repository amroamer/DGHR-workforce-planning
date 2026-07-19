import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import {
  Panel, KpiTile, LevelMixBar, EmploymentChart, DemographicDonut, RankList, PctList,
  Segmented, PageTabs, ProvenanceChip, DashSkeleton,
} from "@/components/shared/dashcharts";
import { CountUp, Reveal } from "@/components/shared/motionkit";
import { useAnalyticsControls, ControlsBar, IllustrativeNote } from "./_controls";

const fmtSigned = (v: number) => `${v >= 0 ? "+" : "-"}${Math.abs(Math.round(v)).toLocaleString()}`;

export function DemandAnalysis() {
  const ctrl = useAnalyticsControls();
  const [tab, setTab] = useState<"overview" | "jobs">("overview");
  const [view, setView] = useState<"total" | "level">("total");
  const [trend, setTrend] = useState<"growing" | "declining">("growing");
  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: ["an-demand", ctrl.entityId, ctrl.basis, ctrl.scenario],
    queryFn: () => api.planning.analyticsDemand(ctrl.basis, ctrl.scenario, ctrl.entityId),
    refetchInterval: 4000,
    placeholderData: keepPreviousData, // filter switches morph in place, no loading flash
  });

  const growing = (data?.growing_declining ?? []).filter((r) => r.pct_change > 0);
  const declining = (data?.growing_declining ?? []).filter((r) => r.pct_change < 0)
    .slice().sort((a, b) => a.pct_change - b.pct_change);
  const trendRows = (trend === "growing" ? growing : declining).map((r) => ({ label: r.typeset, pct: r.pct_change }));

  return (
    <>
      <PageHeader title="Demand Analysis"
        subtitle="Projected employment and the roles driving future demand: live from submitted forecasts, with reference labour-market intelligence." />
      <PageBody>
        <ControlsBar ctrl={ctrl} bases={data?.bases} scenarios={data?.scenarios} />
        <div className="mb-5">
          <PageTabs value={tab} options={[{ value: "overview", label: "Overview" }, { value: "jobs", label: "Jobs & Skills" }]} onChange={(v) => setTab(v as "overview" | "jobs")} />
        </div>

        {!data && isPending ? (
          <DashSkeleton />
        ) : !data?.has_data ? (
          <Panel><div className="py-10 text-center text-sm text-text3">No submitted data for this scope yet.</div></Panel>
        ) : (
          <div className={cn("transition-opacity duration-300", isPlaceholderData && "opacity-60")}>
            {tab === "overview" ? (
              <>
                <Reveal i={0}>
                  <Panel className="mb-4" title="Projected Employment" live
                    subtitle={`${data.scope.label}, sized from each department's own 12-month forecast`}
                    action={<Segmented size="sm" value={view} options={[{ value: "total", label: "Total" }, { value: "level", label: "Job Level" }]} onChange={(v) => setView(v as "total" | "level")} />}>
                    <EmploymentChart data={data.projected_employment} byLevel={view === "level" ? data.projected_by_level : undefined}
                      barLabel="Projected employment" animKey={ctrl.animKey} />
                  </Panel>
                </Reveal>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <Reveal i={1}>
                    <KpiTile value={<CountUp value={data.jobs_created} format={fmtSigned} />}
                      label="Jobs created (net)" sub={`${data.headcount.toLocaleString()} total jobs`} />
                  </Reveal>
                  <Reveal i={2} className="col-span-2">
                    <Panel className="h-full" title="Employment by Job Level" live><LevelMixBar levels={data.by_level} /></Panel>
                  </Reveal>
                  <Reveal i={3}>
                    <Panel className="h-full" title="Employment by Region" live><DemographicDonut buckets={data.region} height={140} animKey={ctrl.animKey} /></Panel>
                  </Reveal>
                </div>
              </>
            ) : (
              <>
                <IllustrativeNote />
                <div className="mb-4 grid gap-4 lg:grid-cols-2">
                  <Reveal i={0}>
                    <Panel className="h-full" title="Top Job Categories" live subtitle="Department types by required FTE">
                      <RankList rows={data.job_categories.map((c) => ({ label: c.typeset, value: c.required_fte, sub: `${c.pct}%` }))} valueFmt={(v) => `${v} FTE`} />
                    </Panel>
                  </Reveal>
                  <Reveal i={1}>
                    <Panel className="h-full" title="Top Hiring Need" live subtitle="Where the shortfall to close is largest">
                      <RankList rows={data.top_hiring.map((h) => ({ label: h.name, value: Math.round(h.need), sub: h.code || undefined }))}
                        valueFmt={(v) => `${v} FTE`} accent="#7C3AED" />
                    </Panel>
                  </Reveal>
                  <Reveal i={2}>
                    <Panel className="h-full" title="Roles by Growth" live
                      action={<Segmented size="sm" value={trend} options={[{ value: "growing", label: "Growing" }, { value: "declining", label: "Declining" }]} onChange={(v) => setTrend(v as "growing" | "declining")} />}
                      subtitle="Department types by planning change (forecast − current)">
                      <PctList rows={trendRows} positive={trend === "growing"} />
                    </Panel>
                  </Reveal>
                  <Reveal i={3}>
                    <Panel className="h-full" title="Adjacent & Transition Roles" live={false} subtitle="Common in-demand moves">
                      <ul className="space-y-2">
                        {data.adjacent_jobs.map((a, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-2 text-sm">
                            <span className="truncate text-text1">{a.label}</span>
                            <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-semibold text-text2">{a.value_text}</span>
                          </li>
                        ))}
                      </ul>
                    </Panel>
                  </Reveal>
                </div>

                <Reveal i={4}>
                  <Panel title="Skills in Motion" live={false} subtitle="Growing, declining and breakout skills across the sector">
                    <div className="grid gap-6 sm:grid-cols-3">
                      <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-text3">Top Growing <ProvenanceChip live={false} /></div><PctList rows={data.skills.growing.map((s) => ({ label: s.label, pct: s.pct_change }))} positive /></div>
                      <div><div className="mb-2 text-xs font-semibold uppercase text-text3">Top Declining</div><PctList rows={data.skills.declining.map((s) => ({ label: s.label, pct: s.pct_change }))} positive={false} /></div>
                      <div><div className="mb-2 text-xs font-semibold uppercase text-text3">Top Breakout</div><PctList rows={data.skills.breakout.map((s) => ({ label: s.label, pct: s.pct_change }))} positive /></div>
                    </div>
                  </Panel>
                </Reveal>
              </>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
