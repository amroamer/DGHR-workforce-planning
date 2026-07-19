// Submission pipeline (change request G7): where every department submission sits in the collection
// pipeline (not started -> draft -> submitted -> in clarification -> in review -> approved). One
// reusable component for the government dashboard, the entity dashboard and cycle administration.
import type { PipelineStage, PipelineEntity } from "@/lib/planning";

export const STAGE_COLOR: Record<string, string> = {
  not_started: "rgb(var(--border-strong))",
  draft: "rgb(var(--text-3))",
  submitted: "rgb(var(--primary))",
  in_clarification: "rgb(var(--warning))",
  in_review: "rgb(var(--purple))",
  approved: "rgb(var(--success))",
};

/** A horizontal funnel bar of stage segments + a legend row of stage counts. */
export function SubmissionPipeline({ stages, total, compact = false }: { stages: PipelineStage[]; total: number; compact?: boolean }) {
  const t = Math.max(1, total);
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-page">
        {stages.map((s) => s.count > 0 ? (
          <span key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / t) * 100}%`, background: STAGE_COLOR[s.key] ?? "rgb(var(--border-strong))" }} />
        ) : null)}
      </div>
      <div className={`mt-2.5 flex flex-wrap ${compact ? "gap-x-3 gap-y-1" : "gap-x-4 gap-y-1.5"}`}>
        {stages.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STAGE_COLOR[s.key] ?? "rgb(var(--border-strong))" }} />
            <span className="text-text2">{s.label}</span>
            <b className="tabular-nums text-text1">{s.count}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Per-entity pipeline breakdown: one row per entity, its mini funnel and where it is stuck.
 *  Used on cycle administration and the government dashboard. */
export function PipelineByEntity({ entities, onOpen }: { entities: PipelineEntity[]; onOpen?: (entityId: number) => void }) {
  const stageKeys = ["not_started", "draft", "submitted", "in_clarification", "in_review", "approved"];
  const labels: Record<string, string> = {
    not_started: "Not started", draft: "Draft", submitted: "Submitted",
    in_clarification: "In clarification", in_review: "In review", approved: "Approved",
  };
  const countOf = (e: PipelineEntity, key: string) => e.stages.find((s) => s.key === key)?.count ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase text-text3">
            <th className="px-4 py-2.5">Entity</th>
            <th className="px-3 py-2.5">Pipeline</th>
            {stageKeys.map((k) => (
              <th key={k} className="px-2 py-2.5 text-right" title={labels[k]}>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[k] }} />
                </span>
              </th>
            ))}
            <th className="px-3 py-2.5 text-right">Received</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((e) => (
            <tr key={e.entity_id}
              className={`border-b border-border last:border-0 ${onOpen ? "cursor-pointer hover:bg-page/60" : ""}`}
              onClick={() => onOpen?.(e.entity_id)}>
              <td className="px-4 py-2.5">
                <div className="font-semibold text-text1">{e.name}</div>
                <div className="text-[11px] text-text3">{e.received} of {e.total} received</div>
              </td>
              <td className="w-[26%] px-3 py-2.5">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-page">
                  {e.stages.map((s) => s.count > 0 ? (
                    <span key={s.key} title={`${s.label}: ${s.count}`} style={{ width: `${(s.count / Math.max(1, e.total)) * 100}%`, background: STAGE_COLOR[s.key] ?? "rgb(var(--border-strong))" }} />
                  ) : null)}
                </div>
              </td>
              {stageKeys.map((k) => {
                const c = countOf(e, k);
                return <td key={k} className={`px-2 py-2.5 text-right tabular-nums ${c > 0 ? "text-text1" : "text-text3"}`}>{c || "—"}</td>;
              })}
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-text1">{e.received}/{e.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
