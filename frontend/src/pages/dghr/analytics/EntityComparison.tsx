import { Fragment, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, BadgeCheck, Building2, Download, Info, Scale, Users,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BasisKey, CmpInsight, CmpMetric, EntityComparisonPayload } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Panel, LevelMixBar, Select, DashSkeleton, catColor } from "@/components/shared/dashcharts";
import { Reveal } from "@/components/shared/motionkit";
import { EntityLogo } from "@/components/shared/EntityLogo";
import { useChartTheme, type ChartColors } from "@/lib/useChartTheme";

const MAX = 5;

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((ch) => ch + ch).join("") : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const INSIGHT_ICON: Record<string, LucideIcon> = {
  management_pct: Users, support_to_core: Scale, establishment_fte: Building2, emiratization_pct: BadgeCheck,
};

export function EntityComparison() {
  const [selected, setSelected] = useState<number[]>([]);
  const [basis, setBasis] = useState<BasisKey>("received");
  const { data: entities } = useQuery({ queryKey: ["entities-list"], queryFn: () => api.entitiesList() });
  const { data: gov } = useQuery({ queryKey: ["dghr-entities"], queryFn: () => api.planning.dghrEntities() });

  const receivedById = useMemo(() => {
    const m = new Map<number, number>();
    gov?.entities.forEach((e) => m.set(e.entity_id, e.received));
    return m;
  }, [gov]);

  // Smart default: preselect the entities that actually have submitted data (most-received first), so
  // the page never opens on a wall of "-". Falls back to the first few if nothing has been received.
  useEffect(() => {
    if (entities?.length && gov && selected.length === 0) {
      const ranked = [...entities].sort((a, b) => (receivedById.get(b.id) ?? 0) - (receivedById.get(a.id) ?? 0));
      const withData = ranked.filter((e) => (receivedById.get(e.id) ?? 0) > 0);
      setSelected((withData.length >= 2 ? withData : ranked).slice(0, 3).map((e) => e.id));
    }
  }, [entities, gov, receivedById, selected.length]);

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

  const colorOf = useMemo(() => {
    const map = new Map<number, string>();
    data?.entities.forEach((e, i) => map.set(e.id, catColor(i)));
    return (id: number) => map.get(id) ?? catColor(0);
  }, [data]);

  const csvUrl = api.planning.entityComparisonCsvUrl(selected, basis);
  const emptySelected = data?.entities.filter((e) => !e.has_workforce_data) ?? [];

  return (
    <>
      <PageHeader title="Entity Comparison"
        subtitle="Benchmark up to five entities side by side on workforce-structure ratios, each cell coloured against the peer average, computed live from establishment and submitted data." />
      <PageBody>
        {/* Controls: entity multi-picker (max 5, data-aware) + basis + CSV export */}
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
              const noData = (receivedById.get(e.id) ?? 0) === 0;
              return (
                <button key={e.id} onClick={() => toggle(e.id)} disabled={disabled}
                  title={noData ? "No submissions yet, structural ratios only" : undefined}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
                    on ? "border-primary bg-primary/10 text-primary"
                      : disabled ? "cursor-not-allowed border-border/60 text-text3 opacity-50"
                        : noData ? "border-dashed border-border text-text3 hover:text-text2"
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
            {/* Headline insights — the "so what" a bare grid can't surface */}
            {data.insights.length > 0 && (
              <Reveal i={0}>
                <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {data.insights.map((ins, i) => <InsightCard key={i} ins={ins} />)}
                </div>
              </Reveal>
            )}

            {/* Empty-entity note */}
            {emptySelected.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-btn border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-text2">
                <Info size={14} className="mt-0.5 shrink-0 text-warning" />
                <span>
                  <b className="text-text1">{emptySelected.map((e) => e.code).join(", ")}</b>{" "}
                  {emptySelected.length > 1 ? "have" : "has"} no submitted workforce data at this basis. Structural ratios still show, but workforce-mix and people rows read “-”. Switch basis or pick entities that have submitted.
                </span>
              </div>
            )}

            {/* The heatmap: every metric × entity, coloured vs the peer average */}
            <Reveal i={1}>
              <Panel className="mb-4" title="Descriptive ratios" live
                subtitle="Each cell is shaded against the all-entity average, green/red where a direction is better, blue by magnitude where it isn’t. Arrows mark above/below average.">
                <Heatmap data={data} colorOf={colorOf} />
              </Panel>
            </Reveal>

            {/* Workforce level mix — the 4-part composition the ratios can't fully show */}
            <Reveal i={2}>
              <Panel title="Workforce level mix" live
                subtitle="Managers · professionals · associate professionals · clerical support, as a share of each entity’s submitted workforce.">
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

// ─────────────── headline insight card ───────────────
function InsightCard({ ins }: { ins: CmpInsight }) {
  const Icon = INSIGHT_ICON[ins.metric_key] ?? Scale;
  return (
    <div className="rounded-card border border-border bg-card p-3.5 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text3">
        <Icon size={13} className="text-primary" /> {ins.title}
      </div>
      <div className="flex items-center gap-2">
        <EntityLogo name={ins.entity_name} code={ins.entity_code} src={ins.logo_url ?? undefined} size={24} rounded="md" />
        <div className="truncate text-sm font-semibold text-text1">{ins.entity_code}</div>
        <div className="nums ml-auto text-lg font-bold text-text1">{ins.display}</div>
      </div>
      <div className="mt-1 truncate text-[11px] text-text3">{ins.metric_label}</div>
    </div>
  );
}

// ─────────────── heatmap (metrics × entities, coloured vs peer average) ───────────────
function heatBg(metric: CmpMetric, value: number | null, meta: { lo: number; hi: number; maxDev: number }, c: ChartColors): string | undefined {
  if (value == null) return undefined;
  const avg = metric.average.value;
  if (metric.higher_is_better == null) {
    // Neutral metric → sequential intensity by magnitude within the row (darkest = highest).
    const t = meta.hi > meta.lo ? (value - meta.lo) / (meta.hi - meta.lo) : 0;
    return hexToRgba(c.primary, 0.10 + 0.42 * t);
  }
  if (avg == null) return undefined;
  const better = metric.higher_is_better ? value >= avg : value <= avg;
  const t = Math.min(1, Math.abs(value - avg) / meta.maxDev);
  return hexToRgba(better ? c.success : c.danger, 0.10 + 0.5 * t);
}

function Heatmap({ data, colorOf }: { data: EntityComparisonPayload; colorOf: (id: number) => string }) {
  const c = useChartTheme();
  const { entities, metrics, metric_groups } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text3">Metric</th>
            <th className="border-b border-border px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-text3">Peer avg</th>
            {entities.map((e) => (
              <th key={e.id} className="border-t-2 px-2 py-2 text-center align-bottom" style={{ borderTopColor: colorOf(e.id) }}>
                <div className="flex flex-col items-center gap-1">
                  <EntityLogo name={e.name} code={e.code} src={e.logo_url ?? undefined} size={22} rounded="md" />
                  <span className="text-xs font-semibold text-text1">{e.code}</span>
                  {!e.has_workforce_data && <span className="rounded-full bg-page px-1.5 text-[9px] font-semibold text-text3">no data</span>}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metric_groups.map((group) => {
            const rows = metrics.filter((met) => met.group === group);
            if (!rows.length) return null;
            return (
              <Fragment key={group}>
                <tr>
                  <td colSpan={entities.length + 2}
                    className="sticky left-0 bg-page px-2 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-wide text-text2">
                    {group}
                  </td>
                </tr>
                {rows.map((metric) => {
                  const nums = entities
                    .map((e) => metric.values[String(e.id)]?.value)
                    .filter((v): v is number => v != null);
                  const avg = metric.average.value;
                  const meta = {
                    lo: nums.length ? Math.min(...nums) : 0,
                    hi: nums.length ? Math.max(...nums) : 0,
                    maxDev: avg != null && nums.length ? Math.max(...nums.map((v) => Math.abs(v - avg)), 1e-9) : 1,
                  };
                  return (
                    <tr key={metric.key} className="border-t border-border/60">
                      <td className="sticky left-0 z-10 bg-card px-2 py-2.5 text-left">
                        <div className="font-medium text-text1" title={metric.description}>{metric.label}</div>
                        <div className="text-[11px] text-text3">{metric.unit}</div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span className="nums rounded bg-page px-1.5 py-0.5 text-xs text-text3">{metric.average.display}</span>
                      </td>
                      {entities.map((e) => {
                        const v = metric.values[String(e.id)];
                        const val = v?.value ?? null;
                        const bg = heatBg(metric, val, meta, c);
                        const directional = metric.higher_is_better != null && val != null && avg != null;
                        const up = directional && (val as number) >= avg!;
                        return (
                          <td key={e.id} className="px-2 py-2.5 text-center" style={{ background: bg }}>
                            <span className="nums inline-flex items-center justify-center gap-0.5 font-semibold text-text1">
                              {directional && (up ? <ArrowUp size={11} className="opacity-70" /> : <ArrowDown size={11} className="opacity-70" />)}
                              {v?.display ?? "-"}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
