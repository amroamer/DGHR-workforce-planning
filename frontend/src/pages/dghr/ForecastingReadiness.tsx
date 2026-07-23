import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  TrendingUp, Lock, ShieldCheck, Gauge, Quote,
  FileWarning, ClipboardX, TrendingDown, Boxes, AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { VisionBadge } from "@/components/shared/VisionBadge";
import { HBarChart, GroupedBarChart } from "@/components/shared/charts";
import { PaginationFooter } from "@/components/shared/DataTable";

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  missing_evidence: <FileWarning size={15} />, incomplete_workload: <ClipboardX size={15} />,
  future_drivers: <TrendingDown size={15} />, org_issues: <Boxes size={15} />, other: <AlertCircle size={15} />,
};

/** Decorative motif, NOT a sparkline. It used to render an invented 7-point rising series beside
 *  real API-driven FTE figures — identical on every card — which read as those metrics' history.
 *  There is no trend series behind these numbers, so it must not draw one. */
function MiniBars({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-0.5" style={{ height: 28 }} aria-hidden>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} className="w-1.5 rounded-sm" style={{ height: "35%", backgroundColor: color, opacity: 0.18 }} />
      ))}
    </div>
  );
}

// Vision-zone card — always carries the VisionBadge (SPEC §9.5 Zone 2).
function VisionCard({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ""}`}>
      <div className="mb-3 flex items-center justify-between">
        {title ? <h3 className="text-sm font-semibold text-text1">{title}</h3> : <span />}
        <VisionBadge />
      </div>
      {children}
    </Card>
  );
}

export function ForecastingReadiness() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "ready" | "blocked">("all");
  const [page, setPage] = useState(1);
  const { data } = useQuery({
    queryKey: ["readiness", filter, page],
    queryFn: () => api.forecastingReadiness(filter, page),
    refetchInterval: 4000,
  });
  const k = data?.kpis;
  const v = data?.vision_preview;
  const num = (key: string) => v?.metrics[key]?.value_numeric ?? 0;
  // Growth/reduction are reported as signed magnitudes; the split bar compares their sizes.
  const growthAbs = Math.abs(num("growth"));
  const reductionAbs = Math.abs(num("reduction"));
  const growthShare = growthAbs + reductionAbs > 0
    ? Math.round((growthAbs / (growthAbs + reductionAbs)) * 100)
    : 0;

  return (
    <>
      <PageHeader title="Forecasting Readiness" subtitle="Track which entities are ready for forecasting, and preview the planning insights this collection unlocks." />
      <PageBody>
        {/* ───────── ZONE 1 — real ───────── */}
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="green" icon={<TrendingUp size={20} />} value={k?.ready} label="Ready for Forecasting" sublabel={`${k?.ready_pct ?? 0}% of total`} />
          <KpiCard tone="red" icon={<Lock size={18} />} value={k?.blocked} label="Blocked / Not Ready" sublabel={`${k?.blocked_pct ?? 0}% of total`} />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={`${k?.avg_completeness ?? 0}%`} label="Avg. Completeness" sublabel="Across all entities" />
          <KpiCard tone="blue" icon={<Gauge size={20} />} value={k?.avg_quality} label="Avg. Quality Score" sublabel="Across scored entities" />
          <KpiCard tone="blue" ring={k?.readiness_progress ?? 0} label="Readiness Progress" sublabel={`Target: 100% by ${k?.target_date ?? ""}`} />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          <Card className="col-span-8">
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="text-base font-semibold text-text1">Entity Readiness</h3>
              <div className="flex gap-1">
                {(["all", "ready", "blocked"] as const).map((f) => (
                  <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${filter === f ? "bg-primary text-white" : "text-text2 hover:bg-page"}`}>{f}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto p-3">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-border text-[11px] uppercase text-text3">
                  <th className="px-3 py-2.5 font-semibold">Entity</th><th className="px-3 py-2.5 font-semibold">Completeness</th><th className="px-3 py-2.5 text-center font-semibold">Quality</th><th className="px-3 py-2.5 font-semibold">Forecasting</th><th className="px-3 py-2.5 font-semibold">Blocking Reasons</th><th /></tr></thead>
                <tbody>
                  {(data?.entity_readiness.rows ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-page">
                      <td className="px-3 py-2.5"><div className="font-medium text-text1">{r.name}</div><div className="text-[11px] text-text3">{r.code}</div></td>
                      <td className="px-3 py-2.5 w-32"><div className="mb-1 text-xs font-semibold text-text2">{r.completeness}%</div><ProgressBar value={r.completeness} /></td>
                      <td className="px-3 py-2.5 text-center">{r.quality_score != null ? <span className="rounded-md bg-page px-2 py-0.5 text-xs font-semibold text-text1">{r.quality_score}</span> : <span className="text-text3">-</span>}</td>
                      <td className="px-3 py-2.5"><StatusBadge value={r.forecasting_ready ? "approved" : "overdue"} label={r.forecasting_ready ? "Ready" : "Blocked"} /></td>
                      <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{r.blocking_reasons.length ? r.blocking_reasons.map((b) => <span key={b} className="rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger">{b}</span>) : <span className="text-xs text-success">-</span>}</div></td>
                      <td className="px-2"><button onClick={() => navigate(`/dghr/submissions?entity=${r.id}`)} className="text-xs font-semibold text-primary hover:underline">View gaps</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex items-center justify-between px-2 pt-3 text-sm text-text2">
                <PaginationFooter page={data?.entity_readiness.page ?? 1} pageSize={8} total={data?.entity_readiness.total ?? 0} onPage={setPage} unit="entities" />
              </div>
            </div>
          </Card>

          <Card className="col-span-4 p-5">
            <h3 className="mb-3 text-base font-semibold text-text1">What's Blocking Readiness</h3>
            <div className="space-y-2.5">
              {(data?.blockers.items ?? []).map((b) => (
                <div key={b.key} className="flex items-center gap-2 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-page text-text2">{BLOCK_ICONS[b.key]}</span>
                  <span className="flex-1 text-text2">{b.label}</span>
                  <span className="font-semibold text-text1">{b.count}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 border-t border-border pt-3 text-[11px] text-text3">Entities must have minimum data completeness of 80% and pass quality threshold to be forecasting-ready.</p>
          </Card>
        </div>

        {/* ───────── ZONE 2 — Layer-B preview (Illustrative) ───────── */}
        <div className="mt-8 mb-3 flex items-center gap-3">
          <h2 className="text-lg font-bold text-text1">What this unlocks: Workforce Insights</h2>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="grid grid-cols-4 gap-4">
          <VisionCard>
            <div className="flex items-end justify-between"><div><div className="text-2xl font-bold text-text1">{fmt(num("current_workforce"))} <span className="text-sm font-normal text-text3">FTEs</span></div><div className="text-xs font-semibold text-text2">Current Workforce</div></div><MiniBars color="#2563EB" /></div>
          </VisionCard>
          <VisionCard>
            <div className="flex items-end justify-between"><div><div className="text-2xl font-bold text-text1">{fmt(num("forecast_demand"))} <span className="text-sm font-normal text-text3">FTEs</span></div><div className="text-xs font-semibold text-text2">Forecast Demand (FY27)</div></div><MiniBars color="#0D9488" /></div>
          </VisionCard>
          <VisionCard>
            <div><div className="text-2xl font-bold text-text1">{fmt(num("workforce_gaps"))} <span className="text-sm font-normal text-text3">FTEs</span></div><div className="text-xs font-semibold text-text2">Workforce Gaps</div><div className="mt-2 text-[11px] text-text3">{v?.metrics.budget_impact?.value_text}</div></div>
          </VisionCard>
          <VisionCard>
            <div><div className="flex items-baseline gap-2 text-2xl font-bold"><span className="text-success">+{fmt(num("growth"))}</span><span className="text-danger">{fmt(num("reduction"))}</span></div><div className="text-xs font-semibold text-text2">Growth vs Reduction</div>
              {/* Split derived from the two figures above it — hardcoded 78/22 widths contradicted
                  their own labels for any data where growth:reduction wasn't 78:22. */}
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-page">
                <span className="bg-success" style={{ width: `${growthShare}%` }} />
                <span className="bg-danger" style={{ width: `${100 - growthShare}%` }} />
              </div>
            </div>
          </VisionCard>
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          <VisionCard title="Skills Gaps (Top 5)" className="col-span-4">
            {/* No literal max: it was an FTE-unit ceiling that silently clipped any gap above it. */}
            <HBarChart data={(v?.skills ?? []).map((s) => ({ name: s.skill, value: s.gap_fte }))} height={200}
              max={Math.max(1, ...(v?.skills ?? []).map((s) => s.gap_fte))} />
          </VisionCard>
          <VisionCard title="Scenario Comparison" className="col-span-5">
            <GroupedBarChart
              height={220}
              data={[
                { group: "Headcount", baseline: num("forecast_demand"), high_growth: v?.scenarios[1]?.headcount ?? 0, efficiency: v?.scenarios[2]?.headcount ?? 0 },
                { group: "Cost (AED M)", baseline: (v?.scenarios[0]?.cost_aed_b ?? 0) * 1000, high_growth: (v?.scenarios[1]?.cost_aed_b ?? 0) * 1000, efficiency: (v?.scenarios[2]?.cost_aed_b ?? 0) * 1000 },
                { group: "Gaps", baseline: v?.scenarios[0]?.gaps ?? 0, high_growth: v?.scenarios[1]?.gaps ?? 0, efficiency: v?.scenarios[2]?.gaps ?? 0 },
              ]}
              series={[
                { key: "baseline", name: "Baseline", color: "#2563EB" },
                { key: "high_growth", name: "High growth", color: "#0D9488" },
                { key: "efficiency", name: "Efficiency", color: "#CBD5E1" },
              ]}
            />
          </VisionCard>
          <VisionCard title="AI-Generated Insights" className="col-span-3">
            <div className="space-y-2.5">
              {(v?.quotes ?? []).slice(0, 4).map((q, i) => (
                <div key={i} className="rounded-lg bg-teal-bg/50 p-2.5"><Quote size={13} className="mb-1 text-teal" /><p className="text-xs italic text-text2">{q.body}</p></div>
              ))}
            </div>
          </VisionCard>
        </div>

        {/* factory close */}
        <div className="mt-6 rounded-card border border-teal/30 bg-teal-bg/40 p-6">
          <p className="text-lg font-semibold text-text1">
            The proposed platform is <span className="text-teal">not a template automation tool</span>. It is a workforce planning factory that combines structured data collection, standardized methodology, wave-based delivery, guided diagnostics, AI-assisted analysis, calculation models, dashboards, and governance workflows.
          </p>
          <p className="mt-2 text-sm text-text2">Preview of the platform's planning layer, powered by the data being collected today.</p>
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={() => navigate("/dghr/submissions")}>Open Tracker</Button>
            <Button variant="secondary" onClick={() => toast.message("Available in the full release")}>View readiness rules</Button>
          </div>
        </div>
      </PageBody>
    </>
  );
}
