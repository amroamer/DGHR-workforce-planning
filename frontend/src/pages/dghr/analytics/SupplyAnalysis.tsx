import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MarketRow } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import {
  Panel, KpiTile, EmploymentChart, DemographicDonut, MiniTreemap, RankTable, Segmented, PageTabs, DashSkeleton,
} from "@/components/shared/dashcharts";
import { CountUp, Reveal } from "@/components/shared/motionkit";
import { useAnalyticsControls, ControlsBar, IllustrativeNote } from "./_controls";

// Illustrative market rows carry their share in `pct_change`; map to donut buckets (slice size = pct).
const toDonut = (rows: MarketRow[]) =>
  rows.map((r) => ({ bucket: r.bucket || r.label, label: r.label, headcount: Math.round((r.pct_change ?? 0) * 10), pct: r.pct_change ?? 0 }));

export function SupplyAnalysis() {
  const ctrl = useAnalyticsControls();
  const [tab, setTab] = useState<"overview" | "graduates">("overview");
  const [view, setView] = useState<"total" | "level">("total");
  const [uni, setUni] = useState<"local" | "global">("local");
  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: ["an-supply", ctrl.entityId, ctrl.basis, ctrl.scenario],
    queryFn: () => api.planning.analyticsSupply(ctrl.basis, ctrl.scenario, ctrl.entityId),
    refetchInterval: 4000,
    placeholderData: keepPreviousData, // filter switches morph in place, no loading flash
  });

  return (
    <>
      <PageHeader title="Supply Analysis"
        subtitle="Projected labour supply from the current workforce, with reference intelligence on the incoming graduate pipeline." />
      <PageBody>
        <ControlsBar ctrl={ctrl} bases={data?.bases} scenarios={data?.scenarios} />
        <div className="mb-5">
          <PageTabs value={tab} options={[{ value: "overview", label: "Overview" }, { value: "graduates", label: "Graduate Analysis" }]} onChange={(v) => setTab(v as "overview" | "graduates")} />
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
                  <Panel className="mb-4" title="Projected Labour Supply" live
                    subtitle={`${data.scope.label}, today's available FTE, eroded by attrition if unbackfilled`}
                    action={<Segmented size="sm" value={view} options={[{ value: "total", label: "Total" }, { value: "level", label: "Job Level" }]} onChange={(v) => setView(v as "total" | "level")} />}>
                    <EmploymentChart data={data.labor_supply.map((p) => ({ year: p.year, employment: p.supply }))}
                      byLevel={view === "level" ? data.labor_supply_by_level : undefined} barLabel="Labour supply" animKey={ctrl.animKey} />
                    {data.assumptions && <p className="mt-1 text-[10px] text-text3">{data.assumptions.supply}</p>}
                  </Panel>
                </Reveal>
                <div className="grid gap-4 md:grid-cols-3">
                  <Reveal i={1}>
                    <Panel className="h-full" title="Graduates" live={false}>
                      <div className="flex flex-col gap-3">
                        <KpiTile value={<CountUp value={data.graduates.new_graduates?.value ?? 0} />} label="New graduates (annual)" />
                        <KpiTile value={<CountUp value={data.graduates.total_graduates?.value ?? 0} />} label="Total graduate pool" />
                      </div>
                    </Panel>
                  </Reveal>
                  <Reveal i={2}>
                    <Panel className="h-full" title="Graduates by Educational Level" live={false}>
                      <DemographicDonut buckets={toDonut(data.education_level)} height={150} />
                    </Panel>
                  </Reveal>
                  <Reveal i={3}>
                    <Panel className="h-full" title="Graduate Destination by Job Level" live subtitle="Where talent lands = the workforce mix">
                      <DemographicDonut buckets={data.destination_by_level.map((d) => ({ bucket: d.key, label: d.label, headcount: d.headcount, pct: d.pct }))} height={150} animKey={ctrl.animKey} />
                    </Panel>
                  </Reveal>
                </div>
              </>
            ) : (
              <>
                <IllustrativeNote>The graduate-market panels below are reference intelligence (universities, majors, hotspots), not collected from entity submissions.</IllustrativeNote>
                <div className="mb-4 grid gap-4 lg:grid-cols-3">
                  <Reveal i={0} className="lg:col-span-2">
                    <Panel className="h-full" title="Graduates by Educational Background" live={false}>
                      <MiniTreemap rows={data.education_background.map((r) => ({ label: r.label, value: r.pct_change ?? 0 }))} />
                    </Panel>
                  </Reveal>
                  <Reveal i={1}>
                    <Panel className="h-full" title="Graduates by Gender" live={false}>
                      <DemographicDonut buckets={toDonut(data.grad_gender)} height={156} />
                    </Panel>
                  </Reveal>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Reveal i={2}>
                    <Panel className="h-full" title="Top 5 University Majors" live={false}>
                      <RankTable head={["#", "Major", "Graduates"]}
                        rows={data.university_majors.map((r, i) => [`#${i + 1}`, r.label, (r.value ?? 0).toLocaleString()])} />
                    </Panel>
                  </Reveal>
                  <Reveal i={3}>
                    <Panel className="h-full" title="Top Universities" live={false}
                      action={<Segmented size="sm" value={uni} options={[{ value: "local", label: "Local" }, { value: "global", label: "Global" }]} onChange={(v) => setUni(v as "local" | "global")} />}>
                      <RankTable head={["#", "University", uni === "local" ? "Emirate" : "Region"]}
                        rows={data.universities[uni].map((r, i) => [`#${i + 1}`, r.label, r.value_text ?? ""])} />
                    </Panel>
                  </Reveal>
                  <Reveal i={4}>
                    <Panel className="h-full" title="Top Global Hotspots" live={false}>
                      <RankTable head={["#", "Hotspot", "Region"]}
                        rows={data.global_hotspots.map((r, i) => [`#${i + 1}`, r.label, r.value_text ?? ""])} />
                    </Panel>
                  </Reveal>
                </div>
              </>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}
