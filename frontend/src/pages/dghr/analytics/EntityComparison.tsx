import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BasisKey, CmpEntity, CmpMetric } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Panel, LevelMixBar, RankList, Select, DashSkeleton, catColor } from "@/components/shared/dashcharts";
import { GroupedBarChart } from "@/components/shared/charts";
import { Reveal } from "@/components/shared/motionkit";
import { EntityLogo } from "@/components/shared/EntityLogo";

const MAX = 5;

/** The winning entity id for a metric, or null when the metric has no "better" direction. */
function leaderId(metric: CmpMetric): string | null {
  if (metric.higher_is_better == null) return null;
  const entries = Object.entries(metric.values).filter(([, v]) => v.value != null);
  if (!entries.length) return null;
  entries.sort((a, b) => (b[1].value as number) - (a[1].value as number)); // highest value first
  return (metric.higher_is_better ? entries[0] : entries[entries.length - 1])[0];
}

export function EntityComparison() {
  const [selected, setSelected] = useState<number[]>([]);
  const [basis, setBasis] = useState<BasisKey>("received");
  const { data: entities } = useQuery({ queryKey: ["entities-list"], queryFn: () => api.entitiesList() });

  // Preselect the first three entities once the list arrives, so the page opens on a real comparison.
  useEffect(() => {
    if (entities && entities.length && selected.length === 0) {
      setSelected(entities.slice(0, Math.min(3, entities.length)).map((e) => e.id));
    }
  }, [entities, selected.length]);

  const toggle = (id: number) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX ? prev : [...prev, id]);

  const { data, isPending, isPlaceholderData } = useQuery({
    queryKey: ["an-cmp", selected, basis],
    queryFn: () => api.planning.analyticsEntityComparison(selected, basis),
    enabled: selected.length >= 2,
    refetchInterval: 4000,
    placeholderData: keepPreviousData,
  });

  // Stable colour per compared entity, by its position in the payload (= selection order).
  const colorOf = useMemo(() => {
    const map = new Map<number, string>();
    data?.entities.forEach((e, i) => map.set(e.id, catColor(i)));
    return (id: number) => map.get(id) ?? catColor(0);
  }, [data]);

  const csvUrl = api.planning.entityComparisonCsvUrl(selected, basis);

  return (
    <>
      <PageHeader title="Entity Comparison"
        subtitle="Benchmark up to five entities side by side on workforce-structure ratios, computed live from establishment and submitted data." />
      <PageBody>
        {/* Controls: entity multi-picker (max 5) + basis + CSV export */}
        <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border/70 bg-page/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7">
          <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-text3">
              <Scale size={13} /> Entities to compare
              <span className="rounded-full bg-card px-1.5 py-0.5 text-text2">{selected.length}/{MAX}</span>
            </div>
            <div className="flex items-end gap-3">
              <Select label="Basis" value={basis}
                options={(data?.bases ?? [{ key: "received" as BasisKey, label: "All received submissions" }]).map((b) => ({ value: b.key, label: b.label }))}
                onChange={(v) => setBasis(v as BasisKey)} />
              <a href={csvUrl}
                className={cn("inline-flex h-9 items-center gap-1.5 self-end rounded-btn border border-border bg-card px-3 text-sm font-semibold text-text1 hover:bg-page",
                  selected.length < 2 && "pointer-events-none opacity-40")}>
                <Download size={14} /> CSV
              </a>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(entities ?? []).map((e) => {
              const on = selected.includes(e.id);
              const disabled = !on && selected.length >= MAX;
              return (
                <button key={e.id} onClick={() => toggle(e.id)} disabled={disabled}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                    on ? "border-primary bg-primary/10 text-primary"
                      : disabled ? "cursor-not-allowed border-border/60 text-text3 opacity-50"
                        : "border-border bg-card text-text2 hover:border-primary/50 hover:text-text1")}>
                  <EntityLogo name={e.name} code={e.code} src={e.logo_url ?? undefined} size={16} rounded="full" />
                  {e.code}
                </button>
              );
            })}
          </div>
        </div>

        {selected.length < 2 ? (
          <Panel><div className="py-10 text-center text-sm text-text3">Select at least two entities above to compare.</div></Panel>
        ) : !data && isPending ? (
          <DashSkeleton hero />
        ) : !data || !data.entities.length ? (
          <Panel><div className="py-10 text-center text-sm text-text3">No data for the selected entities.</div></Panel>
        ) : (
          <div className={cn("transition-opacity duration-300", isPlaceholderData && "opacity-60")}>
            {/* 1 — the ratio matrix: every metric × entity, leader highlighted where a direction exists */}
            <Reveal i={0}>
              <Panel className="mb-4" title="Descriptive ratios" live
                subtitle="Structural and workforce ratios across the selected entities. A leader is marked only where one direction is better.">
                <ComparisonMatrix data={data} colorOf={colorOf} />
              </Panel>
            </Reveal>

            {/* 2 — support vs core composition + support-to-core ranking */}
            <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <Reveal i={1}>
                <Panel className="h-full" title="Corporate-support vs core" live
                  subtitle="Share of establishment FTE in corporate-support functions (corporate services + IT) vs core service delivery.">
                  <div className="space-y-4">
                    {data.entities.map((e) => (
                      <div key={e.id}>
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-text1">
                          <EntityLogo name={e.name} code={e.code} src={e.logo_url ?? undefined} size={18} rounded="md" />
                          {e.name}
                          <span className="ml-auto tabular-nums text-text3">{Math.round(e.structure.establishment_fte).toLocaleString()} FTE</span>
                        </div>
                        <LevelMixBar levels={e.structure.by_category.map((c) => ({ key: c.category, label: c.label, pct: c.pct }))} />
                      </div>
                    ))}
                  </div>
                </Panel>
              </Reveal>
              <Reveal i={2}>
                <Panel className="h-full" title="Support-to-core ratio" live
                  subtitle="Corporate-support FTE per unit of core FTE.">
                  <RankList
                    rows={data.entities.map((e) => {
                      const v = data.metrics.find((m) => m.key === "support_to_core")?.values[String(e.id)];
                      return { label: e.code, value: v?.value ?? 0, sub: v?.display };
                    })}
                    valueFmt={(v) => `${v.toFixed(2)}×`} />
                </Panel>
              </Reveal>
            </div>

            {/* 3 — corporate services vs IT split */}
            <Reveal i={3}>
              <Panel className="mb-4" title="Corporate-support composition (FTE)" live
                subtitle="Establishment FTE in corporate services (HR / finance / procurement / facilities) vs IT.">
                <GroupedBarChart
                  data={data.entities.map((e) => ({ group: e.code, corporate: e.structure.corporate_fte, it: e.structure.it_fte }))}
                  series={[
                    { key: "corporate", name: "Corporate services", color: catColor(0) },
                    { key: "it", name: "IT (digital)", color: catColor(1) },
                  ]}
                  height={260} />
              </Panel>
            </Reveal>

            {/* 4 — workforce level mix per entity */}
            <Reveal i={4}>
              <Panel title="Workforce level mix" live
                subtitle="Managers · professionals · associate professionals · clerical support, as a share of each entity's submitted workforce.">
                <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
                  {data.entities.map((e) => (
                    <div key={e.id}>
                      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-text1">
                        <EntityLogo name={e.name} code={e.code} src={e.logo_url ?? undefined} size={18} rounded="md" />
                        {e.name}
                      </div>
                      {e.has_workforce_data ? (
                        <LevelMixBar levels={e.level_mix} />
                      ) : (
                        <div className="rounded-btn bg-page px-3 py-4 text-center text-xs text-text3">
                          No submitted workforce data at this basis.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Panel>
            </Reveal>
          </div>
        )}
      </PageBody>
    </>
  );
}

// ─────────────── the ratio matrix (metrics × entities, grouped, leader-highlighted) ───────────────
function ComparisonMatrix({ data, colorOf }: {
  data: { entities: CmpEntity[]; metrics: CmpMetric[]; metric_groups: string[] };
  colorOf: (id: number) => string;
}) {
  const { entities, metrics, metric_groups } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text3">Metric</th>
            {entities.map((e) => (
              <th key={e.id} className="border-t-2 px-2 py-2 text-center align-bottom" style={{ borderTopColor: colorOf(e.id) }}>
                <div className="flex flex-col items-center gap-1">
                  <EntityLogo name={e.name} code={e.code} src={e.logo_url ?? undefined} size={22} rounded="md" />
                  <span className="text-xs font-semibold text-text1">{e.code}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metric_groups.map((group) => {
            const rows = metrics.filter((m) => m.group === group);
            if (!rows.length) return null;
            return (
              <GroupRows key={group} group={group} rows={rows} entities={entities} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({ group, rows, entities }: { group: string; rows: CmpMetric[]; entities: CmpEntity[] }) {
  return (
    <>
      <tr>
        <td colSpan={entities.length + 1}
          className="sticky left-0 bg-page px-2 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wide text-text2">
          {group}
        </td>
      </tr>
      {rows.map((metric) => {
        const leader = leaderId(metric);
        return (
          <tr key={metric.key} className="border-t border-border/60">
            <td className="sticky left-0 z-10 bg-card px-2 py-2.5 text-left">
              <div className="font-medium text-text1" title={metric.description}>{metric.label}</div>
              <div className="text-[11px] text-text3">
                {metric.unit}
                {metric.benchmark != null && <span className="ml-1.5">· target {metric.benchmark}</span>}
              </div>
            </td>
            {entities.map((e) => {
              const v = metric.values[String(e.id)];
              const isLeader = leader != null && leader === String(e.id) && v?.value != null;
              return (
                <td key={e.id} className="px-2 py-2.5 text-center tabular-nums">
                  <span className={cn("inline-block rounded px-1.5 py-0.5",
                    isLeader ? "bg-success-bg font-bold text-success" : "text-text1")}>
                    {v?.display ?? "—"}
                  </span>
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}
