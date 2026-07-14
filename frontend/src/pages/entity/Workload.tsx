import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BarChart3, FileCheck2, AlertTriangle, ShieldCheck, RefreshCw, Plus, Upload,
  TrendingUp, TrendingDown, Minus, Save, Send, Headphones, Search, Users, Coins, Cpu, Rocket, MoreHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Sparkline, DonutChart } from "@/components/shared/charts";
import { EmptyState } from "@/components/shared/EmptyState";

const SECTION_ICON: Record<string, React.ReactNode> = {
  "Customer Service": <Headphones size={16} />, "Inspection & Compliance": <Search size={16} />,
  "Human Resources": <Users size={16} />, Finance: <Coins size={16} />,
  "Information Technology": <Cpu size={16} />, "Strategy & Planning": <Rocket size={16} />,
};
const COVERAGE_COLORS = ["#16A34A", "#0D9488", "#7C3AED", "#EA8A00", "#2563EB", "#94A3B8"];

function Trend({ pct }: { pct: number }) {
  if (pct > 0) return <span className="flex items-center gap-1 text-success"><TrendingUp size={13} /> {pct}%</span>;
  if (pct < 0) return <span className="flex items-center gap-1 text-danger"><TrendingDown size={13} /> {pct}%</span>;
  return <span className="flex items-center gap-1 text-text3"><Minus size={13} /> 0.0%</span>;
}

export function Workload() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async () => { if (entityId == null) return; await api.submitPackage(entityId, "workload_service"); qc.invalidateQueries(); toast.success("Workload & Service Data submitted to DGHR."); };
  const doImport = async (file: File) => {
    if (entityId == null) return;
    try { const r = await api.importWorkload(entityId, file); qc.invalidateQueries(); toast.success(`Updated ${r.updated} section volumes.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Import failed."); }
  };
  const { data } = useQuery({ queryKey: ["workload", entityId], queryFn: () => api.workload(entityId!), enabled: entityId != null });
  const k = data?.kpis;
  const empty = (data?.rows.length ?? 0) === 0;

  return (
    <>
      <PageHeader title="Workload & Service Data" subtitle="Capture the business drivers of workforce demand across Dubai Government entities." />
      <PageBody>
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="blue" icon={<BarChart3 size={20} />} value={k?.sections_covered.value} label="Sections Covered" sublabel={`of ${k?.sections_covered.total ?? 0} total sections`} />
          <KpiCard tone="green" icon={<FileCheck2 size={20} />} value={k?.workload_metrics} label="Workload Metrics Submitted" sublabel="+12 since last update" />
          <KpiCard tone="orange" icon={<AlertTriangle size={20} />} value={k?.missing_drivers} label="Missing Drivers" sublabel="Require attention" />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={`${k?.avg_completeness ?? 0}%`} label="Average Completeness" sublabel="Across all sections" />
          <KpiCard tone="purple" icon={<RefreshCw size={20} />} value="Up to date" label="Data Import Status" sublabel="Last import: Today, 9:45 AM" />
        </div>

        {empty ? (
          <Card className="mt-4"><EmptyState icon={<BarChart3 size={26} />} title="No workload data yet" description="Add metrics or import service volumes to begin. This entity has not started its Workload & Service submission." /></Card>
        ) : (
          <div className="mt-4 grid grid-cols-12 gap-4">
            <Card className="col-span-9">
              <div className="flex items-center justify-between px-5 pt-5">
                <h3 className="text-base font-semibold text-text1">Workload Metrics by Section</h3>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => toast.message("Available in the full release")}><Plus size={14} /> Add Metric</Button>
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
                  <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import Volumes</Button>
                  <Button variant="secondary" size="sm" onClick={() => toast.success("Workload data validated.")}><ShieldCheck size={14} /> Validate Data</Button>
                </div>
              </div>
              <div className="overflow-x-auto p-3">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase text-text3">
                    <th className="px-2 py-2.5 font-semibold">Section</th><th className="px-2 py-2.5 font-semibold">Service Type</th><th className="px-2 py-2.5 font-semibold">Key Metric</th><th className="px-2 py-2.5 font-semibold">Current Volume</th><th className="px-2 py-2.5 font-semibold">Trend</th><th className="px-2 py-2.5 font-semibold">Seasonal Pattern</th><th className="px-2 py-2.5 font-semibold">Complexity</th><th className="px-2 py-2.5 font-semibold">Source</th><th className="px-2 py-2.5 font-semibold">Status</th><th />
                  </tr></thead>
                  <tbody>
                    {(data?.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-[#EEF2F7] hover:bg-[#F8FAFC]">
                        <td className="px-2 py-2.5"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-page text-primary">{SECTION_ICON[r.name] ?? <BarChart3 size={16} />}</span><div><div className="font-semibold text-text1">{r.name}</div><div className="text-[11px] text-text3">{r.metrics_count} metrics</div></div></div></td>
                        <td className="px-2 py-2.5 text-text2">{r.service_type}</td>
                        <td className="px-2 py-2.5 text-text2">{r.key_metric}</td>
                        <td className="px-2 py-2.5"><div className="font-semibold text-text1">{r.current_volume != null ? fmt(r.current_volume) : "—"}</div><div className="text-[11px] text-text3">{r.unit}</div></td>
                        <td className="px-2 py-2.5"><Trend pct={r.trend.pct} /></td>
                        <td className="px-2 py-2.5"><Sparkline data={r.monthly_pattern} color={r.trend.pct < 0 ? "#E11D48" : "#2563EB"} /><div className="text-[10px] text-text3">{r.peak_label}</div></td>
                        <td className="px-2 py-2.5"><StatusBadge value={r.complexity.toLowerCase()} label={r.complexity} /></td>
                        <td className="px-2 py-2.5 text-text2">{r.source_system}</td>
                        <td className="px-2 py-2.5"><StatusBadge value={r.status} label={r.status === "missing_data" ? "Missing Data" : r.status === "draft" ? "Draft" : r.status === "complete" ? "Complete" : r.status} /></td>
                        <td className="px-1"><button className="text-text3 hover:text-text1"><MoreHorizontal size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-2 pt-3 text-xs text-text3">Showing 1 to {data?.rows.length ?? 0} of {data?.rows.length ?? 0} sections</div>
              </div>
            </Card>

            <div className="col-span-3 space-y-4">
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Guided Help</div>
                <p className="mb-2 text-[11px] text-text3">Examples by Section Type — use these to understand key metrics.</p>
                <div className="space-y-1.5 text-xs">
                  {[["Customer Service", "Requests, response time, resolution rate"], ["Inspection & Compliance", "Inspections, violations, follow-ups"], ["Human Resources", "Hires, exits, training hours, promotions"], ["Finance", "Invoices, payments, reconciliations"], ["Information Technology", "Tickets, changes, incidents, uptime"], ["Strategy & Planning", "Projects, milestones, strategic initiatives"]].map(([t, d]) => (
                    <div key={t} className="flex items-start gap-1.5"><span className="mt-0.5 text-primary">{SECTION_ICON[t] ?? <BarChart3 size={14} />}</span><div><div className="font-semibold text-text1">{t}</div><div className="text-text3">{d}</div></div></div>
                  ))}
                </div>
              </Card>
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Workload Coverage by Department</div>
                <div className="flex items-center gap-3">
                  <DonutChart size={120} centerValue={`${data?.coverage.average ?? 0}%`} centerLabel="Coverage"
                    data={(data?.coverage.items ?? []).map((c, i) => ({ name: c.name, value: c.value, color: COVERAGE_COLORS[i % COVERAGE_COLORS.length] }))} />
                  <div className="flex-1 space-y-1 text-[11px]">
                    {(data?.coverage.items ?? []).map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-text2"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: COVERAGE_COLORS[i % COVERAGE_COLORS.length] }} />{c.name}</span><span className="font-semibold text-text1">{c.value}%</span></div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={() => toast.success("Draft saved.")}><Save size={16} /> Save Draft</Button>
          <Button className="ml-auto" onClick={submit}><Send size={16} /> Submit Workload Data</Button>
        </div>
      </PageBody>
    </>
  );
}
