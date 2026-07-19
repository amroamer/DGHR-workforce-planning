import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileStack, MessageSquareWarning, CheckCircle2, Clock, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { THEAD_TR, TH, TH_NUM, TROW, TD_NUM } from "@/components/ui/table";
import { GapPill, StatCard } from "./widgets";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";

const FILTERS = ["all", "draft", "submitted", "in_clarification", "approved", "rejected"];
// Theme-aware status dots (mirror the semantic StatusBadge palette via CSS-var channels).
const STATUS_DOT: Record<string, string> = {
  approved: "rgb(var(--success))", submitted: "rgb(var(--primary))", in_clarification: "rgb(var(--warning))",
  rejected: "rgb(var(--danger))", draft: "rgb(var(--text-3))",
};

export function PlanningSubmissions() {
  const { entityId } = useAudience();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const { data: allData } = useQuery({ queryKey: ["q-submissions", entityId, "all"], queryFn: () => api.planning.submissions(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const all = allData?.rows ?? [];
  const rows = filter === "all" ? all : all.filter((r) => r.status === filter);

  const awaiting = all.filter((r) => r.status === "submitted").length;
  const approved = all.filter((r) => r.status === "approved").length;
  const openClar = all.reduce((s, r) => s + r.open_clarifications, 0);
  const needsYou = all.filter((r) => r.open_clarifications > 0 || r.status === "rejected");
  const counts = all.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title="My Submissions" subtitle="Every department submission in one place: filter, and open any to view or resubmit." />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<FileStack size={20} />} tone="#2563EB" value={all.length} label="Submissions" sub="Across your departments" />
          <StatCard icon={<Clock size={20} />} tone="#B45309" value={awaiting} label="Awaiting DGHR" sub="Submitted, pending review" />
          <StatCard icon={<CheckCircle2 size={20} />} tone="#15803D" value={approved} label="Approved" sub="Signed off by DGHR" />
          <StatCard icon={<MessageSquareWarning size={20} />} tone="#E11D48" value={openClar} label="Open Clarifications" sub="Waiting on your answer" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
          <Card className="min-w-0 p-0">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-3">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${filter === f ? "border-primary bg-primary text-white" : "border-border bg-card text-text2 hover:bg-surface2"}`}>
                  {f === "all" ? `All (${all.length})` : `${Q_STATUS_LABEL[f]}${counts[f] ? ` (${counts[f]})` : ""}`}
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<FileStack size={26} />} title="Nothing here" description={filter === "all" ? "Submissions appear once you start filling in your departments." : "No submissions with this status."} />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead><tr className={THEAD_TR}>
                  <th className="px-5 py-2.5">Department</th><th className={TH_NUM}>Current</th><th className={TH_NUM}>Required</th>
                  <th className={TH_NUM}>Gap</th><th className={TH}>Status</th><th className={TH}>Sent</th><th className="px-5 py-2.5">Clarifications</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={`${TROW} cursor-pointer`} onClick={() => navigate(`/entity/departments/${r.department_id}`)}>
                      <td className="px-5 py-3.5 text-sm"><div className="flex items-center gap-2 font-semibold text-text1">{r.department} <ArrowUpRight size={13} className="text-text3" /></div></td>
                      <td className="px-3 py-3.5 text-right text-sm text-text2 nums">{r.current_fte}</td>
                      <td className={`${TD_NUM} font-semibold`}>{r.required_fte}</td>
                      <td className="px-3 py-3.5 text-right"><GapPill gap={r.gap} /></td>
                      <td className="px-3 py-3.5"><StatusBadge value={Q_STATUS_VALUE[r.status]} label={Q_STATUS_LABEL[r.status]} /></td>
                      <td className="px-3 py-3.5">
                        {r.submitted_at ? (
                          <div>
                            <div className="text-xs text-text2">{new Date(r.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
                            {r.days_waiting != null && (
                              <span className={`nums mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${r.days_waiting > 10 ? "bg-danger-bg text-danger" : r.days_waiting > 5 ? "bg-warning-bg text-warning" : "bg-inset text-text3"}`}>{r.days_waiting}d waiting</span>
                            )}
                          </div>
                        ) : <span className="text-xs text-text3">—</span>}
                      </td>
                      <td className="px-5 py-3.5">{r.open_clarifications > 0 ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning"><MessageSquareWarning size={14} /> {r.open_clarifications} open</span> : <span className="text-xs text-text3">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card>
              <div className="mb-3 text-sm font-semibold text-text1">By status</div>
              {all.length === 0 ? <p className="text-sm text-text3">No submissions yet.</p> : (
                <div className="space-y-1.5">
                  {Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                    <button key={s} onClick={() => setFilter(s)} className="flex w-full items-center gap-2 rounded-btn px-2 py-1.5 text-sm transition-colors duration-fast hover:bg-surface2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_DOT[s] ?? "rgb(var(--text-3))" }} />
                      <span className="flex-1 text-left text-text2">{Q_STATUS_LABEL[s] ?? s}</span>
                      <span className="font-semibold tabular-nums text-text1">{n}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><MessageSquareWarning size={15} className="text-warning" /> Needs your response</div>
              {needsYou.length === 0 ? <p className="text-sm text-text3">Nothing outstanding: no open clarifications or rejections.</p> : (
                <div className="space-y-1.5">
                  {needsYou.map((r) => (
                    <button key={r.id} onClick={() => navigate(`/entity/departments/${r.department_id}`)}
                      className="flex w-full items-center gap-2 rounded-btn bg-inset px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-surface2">
                      <span className="flex-1 truncate text-text1">{r.department}</span>
                      <StatusBadge value={Q_STATUS_VALUE[r.status]} label={Q_STATUS_LABEL[r.status]} />
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card className="text-xs leading-relaxed text-text3">
              <b className="text-text2">Tip:</b> a submission stays editable until DGHR decides. If it's returned or a clarification is raised, answer it against the exact element and resubmit.
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
