import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  HelpCircle, CornerUpLeft, Clock, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Send, Paperclip, CornerDownLeft, FilePlus2, CheckCheck, ArrowUpCircle, UserPlus, RotateCcw, ThumbsUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "./PageHeader";
import { PageBody } from "./AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "./KpiCard";
import { StatusBadge } from "./StatusBadge";
import type { CaseSummary } from "@/lib/types";

type Side = "dghr" | "entity";

function CaseCard({ c, selected, onClick }: { c: CaseSummary; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full rounded-lg border p-3 text-left ${selected ? "border-primary bg-primary/5" : "border-border hover:bg-page"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-primary">{c.ref}</span>
        <span className="text-[11px] text-text3">{relativeTime(c.updated_at ?? c.created_at)}</span>
      </div>
      <div className="mt-0.5 text-sm font-semibold text-text1">{c.entity}</div>
      <div className="text-[11px] text-text3">{c.package_label}</div>
      <div className="mt-1 line-clamp-1 text-xs text-text2">{c.issue_summary}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <StatusBadge value={c.priority.toLowerCase()} label={c.priority} />
        {c.returned_on && <span className="text-[11px] text-text3">Returned {c.returned_on}</span>}
      </div>
    </button>
  );
}

export function ClarificationsView({ side, entityId, title, subtitle }: { side: Side; entityId?: number; title: string; subtitle: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "open" | "returned" | "resolved">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const list = useQuery({
    queryKey: ["cases", side, entityId, tab, search],
    queryFn: () => api.cases({ side, entity_id: entityId, tab, search }),
    refetchInterval: 4000,
    enabled: side === "dghr" || entityId != null,
  });
  const kpis = useQuery({
    queryKey: ["clar-kpis", entityId],
    queryFn: () => api.clarificationsKpis(entityId),
    refetchInterval: 4000,
    enabled: side === "dghr" || entityId != null,
  });
  const detail = useQuery({
    queryKey: ["case", selectedId],
    queryFn: () => api.caseDetail(selectedId!),
    enabled: selectedId != null,
  });

  // auto-select first open case
  useEffect(() => {
    if (selectedId == null && list.data) {
      const first = list.data.groups.open_clarifications[0] ?? list.data.groups.returned_submissions[0] ?? list.data.all[0];
      if (first) setSelectedId(first.id);
    }
  }, [list.data, selectedId]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["cases"] }); qc.invalidateQueries({ queryKey: ["clar-kpis"] }); qc.invalidateQueries({ queryKey: ["case", selectedId] }); };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try { await fn(); refresh(); toast.success(msg); } catch { toast.error("Action failed."); } finally { setBusy(false); }
  };
  const send = async () => {
    if (!draft.trim() || selectedId == null) return;
    const body = draft; setDraft("");
    await run(() => api.caseMessage(selectedId, side, body), "Message sent.");
  };

  const k = kpis.data;
  const d = detail.data;
  const groups = list.data?.groups;

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="orange" icon={<HelpCircle size={20} />} value={k?.open_clarifications} label="Open Clarifications" sublabel="Requires response" />
          <KpiCard tone="red" icon={<CornerUpLeft size={20} />} value={k?.returned_submissions} label="Returned Submissions" sublabel="Awaiting resubmission" />
          <KpiCard tone="blue" icon={<Clock size={20} />} value={`${k?.avg_response_time ?? 0} days`} label="Avg. Response Time" sublabel="For open clarifications" />
          <KpiCard tone="red" icon={<AlertCircle size={20} />} value={k?.overdue_responses} label="Overdue Responses" sublabel="Past due date" />
          <KpiCard tone="green" icon={<CheckCircle2 size={20} />} value={k?.resolved_items} label="Resolved Items" sublabel="This month" />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* left list */}
          <Card className="col-span-3 flex flex-col p-4">
            <div className="mb-2 flex gap-3 border-b border-border text-sm">
              {(["all", "open", "returned", "resolved"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`pb-2 font-semibold capitalize ${tab === t ? "border-b-2 border-primary text-primary" : "text-text3"}`}>
                  {t} {t !== "resolved" && list.data ? `(${t === "all" ? list.data.counts.all : t === "open" ? list.data.counts.open : list.data.counts.returned})` : ""}
                </button>
              ))}
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cases…" className="mb-3 h-9 rounded-btn border border-border px-3 text-sm" />
            <div className="flex-1 space-y-3 overflow-y-auto" style={{ maxHeight: 620 }}>
              {groups && (tab === "all" || tab === "open") && groups.open_clarifications.length > 0 && (
                <div><div className="mb-1.5 text-[11px] font-semibold uppercase text-text3">Open Clarifications ({groups.open_clarifications.length})</div>
                  <div className="space-y-2">{groups.open_clarifications.map((c) => <CaseCard key={c.id} c={c} selected={selectedId === c.id} onClick={() => setSelectedId(c.id)} />)}</div></div>
              )}
              {groups && (tab === "all" || tab === "returned") && groups.returned_submissions.length > 0 && (
                <div><div className="mb-1.5 text-[11px] font-semibold uppercase text-text3">Returned Submissions ({groups.returned_submissions.length})</div>
                  <div className="space-y-2">{groups.returned_submissions.map((c) => <CaseCard key={c.id} c={c} selected={selectedId === c.id} onClick={() => setSelectedId(c.id)} />)}</div></div>
              )}
              {groups && (tab === "all" || tab === "resolved") && groups.resolved.length > 0 && (
                <div><div className="mb-1.5 text-[11px] font-semibold uppercase text-text3">Resolved (This Month)</div>
                  <div className="space-y-2">{groups.resolved.map((c) => <CaseCard key={c.id} c={c} selected={selectedId === c.id} onClick={() => setSelectedId(c.id)} />)}</div></div>
              )}
            </div>
          </Card>

          {/* center detail */}
          <Card className="col-span-6 flex flex-col">
            {!d ? (
              <div className="flex flex-1 items-center justify-center p-10 text-sm text-text3">Select a case to view details.</div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div className="flex items-center gap-2"><span className="text-base font-semibold text-text1">{d.kind === "return" ? "Return" : "Clarification"} · <span className="font-mono text-primary">{d.ref}</span></span><StatusBadge value={d.status} /></div>
                  <div className="flex items-center gap-1 text-text3"><ChevronLeft size={16} /><ChevronRight size={16} /></div>
                </div>
                <div className="grid grid-cols-4 gap-3 border-b border-border px-5 py-3 text-xs">
                  <div><div className="text-text3">Entity</div><div className="font-semibold text-text1">{d.entity_name}</div></div>
                  <div><div className="text-text3">Data Package</div><div className="font-semibold text-text1">{d.package_label}</div></div>
                  <div><div className="text-text3">Category</div><div className="font-semibold text-text1">{d.category}</div></div>
                  <div><div className="text-text3">Due Date</div><div className={`font-semibold ${(d.sla_days ?? 0) < 0 ? "text-danger" : "text-text1"}`}>{d.due_date} {d.sla_days != null && `(in ${d.sla_days} days)`}</div></div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4">
                  <div><div className="mb-1 text-sm font-semibold text-text1">Issue Summary</div><p className="text-sm text-text2">{d.issue_summary}</p></div>
                  <div><div className="mb-1 text-sm font-semibold text-text1">Requested Corrections</div>
                    {d.corrections.length ? <ul className="list-disc space-y-1 pl-4 text-sm text-text2">{d.corrections.map((c, i) => <li key={i}>{c}</li>)}</ul> : <p className="text-sm text-text3">—</p>}
                  </div>
                </div>
                {/* conversation */}
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" style={{ maxHeight: 320 }}>
                  {d.messages.map((mm) => (
                    <div key={mm.id} className={`flex gap-2.5 ${mm.side === "entity" ? "flex-row-reverse" : ""}`}>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: mm.side === "dghr" ? "#0B1B3B" : "#16A34A" }}>{mm.side === "dghr" ? "DG" : "EN"}</span>
                      <div className={`max-w-[75%] rounded-lg p-3 ${mm.side === "dghr" ? "bg-page" : "bg-success-bg"}`}>
                        <div className="mb-0.5 flex items-center gap-2 text-[11px] text-text3"><span className="font-semibold text-text2">{mm.author}</span> · {mm.author_role} · {relativeTime(mm.created_at)}</div>
                        <div className="text-sm text-text1">{mm.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* composer */}
                <div className="flex items-center gap-2 border-t border-border px-5 py-3">
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a comment…" className="h-10 flex-1 rounded-btn border border-border px-3 text-sm" />
                  <button className="text-text3 hover:text-text1"><Paperclip size={18} /></button>
                  <Button size="sm" onClick={send} disabled={busy || !draft.trim()}><Send size={14} /> Send</Button>
                </div>
              </>
            )}
          </Card>

          {/* right rail */}
          <div className="col-span-3 space-y-4">
            <Card className="p-4">
              <div className="mb-2 text-sm font-semibold text-text1">Quick Actions</div>
              <div className="space-y-1.5">
                {side === "dghr" ? (
                  <>
                    <ActionBtn icon={<CornerDownLeft size={15} />} label="Return to Entity" disabled={!d || busy} onClick={() => d && run(() => api.caseAction(d.id, "return_to_entity"), "Returned to entity.")} />
                    <ActionBtn icon={<FilePlus2 size={15} />} label="Request More Evidence" disabled={!d || busy} onClick={() => d && run(() => api.caseAction(d.id, "request_evidence"), "Evidence requested.")} />
                    <ActionBtn icon={<CheckCheck size={15} />} label="Accept Resubmission" tone="success" disabled={!d || busy} onClick={() => d && run(() => api.caseAction(d.id, "accept_resubmission"), "Resubmission accepted — case resolved.")} />
                    <ActionBtn icon={<ArrowUpCircle size={15} />} label="Escalate" tone="warning" disabled={!d || busy} onClick={() => d && run(() => api.caseAction(d.id, "escalate"), "Case escalated.")} />
                    <ActionBtn icon={<UserPlus size={15} />} label="Assign Reviewer" disabled={!d || busy} onClick={() => toast.message("Reviewer assignment (demo).")} />
                  </>
                ) : (
                  <>
                    <ActionBtn icon={<Send size={15} />} label="Reply" disabled={!d || busy} onClick={() => document.querySelector<HTMLInputElement>('input[placeholder="Write a comment…"]')?.focus()} />
                    <ActionBtn icon={<Paperclip size={15} />} label="Attach Evidence" disabled={!d || busy} onClick={() => toast.success("Evidence attached (demo).")} />
                    <ActionBtn icon={<ThumbsUp size={15} />} label="Acknowledge" disabled={!d || busy} onClick={() => d && run(() => api.caseAction(d.id, "acknowledge"), "Acknowledged.")} />
                    {d?.kind === "return" && <ActionBtn icon={<RotateCcw size={15} />} label="Resubmit Package" tone="success" disabled={busy} onClick={() => d && run(() => api.caseAction(d.id, "resubmit"), "Package resubmitted to DGHR.")} />}
                  </>
                )}
              </div>
            </Card>

            {d && (
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Case Details</div>
                <div className="space-y-2 text-sm">
                  <Row label="Priority"><StatusBadge value={d.priority.toLowerCase()} label={d.priority} /></Row>
                  <Row label="Category"><span className="text-text1">{d.category}</span></Row>
                  <Row label="Assigned To"><span className="text-text1">{d.assigned_to ?? "—"}</span></Row>
                  <Row label="SLA"><span className={(d.sla_days ?? 0) < 0 ? "text-danger" : "text-text1"}>{d.sla_days != null ? `Due in ${d.sla_days} days` : "—"}</span></Row>
                </div>
              </Card>
            )}

            {d && (
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Audit Trail</div>
                <div className="space-y-2.5">
                  {d.audit.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.label.includes("responded") || a.label.includes("acknowledged") || a.label.includes("resubmit") ? "#16A34A" : a.label.includes("follow") || a.label.includes("escalat") ? "#EA8A00" : "#2563EB" }} />
                      <div><div className="text-text1">{a.label}</div><div className="text-text3">{a.actor_name} · {relativeTime(a.created_at)}</div></div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function ActionBtn({ icon, label, onClick, disabled, tone }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "#16A34A" : tone === "warning" ? "#EA8A00" : "#475569";
  return (
    <button onClick={onClick} disabled={disabled} className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2.5 text-left text-sm hover:bg-page disabled:opacity-50">
      <span style={{ color }}>{icon}</span><span className="flex-1 font-medium text-text1">{label}</span><ChevronRight size={14} className="text-text3" />
    </button>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between"><span className="text-text2">{label}</span>{children}</div>;
}
