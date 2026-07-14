import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2, FileCheck2, AlertTriangle, ShieldCheck, Clock,
  Network, Users, BarChart3, TrendingUp, FileText,
  AlertCircle, Info, Send, Flag, UserCheck, ChevronRight, Lock, MoreHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmt } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/shared/KpiCard";
import { DonutChart, TrendLine } from "@/components/shared/charts";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { EntityDrawer } from "@/components/shared/EntityDrawer";
import type { ActionQueueItem } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  not_started: "#94A3B8", in_progress: "#2563EB", submitted: "#16A34A",
  under_review: "#7C3AED", returned: "#EA8A00", approved: "#0D9488",
};
const MISSING_ICONS: Record<string, React.ReactNode> = {
  org_structure: <Network size={18} />, workforce_baseline: <Users size={18} />,
  workload_data: <BarChart3 size={18} />, future_drivers: <TrendingUp size={18} />,
  evidence: <FileText size={18} />,
};
const ALERT_ICON = { danger: <AlertCircle size={18} />, warning: <AlertTriangle size={18} />, info: <Info size={18} /> };
const ALERT_TONE = { danger: "#E11D48", warning: "#EA8A00", info: "#0EA5E9" };

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-5">
        <h3 className="text-base font-semibold text-text1">{title}</h3>
        {action}
      </div>
      <div className="flex-1 p-5">{children}</div>
    </Card>
  );
}

const ViewLink = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button onClick={onClick} className="text-xs font-semibold text-primary hover:underline">{label} →</button>
);

export function CommandCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [drawerId, setDrawerId] = useState<number | null>(null);
  const { data } = useQuery({
    queryKey: ["command-center"],
    queryFn: () => api.commandCenter(1, 5),
    refetchInterval: 4000,
  });

  const approveReady = async () => {
    const r = await api.approve({ ready: true });
    qc.invalidateQueries();
    toast.success(`Approved ${r.approved} validation-ready entities.`);
  };
  const sendReminders = async () => {
    const ids = (data?.actions_queue.items ?? []).map((x) => x.id);
    await api.remind(ids);
    qc.invalidateQueries();
    toast.success(`Reminders sent to ${ids.length} entities.`);
  };

  const nextAction = (row: ActionQueueItem) => {
    if (row.next_action === "Send Reminder") toast.success(`Reminder sent to ${row.name}.`);
    else if (row.next_action === "Review & Return") navigate(`/dghr/clarifications?entity=${row.id}`);
    else if (row.next_action === "Escalate") toast.message(`${row.name} escalated to senior review.`);
    else navigate("/dghr/submissions");
  };

  const k = data?.kpis;

  return (
    <>
      <PageHeader
        title="DGHR Data Collection Command Center"
        subtitle="Track, monitor, and accelerate data collection across Dubai Government entities."
      />
      <PageBody>
        {/* KPI row */}
        <div className="grid grid-cols-6 gap-4">
          <KpiCard tone="blue" icon={<Building2 size={20} />} value={k?.total_entities} label="Total Entities" sublabel="Across Dubai Government" />
          <KpiCard tone="green" icon={<FileCheck2 size={20} />} value={k?.submissions_received.value} label="Submissions Received" sublabel={`${k?.submissions_received.pct ?? 0}% of total entities`} />
          <KpiCard tone="orange" icon={<AlertTriangle size={20} />} value={k?.missing_data} label="Entities with Missing Data" sublabel="Require attention" />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={k?.validation_ready} label="Validation-Ready" sublabel="Ready for review" />
          <KpiCard tone="red" icon={<Clock size={20} />} value={k?.overdue_items} label="Overdue Items" sublabel="Past due date" />
          <KpiCard
            tone="blue"
            ring={k?.overall_progress.pct ?? 0}
            label="Overall Collection Progress"
            sublabel={`${k?.overall_progress.received ?? 0} of ${k?.overall_progress.total ?? 0} entities`}
            link={{ text: "View progress", onClick: () => navigate("/dghr/forecasting-readiness") }}
          />
        </div>

        {/* Row 2 */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* donut */}
          <div className="col-span-4">
            <SectionCard title="Entities by Submission Status">
              <div className="flex items-center gap-4">
                <DonutChart
                  size={168}
                  centerValue={fmt(data?.status_donut.total ?? 0)}
                  centerLabel="Total"
                  data={(data?.status_donut.segments ?? []).map((s) => ({
                    name: s.label, value: s.count, color: STATUS_COLORS[s.status] ?? "#CBD5E1",
                  }))}
                />
                <div className="flex-1 space-y-1.5">
                  {(data?.status_donut.segments ?? []).map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-text2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[s.status] }} />
                        {s.label}
                      </span>
                      <span className="text-text2"><b className="text-text1">{s.count}</b> · {s.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-3 border-t border-border pt-2 text-[11px] text-text3">
                Note: Percentages are out of total entities and may overlap across statuses.
              </p>
            </SectionCard>
          </div>

          {/* actions queue */}
          <div className="col-span-5">
            <SectionCard title="Entities Requiring Action (Prioritized)" action={<ViewLink label="View all" onClick={() => navigate("/dghr/submissions")} />}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#EEF2F7] text-[11px] uppercase text-text3">
                    <th className="pb-2 font-semibold">Entity Name</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">Completeness</th>
                    <th className="pb-2 text-center font-semibold">Quality</th>
                    <th className="pb-2 font-semibold">Due Date</th>
                    <th className="pb-2 font-semibold">Next Action</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {(data?.actions_queue.items ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-[#EEF2F7] last:border-0">
                      <td className="py-2.5 font-medium text-text1">{r.name}</td>
                      <td><StatusBadge value={r.overdue ? "overdue" : r.status} /></td>
                      <td className="w-28"><ProgressBar value={r.completeness} showValue /></td>
                      <td className="text-center">
                        {r.quality_score != null ? (
                          <span className="inline-block rounded-md bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">{r.quality_score}</span>
                        ) : <span className="text-text3">—</span>}
                      </td>
                      <td className={r.overdue ? "text-danger" : "text-text2"}>{r.due_date ?? "—"}</td>
                      <td><button onClick={() => nextAction(r)} className="text-xs font-semibold text-primary hover:underline">{r.next_action}</button></td>
                      <td><button onClick={() => setDrawerId(r.id)} className="text-text3 hover:text-text1"><MoreHorizontal size={16} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 text-xs text-text3">Showing 1 to {data?.actions_queue.items.length ?? 0} of {data?.actions_queue.total ?? 0} entities</div>
            </SectionCard>
          </div>

          {/* readiness */}
          <div className="col-span-3">
            <SectionCard title="Data Readiness for Forecasting" action={<ViewLink label="View all" onClick={() => navigate("/dghr/forecasting-readiness")} />}>
              <button onClick={() => navigate("/dghr/forecasting-readiness")} className="flex w-full items-center gap-3 rounded-card border border-success/30 bg-success-bg/50 p-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-white"><TrendingUp size={18} /></span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-text2">Ready for Forecasting</div>
                  <div className="text-lg font-bold text-text1">{data?.forecasting.ready ?? 0} Entities</div>
                  <div className="text-xs text-text3">{data?.forecasting.ready_pct ?? 0}% of total</div>
                </div>
                <ChevronRight size={18} className="text-text3" />
              </button>
              <button onClick={() => navigate("/dghr/forecasting-readiness")} className="mt-3 flex w-full items-center gap-3 rounded-card border border-danger/30 bg-danger-bg/50 p-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-danger text-white"><Lock size={16} /></span>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-text2">Blocked / Not Ready</div>
                  <div className="text-lg font-bold text-text1">{data?.forecasting.blocked ?? 0} Entities</div>
                  <div className="text-xs text-text3">{data?.forecasting.blocked_pct ?? 0}% of total</div>
                </div>
                <ChevronRight size={18} className="text-text3" />
              </button>
              <p className="mt-3 text-[11px] text-text3">
                Entities must have minimum data completeness of 80% and pass quality threshold to be forecasting-ready.
              </p>
            </SectionCard>
          </div>
        </div>

        {/* Row 3 */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <SectionCard title="Missing Data Summary" action={<ViewLink label="View details" onClick={() => navigate("/dghr/submissions")} />}>
            <div className="grid grid-cols-5 gap-2">
              {(data?.missing_summary ?? []).map((mi) => (
                <div key={mi.key} className="flex flex-col items-center rounded-lg border border-border p-2 text-center">
                  <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-page text-primary">{MISSING_ICONS[mi.key]}</span>
                  <div className="text-lg font-bold text-text1">{mi.count}</div>
                  <div className="text-[10px] leading-tight text-text3">{mi.label}</div>
                  <div className="text-[9px] text-text3">Entities missing</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-text3">Counts represent entities with critical gaps in each data category.</p>
          </SectionCard>

          <SectionCard title="Recent Alerts & AI Flags" action={<ViewLink label="View all alerts" onClick={() => toast.message("Available in the full release")} />}>
            <div className="space-y-3">
              {(data?.alerts ?? []).map((a, i) => (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 shrink-0" style={{ color: ALERT_TONE[a.severity] }}>{ALERT_ICON[a.severity]}</span>
                  <div>
                    <div className="text-sm font-semibold text-text1">{a.title}</div>
                    <div className="text-xs text-text2">{a.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Collection Progress Trend" action={<ViewLink label="View report" onClick={() => toast.message("Available in the full release")} />}>
            <TrendLine data={data?.trend ?? []} />
          </SectionCard>
        </div>

        {/* Next steps */}
        <Card className="mt-4 p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-text1">Next Steps for DGHR</h3>
            <p className="text-sm text-text2">Recommended actions to keep the collection on track.</p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: <FileText size={18} />, title: "Review Submissions", sub: `${data?.kpis.submissions_received.value ?? 0} ready for review`, onClick: () => navigate("/dghr/submissions") },
              { icon: <Send size={18} />, title: "Send Reminders", sub: `entities in progress`, onClick: sendReminders },
              { icon: <Flag size={18} />, title: "Escalate Blockers", sub: `${data?.kpis.overdue_items ?? 0} overdue items`, onClick: () => toast.message("Escalation queued.") },
              { icon: <UserCheck size={18} />, title: "Approve Ready Entities", sub: `${data?.forecasting.ready ?? 0} entities ready`, onClick: approveReady },
            ].map((s) => (
              <button key={s.title} onClick={s.onClick} className="flex items-center gap-3 rounded-card border border-border p-3 text-left hover:bg-page">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-info-bg text-info">{s.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-text1">{s.title}</div>
                  <div className="text-xs text-text3">{s.sub}</div>
                </div>
                <ChevronRight size={16} className="text-text3" />
              </button>
            ))}
          </div>
        </Card>
      </PageBody>

      <EntityDrawer entityId={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}
