import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send, CornerUpLeft, CheckCircle2, MessageSquarePlus } from "lucide-react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/utils";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

// Shared entity detail drawer (SPEC §9.7). Opened from Command Center & Tracker.
// Governance actions are live (§11) — they mutate and the other portal updates within ≤5s.
export function EntityDrawer({
  entityId,
  onClose,
}: {
  entityId: number | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["entity-detail", entityId],
    queryFn: () => api.entityDetail(entityId!),
    enabled: entityId != null,
  });

  const act = async (a: string) => {
    if (entityId == null || !data) return;
    try {
      if (a === "remind") { await api.remind([entityId]); toast.success(`Reminder sent to ${data.name}.`); }
      else if (a === "return") { const r = await api.returnSubmission({ entity_id: entityId }); toast.success(`Submission returned (${r.ref}).`); }
      else if (a === "approve") { await api.approve({ entity_ids: [entityId] }); toast.success(`${data.name} approved.`); }
      else if (a === "clarify") { const r = await api.createCase({ entity_id: entityId, issue_summary: "Please review and clarify your submitted data." }); toast.warning(`Clarification ${r.ref} raised.`); }
      qc.invalidateQueries();
    } catch { toast.error("Action failed."); }
  };

  const actions = data ? (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="secondary" size="sm" onClick={() => act("remind")}><Send size={14} /> Remind</Button>
      <Button variant="secondary" size="sm" onClick={() => act("return")}><CornerUpLeft size={14} /> Return</Button>
      <Button variant="secondary" size="sm" onClick={() => act("clarify")}><MessageSquarePlus size={14} /> Clarify</Button>
      <Button size="sm" onClick={() => act("approve")}><CheckCircle2 size={14} /> Approve</Button>
    </div>
  ) : undefined;

  return (
    <Drawer open={entityId != null} onClose={onClose} title={data ? `${data.name}` : "Entity"} width={460} footer={actions}>
      {!data ? (
        <div className="text-sm text-text3">Loading…</div>
      ) : (
        <div className="space-y-5">
          {/* header */}
          <div className="rounded-card border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-text1">{data.name}</div>
                <div className="text-xs text-text3">
                  {data.code}, {data.wave}, Reviewer: {data.reviewer ?? "Unassigned"}
                </div>
              </div>
              <StatusBadge value={data.overdue ? "overdue" : data.status} label={data.overdue ? "Overdue" : data.status_label} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-text3">Completeness</div>
                <div className="font-semibold text-text1">{data.completeness}%</div>
              </div>
              <div>
                <div className="text-xs text-text3">Quality Score</div>
                <div className="font-semibold text-text1">{data.quality_score ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-text3">Due date</div>
                <div className="font-semibold text-text1">{data.due_date ?? "-"}</div>
              </div>
              <div>
                <div className="text-xs text-text3">Forecasting</div>
                <div className="font-semibold text-text1">{data.forecasting_ready ? "Ready" : "Blocked"}</div>
              </div>
            </div>
            {data.blocked_reason && !data.forecasting_ready && (
              <div className="mt-2 text-xs text-text2">{data.blocked_reason}</div>
            )}
          </div>

          {/* packages */}
          <div>
            <div className="mb-2 text-sm font-semibold text-text1">Package progress</div>
            <div className="space-y-2">
              {data.packages.map((p) => (
                <div key={p.key} className="rounded-lg border border-border bg-card px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text1">{p.name}</span>
                    <StatusBadge value={p.status} />
                  </div>
                  <ProgressBar value={p.progress} showValue className="mt-1.5" />
                </div>
              ))}
            </div>
          </div>

          {/* open cases */}
          {data.open_cases.length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-text1">Open cases</div>
              <div className="space-y-1.5">
                {data.open_cases.map((c) => (
                  <div key={c.ref} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                    <span className="font-mono text-primary">{c.ref}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={c.priority.toLowerCase()} label={c.priority} />
                      <StatusBadge value={c.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* audit */}
          <div>
            <div className="mb-2 text-sm font-semibold text-text1">Recent activity</div>
            <div className="space-y-2">
              {data.audit.length === 0 && <div className="text-xs text-text3">No recent activity.</div>}
              {data.audit.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div>
                    <div className="text-text1">{a.label}</div>
                    <div className="text-xs text-text3">
                      {a.actor_name}, {relativeTime(a.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </Drawer>
  );
}
