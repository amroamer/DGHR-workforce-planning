import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldCheck, ArrowUpRight, Flag, Clock, MessageSquareWarning } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { THEAD_TR, TH, TH_NUM, TROW } from "@/components/ui/table";
import { GapPill, StatCard } from "./widgets";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";

const AGE_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: "rgb(var(--text-3) / 0.15)", fg: "rgb(var(--text-2))", label: "Open" },
  due_soon: { bg: "rgb(var(--warning-bg))", fg: "rgb(var(--warning))", label: "Due soon" },
  overdue: { bg: "rgb(var(--warning-bg))", fg: "rgb(var(--warning))", label: "Overdue" },
  escalated: { bg: "rgb(var(--danger-bg))", fg: "rgb(var(--danger))", label: "Escalated" },
};
// Thin left accent applied to a whole row by its urgency (not a fully coloured row).
const AGE_ACCENT: Record<string, string> = {
  open: "border-l-transparent", due_soon: "border-l-warning/50",
  overdue: "border-l-warning", escalated: "border-l-danger",
};

// Alerts & Smart Flags: every row is a flag the sizing engine actually raised on a received
// submission (services/sizing.py). Nothing here is fabricated or seeded. Colour stays controlled —
// a soft semantic tint + coloured ink, never a saturated fill.
const FLAG_TONE: Record<string, { pill: string; dot: string }> = {
  "Sizing variance above 15%": { pill: "bg-danger-bg text-danger", dot: "bg-danger" },
  "Statutory floor applies": { pill: "bg-warning-bg text-warning", dot: "bg-warning" },
  "No drivers entered": { pill: "bg-purple-bg text-purple", dot: "bg-purple" },
};
const FLAG_FALLBACK = { pill: "bg-surface2 text-text2", dot: "bg-text3" };
const flagTone = (f: string) => FLAG_TONE[f] ?? FLAG_FALLBACK;
// Row accent = the most severe flag on the row.
const rowAccent = (flags: string[]) =>
  flags.includes("Sizing variance above 15%") ? "border-l-danger"
    : flags.includes("Statutory floor applies") ? "border-l-warning"
      : flags.includes("No drivers entered") ? "border-l-purple"
        : "border-l-transparent";

export function PlanningAlerts() {
  const navigate = useNavigate();
  const [flag, setFlag] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["q-alerts"], queryFn: () => api.planning.alerts(), refetchInterval: 4000 });
  const { data: queue } = useQuery({ queryKey: ["q-clar-queue"], queryFn: () => api.planning.clarificationQueue(), refetchInterval: 4000 });

  const qc = queue?.clarifications ?? [];
  const needAction = qc.filter((c) => c.level === "escalated" || c.level === "overdue");
  const all = data?.alerts ?? [];
  const rows = flag ? all.filter((a) => a.flags.includes(flag)) : all;

  return (
    <>
      <PageHeader title="Alerts & Smart Flags" subtitle="Submissions the sizing engine flagged, and clarifications aging in the queue." />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<AlertTriangle size={20} />} tone="#E11D48" value={data?.total ?? 0} label="Flagged Submissions" sub="Across all entities" />
          <StatCard icon={<Flag size={20} />} tone="#B45309" value={data?.by_flag?.length ?? 0} label="Flag Types" sub="Raised by the engine" />
          <StatCard icon={<MessageSquareWarning size={20} />} tone="#C2410C" value={needAction.length} label="Clarifications Overdue" sub={`of ${queue?.total ?? 0} open`} />
          <StatCard icon={<Clock size={20} />} tone="#B91C1C" value={queue?.by_level?.escalated ?? 0} label="Escalated" sub={`Past ${queue?.escalate_after ?? 10} days`} />
        </div>

        {/* Escalation queue — clarifications age from their own timestamps, so this fills without a
            scheduler. An unanswered question is the workflow's quietest failure; here it is loud. */}
        {qc.length > 0 && (
          <Card className="mb-4 min-w-0 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-text1"><MessageSquareWarning size={16} className="text-warning" /> Clarification queue</span>
              <span className="flex items-center gap-2 text-[11px]">
                {(["escalated", "overdue", "due_soon", "open"] as const).map((lvl) => (queue?.by_level?.[lvl] ?? 0) > 0 && (
                  <span key={lvl} className="rounded-full px-2 py-0.5 font-semibold" style={{ background: AGE_TONE[lvl].bg, color: AGE_TONE[lvl].fg }}>
                    {queue?.by_level?.[lvl]} {AGE_TONE[lvl].label}
                  </span>
                ))}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead><tr className={THEAD_TR}>
                  <th className="px-5 py-2.5">Department</th><th className={TH}>Query</th>
                  <th className={TH}>Raised by</th><th className={TH_NUM}>Age</th>
                  <th className="px-5 py-2.5 text-right">Status</th>
                </tr></thead>
                <tbody>
                  {qc.map((c) => {
                    const t = AGE_TONE[c.level];
                    return (
                    <tr key={c.id} className={`${TROW} cursor-pointer border-l-2 ${AGE_ACCENT[c.level] ?? "border-l-transparent"}`}
                      onClick={() => navigate(`/dghr/gov-submission/${c.submission_id}`)}>
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex items-center gap-1.5 font-semibold text-text1">{c.department} <ArrowUpRight size={12} className="text-text3" /></div>
                        <div className="text-[11px] text-text3">{c.entity}</div>
                      </td>
                      <td className="px-3 py-3.5 align-top">
                        <div className="inline-block rounded bg-inset px-1.5 py-0.5 text-[10px] text-text2">{c.element_label}</div>
                        <div className="mt-1 max-w-md truncate text-text2" title={c.message}>{c.message}</div>
                      </td>
                      <td className="px-3 py-3.5 align-top text-text2">{c.author}</td>
                      <td className="px-3 py-3.5 text-right align-top">
                        <span className="nums text-sm font-bold" style={{ color: t.fg }}>{c.days_open}d</span>
                      </td>
                      <td className="px-5 py-3.5 text-right align-top">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.fg }}>
                          {c.level === "escalated" ? <AlertTriangle size={10} /> : <Clock size={10} />}{t.label}
                        </span>
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Card className="min-w-0 p-0">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border p-3">
              <button onClick={() => setFlag(null)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${flag === null ? "border-primary bg-primary text-white" : "border-border bg-card text-text2 hover:bg-surface2"}`}>
                All ({all.length})
              </button>
              {(data?.by_flag ?? []).map((f) => (
                <button key={f.flag} onClick={() => setFlag(f.flag)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-fast ${flag === f.flag ? "border-primary bg-primary text-white" : "border-border bg-card text-text2 hover:bg-surface2"}`}>
                  {f.flag} ({f.count})
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={<ShieldCheck size={26} />} title={all.length === 0 ? "Nothing flagged" : "No matches"}
                description={all.length === 0
                  ? "The sizing engine hasn't flagged any received submission. Flags appear automatically when a submission's variance exceeds 15%, a statutory floor applies, or drivers are missing."
                  : "No submissions carry this flag."} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className="px-5 py-2.5">Department</th><th className={TH}>Flags</th>
                    <th className={TH_NUM}>Current</th><th className={TH_NUM}>Required</th>
                    <th className={TH_NUM}>Gap</th><th className={TH_NUM}>Variance</th>
                    <th className={TH}>Status</th><th className="w-[22%] px-5 py-2.5">Recommended action</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.submission_id} className={`${TROW} cursor-pointer border-l-2 ${rowAccent(a.flags)}`}
                        onClick={() => navigate(`/dghr/gov-submission/${a.submission_id}`)}>
                        <td className="px-5 py-3.5 align-top">
                          <div className="flex items-center gap-1.5 font-semibold text-text1">{a.department} <ArrowUpRight size={12} className="text-text3" /></div>
                          <div className="text-[11px] text-text3">{a.entity}{a.submitted_at ? `, sent ${new Date(a.submitted_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}` : ""}</div>
                        </td>
                        <td className="px-3 py-3.5 align-top">
                          <div className="flex flex-wrap gap-1">
                            {a.flags.map((f) => {
                              const ft = flagTone(f);
                              return (
                                <span key={f} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${ft.pill}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${ft.dot}`} />{f}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3.5 text-right align-top nums text-text2">{a.current_fte}</td>
                        <td className="px-3 py-3.5 text-right align-top nums font-semibold text-text1">{a.required_fte}</td>
                        <td className="px-3 py-3.5 text-right align-top"><GapPill gap={a.gap} /></td>
                        <td className="px-3 py-3.5 text-right align-top nums font-semibold text-text1">{a.variance_pct}%</td>
                        <td className="px-3 py-3.5 align-top"><StatusBadge value={Q_STATUS_VALUE[a.status]} label={Q_STATUS_LABEL[a.status]} /></td>
                        <td className="px-5 py-3.5 align-top text-[13px] leading-relaxed text-text2">{a.recommended_action ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card>
              <div className="mb-3 text-sm font-semibold text-text1">By flag</div>
              {(data?.by_flag ?? []).length === 0 ? <p className="text-sm text-text3">No flags raised.</p> : (
                <div className="space-y-1">
                  {(data?.by_flag ?? []).map((f) => (
                    <button key={f.flag} onClick={() => setFlag(f.flag)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-fast hover:bg-surface2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${flagTone(f.flag).dot}`} />
                      <span className="flex-1 text-xs text-text2">{f.flag}</span>
                      <span className="nums font-semibold text-text1">{f.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
            <Card className="text-xs leading-relaxed text-text3">
              <b className="text-text2">What raises a flag:</b> the sizing engine flags a submission when the gap exceeds 15% of required FTE, when a statutory floor applies (the minimum may override the workload build-up), or when no drivers were entered. Flags are computed live, not seeded.
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
