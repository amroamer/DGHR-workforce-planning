import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ShieldCheck, AlertOctagon, CheckCircle2, FileWarning, Copy, UserCheck,
  AlertCircle, AlertTriangle, Info, Sparkles, Send, ClipboardCheck, Users, CheckCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { HBarChart } from "@/components/shared/charts";
import { PaginationFooter } from "@/components/shared/DataTable";
import { cn, fmt } from "@/lib/utils";
import type { QualityAnomaly } from "@/lib/types";

const PKG_LABEL: Record<string, string> = {
  org_structure: "Organization Data", current_workforce: "Workforce Data",
  workload_service: "Workload Data", future_drivers: "Future Drivers", evidence_documents: "Evidence Data",
};
const sevIcon = (s: string) =>
  s === "High" ? <AlertCircle size={16} className="text-danger" />
  : s === "Medium" ? <AlertTriangle size={16} className="text-warning" />
  : <Info size={16} className="text-info" />;

function ConfidenceBar({ v }: { v: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-border"><span className="block h-full rounded-full bg-success" style={{ width: `${v}%` }} /></span>
      <span className="text-xs text-text2">{v}%</span>
    </span>
  );
}

export function DataQuality() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [anomaly, setAnomaly] = useState<QualityAnomaly | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrLoading, setNarrLoading] = useState(false);
  const pageSize = showAll ? 50 : 8; // backend caps page_size at 50

  const generateNarrative = async (id: number) => {
    setNarrLoading(true);
    await new Promise((r) => setTimeout(r, 1800)); // "Analyzing…" beat
    try {
      const res = await api.aiAnomalyNarrative(id);
      setNarrative(res.narrative);
    } finally {
      setNarrLoading(false);
    }
  };
  const { data } = useQuery({ queryKey: ["quality", page, pageSize], queryFn: () => api.quality(page, pageSize), refetchInterval: 4000 });
  const k = data?.kpis;

  // Intuitive two-step: open → Investigate (In Progress, stays visible) → Resolve (cleared, leaves queue).
  const advanceIssue = async (it: { id: number; status: string }) => {
    const next = it.status === "in_progress" ? "cleared" : "in_progress";
    await api.patchIssue(it.id, { status: next });
    qc.invalidateQueries({ queryKey: ["quality"] });
    toast.success(next === "cleared" ? "Issue resolved and cleared from the queue." : "Issue marked as in progress, now investigating.");
  };

  // MD-03 issue drawer + DQ-04 assign + DQ-05 send-back
  const [issueId, setIssueId] = useState<number | null>(null);
  const issueQ = useQuery({ queryKey: ["issue", issueId], queryFn: () => api.issueDetail(issueId!), enabled: issueId != null });
  const iss = issueQ.data;
  const assignAnalyst = async (uid: number) => {
    if (issueId == null) return;
    await api.patchIssue(issueId, { assigned_to: uid });
    qc.invalidateQueries({ queryKey: ["issue", issueId] });
    qc.invalidateQueries({ queryKey: ["quality"] });
    toast.success("Analyst assigned.");
  };
  const sendBack = async () => {
    if (issueId == null) return;
    const r = await api.issueSendBack(issueId);
    qc.invalidateQueries();
    toast.warning(`${r.ref}: sent back to ${iss?.entity ?? "entity"}.`);
    setIssueId(null);
  };

  return (
    <>
      <PageHeader title="DGHR Data Quality & Validation" subtitle="Validate submitted data to ensure accuracy, completeness, and consistency before forecasting." />
      <PageBody>
        {/* KPIs */}
        <div className="grid grid-cols-6 gap-4">
          <KpiCard tone="blue" icon={<ShieldCheck size={20} />} value={k?.avg_quality} label="Average Quality Score" sublabel={`${k?.avg_quality_delta ?? ""} vs last submission`} />
          <KpiCard tone="red" icon={<AlertOctagon size={20} />} value={k?.entities_with_issues} label="Entities with Issues" sublabel="Require attention" />
          <KpiCard tone="green" icon={<CheckCircle2 size={20} />} value={k?.rules_passed} label="Rules Passed" sublabel={`${k?.rules_pass_rate ?? 0}% of total rules`} />
          <KpiCard tone="orange" icon={<FileWarning size={20} />} value={k?.missing_mandatory.count} label="Missing Mandatory Fields" sublabel={`Across ${k?.missing_mandatory.entities ?? 0} entities`} />
          <KpiCard tone="purple" icon={<Copy size={20} />} value={k?.duplicate_titles.count} label="Duplicate Job Titles" sublabel={`Across ${k?.duplicate_titles.entities ?? 0} entities`} />
          <KpiCard tone="teal" icon={<UserCheck size={20} />} value={k?.ready_for_review} label="Ready for Review" sublabel="Awaiting review" />
        </div>

        {/* Row 2 */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* issues queue */}
          <Card className="col-span-5">
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="flex items-center gap-2 text-base font-semibold text-text1">Validation Issues Queue <span className="rounded-full bg-page px-2 py-0.5 text-xs text-text2">{data?.issues.total ?? 0}</span></h3>
              <button onClick={() => { setShowAll((v) => !v); setPage(1); }} className="text-xs font-semibold text-primary hover:underline">{showAll ? "Show less" : "View all issues →"}</button>
            </div>
            <div className="p-3">
              <div className={showAll ? "max-h-[420px] overflow-y-auto" : ""}>
              <table className="w-full text-left text-sm">
                <thead><tr className="text-[11px] uppercase text-text3"><th className="px-2 pb-2 font-semibold">Issue Type</th><th className="px-2 pb-2 font-semibold">Entity</th><th className="px-2 pb-2 font-semibold">Sev.</th><th className="px-2 pb-2 font-semibold">AI Conf.</th><th className="px-2 pb-2 font-semibold">Status</th><th /></tr></thead>
                <tbody>
                  {(data?.issues.items ?? []).map((it) => (
                    <tr key={it.id} onClick={() => setIssueId(it.id)} className="cursor-pointer border-t border-border hover:bg-page">
                      <td className="px-2 py-2.5"><span className="flex items-center gap-1.5 font-medium text-text1">{sevIcon(it.severity)} {it.issue_type}</span><span className="text-[11px] text-text3">{PKG_LABEL[it.package_key] ?? it.package_key}</span></td>
                      <td className="px-2 py-2.5 text-text2">{it.entity}</td>
                      <td className="px-2 py-2.5"><StatusBadge value={it.severity.toLowerCase()} label={it.severity} /></td>
                      <td className="px-2 py-2.5"><ConfidenceBar v={it.ai_confidence} /></td>
                      <td className="px-2 py-2.5"><StatusBadge value={it.status === "in_progress" ? "in_progress" : "open"} label={it.status === "in_progress" ? "In Progress" : "Open"} /></td>
                      <td className="px-2" onClick={(e) => e.stopPropagation()}><button onClick={() => advanceIssue(it)} className="text-xs font-semibold text-primary hover:underline">{it.status === "in_progress" ? "Resolve" : "Investigate"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {!showAll && (
                <div className="flex items-center justify-between px-2 pt-3 text-sm text-text2">
                  <PaginationFooter page={page} pageSize={8} total={data?.issues.total ?? 0} onPage={setPage} unit="issues" />
                </div>
              )}
            </div>
          </Card>

          {/* quality bars */}
          <Card className="col-span-4 p-5">
            <div className="mb-2 flex items-center justify-between"><h3 className="text-base font-semibold text-text1">Quality Score by Entity</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View full report →</button></div>
            <HBarChart data={(data?.quality_bars ?? []).map((b) => ({ name: b.name, value: b.value, highlight: b.highlight }))} height={260} />
          </Card>

          {/* rules summary */}
          <Card className="col-span-3 p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-text1">Rules Summary</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all rules →</button></div>
            <div className="space-y-2 text-sm">
              {(data?.rule_stats ?? []).map((r) => (
                <div key={r.category} className={`flex items-center gap-2 ${r.category === "Total" ? "border-t border-border pt-2 font-semibold text-text1" : "text-text2"}`}>
                  <span className="flex-1">{r.category}</span>
                  <span className="w-8 text-right text-success">{r.passed}</span>
                  <span className="w-8 text-right text-danger">{r.failed}</span>
                  <span className="w-11 text-right text-xs">{r.pass_rate}%</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Row 3 */}
        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* anomalies */}
          <Card className="col-span-4 p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 text-base font-semibold text-text1">AI-Detected Anomalies <span className="rounded-full bg-page px-2 py-0.5 text-xs text-text2">{data?.anomalies.length ?? 0}</span></h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all →</button></div>
            <div className="space-y-2.5">
              {(data?.anomalies ?? []).map((a) => (
                <button key={a.id} onClick={() => { setAnomaly(a); setNarrative(null); }} className="flex w-full gap-2.5 rounded-lg border border-border p-2.5 text-left hover:bg-page">
                  {sevIcon(a.severity)}
                  <div className="flex-1"><div className="text-sm font-medium text-text1">{a.title}</div><div className="text-[11px] text-text3">{a.entity}, {PKG_LABEL[a.package_key] ?? a.package_key}</div></div>
                  <div className="flex flex-col items-end gap-1"><StatusBadge value={a.severity.toLowerCase()} label={a.severity} /><span className="text-[11px] font-semibold text-text2">{a.confidence}%</span></div>
                </button>
              ))}
            </div>
          </Card>

          {/* evidence overview */}
          <Card className="col-span-5 p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-text1">Evidence Quality Overview</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View details →</button></div>
            <div className="grid grid-cols-3 gap-3">
              {(data?.evidence_overview ?? []).map((e, i) => (
                <div key={e.key} className={cn("rounded-card border border-border p-3 text-center", ["bg-danger-bg", "bg-warning-bg", "bg-info-bg"][i])}>
                  <div className="text-2xl font-bold text-text1">{fmt(e.count)}</div>
                  <div className="text-xs font-semibold text-text2">{e.label}</div>
                  <div className="mt-1 text-[10px] text-text3">Across {e.entities} entities, {e.pct}% of total records</div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold text-text1">Top Evidence Gaps</div>
              <div className="space-y-1.5">
                {(data?.top_gaps ?? []).map((g, i) => (
                  <div key={g.label} className="flex items-center justify-between text-sm"><span className="text-text2">{i + 1}. {g.label}</span><span className="font-semibold text-text1">{g.count} missing</span></div>
                ))}
              </div>
            </div>
          </Card>

          {/* quick actions */}
          <Card className="col-span-3 p-5">
            <h3 className="mb-3 text-base font-semibold text-text1">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { icon: <ClipboardCheck size={16} />, title: "Review Issues", sub: "Open the full validation issues queue", onClick: () => { setShowAll(true); setPage(1); } },
                { icon: <Users size={16} />, title: "Assign Analyst", sub: "Assign issues to data analysts", onClick: () => toast.message("Assign an analyst from any issue row. Analyst assignment view coming to the queue.") },
                { icon: <Send size={16} />, title: "Send Back to Entity", sub: "Request entity to address issues", onClick: () => navigate("/dghr/clarifications") },
                { icon: <CheckCheck size={16} />, title: "Mark as Cleared", sub: "Resolve all issues under investigation", onClick: async () => {
                  const inProg = (data?.issues.items ?? []).filter((i) => i.status === "in_progress");
                  if (!inProg.length) return toast.message("No in-progress issues to clear. Click Investigate on an issue first.");
                  await Promise.all(inProg.map((i) => api.patchIssue(i.id, { status: "cleared" })));
                  qc.invalidateQueries({ queryKey: ["quality"] });
                  toast.success(`Cleared ${inProg.length} resolved issue${inProg.length > 1 ? "s" : ""}.`);
                } },
              ].map((a) => (
                <button key={a.title} onClick={a.onClick} className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2.5 text-left hover:bg-page">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-bg text-info">{a.icon}</span>
                  <div className="flex-1"><div className="text-sm font-semibold text-text1">{a.title}</div><div className="text-[11px] text-text3">{a.sub}</div></div>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-text3">
          <span>DGHR Data Collection Command Center, Data Quality &amp; Validation</span>
          <span>All times shown in GST (UTC+4)</span>
        </div>
      </PageBody>

      {/* issue drawer (MD-03) */}
      <Drawer open={issueId != null} onClose={() => setIssueId(null)} title="Validation Issue" width={460}>
        {iss && (
          <div className="space-y-4">
            <div className="rounded-card border border-border bg-card p-4">
              <div className="flex items-center gap-2">{sevIcon(iss.severity)}<span className="font-semibold text-text1">{iss.issue_type}</span></div>
              <div className="mt-1 text-xs text-text3">{iss.entity}, {PKG_LABEL[iss.package_key] ?? iss.package_key}</div>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge value={iss.severity.toLowerCase()} label={iss.severity} />
                <span className="text-xs text-text2">AI confidence {iss.ai_confidence}%</span>
                <StatusBadge value={iss.status === "in_progress" ? "in_progress" : iss.status === "cleared" ? "mapped" : "open"} label={iss.status === "in_progress" ? "In Progress" : iss.status === "cleared" ? "Cleared" : "Open"} />
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-semibold text-text1">Sample affected records ({iss.samples.length})</div>
              <div className="space-y-1.5">
                {iss.samples.length === 0 && <div className="text-xs text-text3">No sampled records available for this issue.</div>}
                {iss.samples.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                    <AlertTriangle size={14} className="shrink-0 text-warning" />
                    <div className="flex-1"><div className="font-medium text-text1">{s.label}</div><div className="text-text3">{s.detail}</div></div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1 text-sm font-semibold text-text1">Assign Analyst</div>
              <select
                value={iss.assigned_to ?? ""}
                onChange={(e) => e.target.value && assignAnalyst(Number(e.target.value))}
                className="select-field h-9 w-full rounded-btn border border-border bg-card px-2 text-sm"
              >
                <option value="">Unassigned</option>
                {iss.reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {iss.assigned_to_name && <div className="mt-1 text-[11px] text-text3">Currently: {iss.assigned_to_name}</div>}
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <Button variant="secondary" className="w-full" onClick={sendBack}><Send size={15} /> Send Back to Entity</Button>
              <Button className="w-full" onClick={async () => { await api.patchIssue(iss.id, { status: "cleared" }); qc.invalidateQueries(); toast.success("Issue cleared."); setIssueId(null); }}><CheckCircle2 size={15} /> Mark as Cleared</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* anomaly drawer */}
      <Drawer open={anomaly != null} onClose={() => setAnomaly(null)} title="AI-Detected Anomaly" width={440}>
        {anomaly && (
          <div className="space-y-4">
            <div className="rounded-card border border-border bg-card p-4">
              <div className="flex items-center gap-2">{sevIcon(anomaly.severity)}<span className="font-semibold text-text1">{anomaly.title}</span></div>
              <div className="mt-1 text-xs text-text3">{anomaly.entity}, {PKG_LABEL[anomaly.package_key] ?? anomaly.package_key}</div>
              <div className="mt-2 flex items-center gap-2"><StatusBadge value={anomaly.severity.toLowerCase()} label={anomaly.severity} /><span className="text-xs text-text2">AI confidence {anomaly.confidence}%</span></div>
            </div>
            {narrLoading ? (
              <div className="flex flex-col items-center py-6 text-teal"><Sparkles size={24} className="mb-2 animate-pulse" /><div className="text-sm font-semibold">✨ Analyzing…</div></div>
            ) : narrative ? (
              <div className="whitespace-pre-line rounded-card border border-teal/30 bg-teal-bg/40 p-4 text-sm text-text1">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-teal"><Sparkles size={13} /> AI Narrative</div>
                {narrative}
              </div>
            ) : (
              <Button variant="secondary" className="w-full" onClick={() => generateNarrative(anomaly.id)}>
                <Sparkles size={15} /> Generate AI Narrative
              </Button>
            )}
            <Button className="w-full" onClick={async () => {
              const r = await api.createCase({ entity_id: anomaly.entity_id, issue_summary: anomaly.title, priority: anomaly.severity, category: "Data Quality" });
              qc.invalidateQueries(); setAnomaly(null);
              toast.warning(`Clarification ${r.ref} sent to ${anomaly.entity}.`);
            }}>
              <Send size={15} /> Open Clarification
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}
