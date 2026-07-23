import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ShieldCheck, ArrowUpRight, Flag, Clock, MessageSquareWarning,
  Sparkles, Check, Send, Radar, Building2 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { THEAD_TR, TH, TH_NUM, TROW } from "@/components/ui/table";
import { GapPill, StatCard } from "./widgets";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";
import type { QualitySweepPayload, TriagePayload, TriageItem } from "@/lib/planning";

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

const SEV_PILL: Record<string, string> = {
  high: "bg-danger-bg text-danger", medium: "bg-warning-bg text-warning", low: "bg-surface2 text-text2",
};
const ACTION_PILL: Record<string, { pill: string; label: string }> = {
  escalate: { pill: "bg-danger-bg text-danger", label: "Escalate" },
  remind: { pill: "bg-warning-bg text-warning", label: "Remind" },
  wait: { pill: "bg-surface2 text-text2", label: "Wait" },
};

/** Agent #3 — the cross-entity data-quality sweep. Reads every received submission and surfaces the
 *  patterns no single-submission view can see. On demand; source badge says who phrased it. */
function InsightsCard() {
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<QualitySweepPayload | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.aiQualitySweep();
      if (!r.insights.length) { toast.message("No cross-entity patterns stood out."); return; }
      setData(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not run the sweep."); }
    finally { setBusy(false); }
  };
  return (
    <Card className="mb-4 border-dashed border-teal/50 bg-teal-bg/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal">
          <Radar size={14} /> Cross-entity insights
        </div>
        {data && <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-text3">{data.source === "ai" ? "live model" : "offline"}{data.counted ? ` · ${data.counted} submissions` : ""}</span>}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            <Sparkles size={14} /> {busy ? "Scanning…" : data ? "Re-scan" : "Scan all entities"}
          </Button>
        </div>
      </div>
      {!data && <p className="mt-1.5 text-xs text-text3">Patterns that only show across entities: growth clustered, the same driver named inconsistently, one type of work short everywhere, and where a flag concentrates.</p>}
      {data && (
        <div className="mt-2.5 grid gap-2.5 md:grid-cols-2">
          {data.insights.map((x, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${SEV_PILL[x.severity]}`}>{x.severity}</span>
                <span className="text-[13px] font-semibold text-text1">{x.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-text2">{x.detail}</p>
              {x.entities.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <Building2 size={11} className="text-text3" />
                  {x.entities.slice(0, 5).map((e) => <span key={e} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-text2">{e}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Agent #2 — clarification triage. Reads the open queue, proposes remind/escalate/wait per item with
 *  the message drafted from its real age, and applies on the same notify+audit path a manual nudge uses. */
function TriageCard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<TriagePayload | null>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState<number | "all" | null>(null);
  const run = async () => {
    setBusy(true);
    try { const r = await api.aiClarificationTriage(); setData(r); setDone(new Set()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not triage."); }
    finally { setBusy(false); }
  };
  const apply = async (item: TriageItem) => {
    if (item.action === "wait") return;
    await api.aiClarificationChase({ clarification_id: item.id, action: item.action, message: item.draft });
    setDone((s) => new Set(s).add(item.id));
  };
  const applyOne = async (item: TriageItem) => {
    setApplying(item.id);
    try { await apply(item); qc.invalidateQueries(); toast.success(`${item.action === "escalate" ? "Escalated" : "Reminder sent"}: ${item.department}.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply."); }
    finally { setApplying(null); }
  };
  const applyAll = async () => {
    if (!data) return;
    setApplying("all");
    let n = 0;
    try {
      for (const item of data.items) {
        if (item.action === "wait" || done.has(item.id)) continue;
        await apply(item); n++;
      }
      qc.invalidateQueries();
      toast.success(n ? `Actioned ${n} item${n !== 1 ? "s" : ""}: ${data.counts.escalate} escalated, ${data.counts.remind} reminded.` : "Nothing to action.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply all."); }
    finally { setApplying(null); }
  };
  const actionable = (data?.items ?? []).filter((i) => i.action !== "wait");
  return (
    <Card className="mb-4 border-dashed border-primary/50 bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <MessageSquareWarning size={14} /> Clarification triage agent
        </div>
        {data && <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-text3">{data.source === "ai" ? "live model" : "offline"}</span>}
        <div className="ml-auto flex items-center gap-2">
          {data && actionable.length > 0 && (
            <Button size="sm" onClick={applyAll} disabled={applying !== null}>
              <Send size={13} /> {applying === "all" ? "Sending…" : "Apply all"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            <Sparkles size={14} /> {busy ? "Reading…" : data ? "Re-triage" : "Triage the queue"}
          </Button>
        </div>
      </div>
      {!data && <p className="mt-1.5 text-xs text-text3">Reads every open clarification, proposes a move per item (remind, escalate, or wait) and drafts the message. You confirm before anything is sent.</p>}
      {data && (
        <div className="mt-2.5 space-y-3">
          <p className="text-xs text-text2">{data.summary}</p>
          {data.items.length > 0 && (
            <ul className="divide-y divide-border">
              {data.items.map((item) => {
                const t = ACTION_PILL[item.action];
                const isDone = done.has(item.id);
                return (
                  <li key={item.id} className="flex flex-wrap items-start gap-2 py-2 first:pt-0 last:pb-0">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${t.pill}`}>{t.label}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-text1">{item.department} <span className="font-normal text-text3">· {item.entity} · {item.element_label} · {item.days_open}d</span></div>
                      {item.action !== "wait" && item.draft && (
                        <div className="mt-1 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] italic text-text2">“{item.draft}”</div>
                      )}
                    </div>
                    {item.action === "wait" ? (
                      <span className="mt-0.5 shrink-0 text-[11px] text-text3">Within SLA</span>
                    ) : isDone ? (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success"><Check size={12} /> Sent</span>
                    ) : (
                      <button onClick={() => applyOne(item)} disabled={applying !== null}
                        className="mt-0.5 shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-text2 hover:bg-surface2 disabled:opacity-50">
                        {applying === item.id ? "…" : item.action === "escalate" ? "Escalate" : "Remind"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[10px] text-text3">A reminder notifies the entity; an escalation notifies DGHR. Both are recorded in the audit log.</p>
        </div>
      )}
    </Card>
  );
}

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

        {/* AI agents — cross-entity sweep (#3) and clarification triage (#2), both on demand. */}
        <InsightsCard />
        <TriageCard />

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
                        <td className="px-5 py-3.5 align-top text-[13px] leading-relaxed text-text2">{a.recommended_action ?? "-"}</td>
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
