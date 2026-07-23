import { useQuery } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, Timer, UserX, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { CycleHistoryRow } from "@/lib/planning";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { THEAD_TR, TH, TH_NUM, TROW, TD, TD_NUM } from "@/components/ui/table";
import { GroupedBarChart, Sparkline } from "@/components/shared/charts";
import { StatCard } from "./widgets";

const BADGE: Record<string, { value: string; label: string }> = {
  open: { value: "submitted", label: "Open" },
  closed: { value: "approved", label: "Closed" },
  draft: { value: "draft", label: "Draft" },
  archived: { value: "not_started", label: "Archived" },
};
const short = (name: string) => name.replace(/\s*Planning Cycle$/i, "");
const turn = (d: number) => (d > 0 ? `${d.toFixed(1)}d` : "-");

export function PlanningCyclesHistory() {
  const { data } = useQuery({ queryKey: ["q-cycles-history"], queryFn: api.planning.cyclesHistory, refetchInterval: 4000 });
  const cycles = data?.cycles ?? [];
  const ran = cycles.filter((c) => c.ran);
  const latest = ran[ran.length - 1] as CycleHistoryRow | undefined;
  const prior = ran[ran.length - 2] as CycleHistoryRow | undefined;
  const chronic = data?.chronically_late ?? [];

  // deltas vs the previous cycle — the whole point of tracking more than one. Round the turnaround
  // delta to 1dp so a float like 5.2 − 8.6 reads "-3.4d", not "-3.3999999999999995d".
  const dRecv = latest && prior ? latest.received_pct - prior.received_pct : null;
  const dTurn = latest && prior && latest.avg_turnaround_days && prior.avg_turnaround_days
    ? Math.round((latest.avg_turnaround_days - prior.avg_turnaround_days) * 10) / 10 : null;

  const chartData = ran.map((c) => ({ group: short(c.name), received: c.received_pct, approved: c.approved_pct }));
  const turnData = ran.map((c) => c.avg_turnaround_days);
  const delta = (v: number | null, unit: string, goodWhenNegative = false) => {
    if (v == null || v === 0) return null;
    const good = goodWhenNegative ? v < 0 : v > 0;
    return <span className={good ? "text-success" : "text-danger"}>{v > 0 ? "+" : ""}{v}{unit} vs last</span>;
  };

  return (
    <>
      <PageHeader title="Cycle History"
        subtitle="Every collection cycle and how it went: completion, sign-off turnaround, and who's chronically behind." />
      <PageBody>
        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={<CalendarClock size={20} />} tone="#2563EB" value={data?.cycles_run ?? 0} label="Cycles run" sub="Opened at least once" />
          <StatCard icon={<CheckCircle2 size={20} />} tone="#15803D" value={latest ? `${latest.received_pct}%` : "-"}
            label="Latest received" sub={delta(dRecv, "pp") ?? (latest ? short(latest.name) : "-")} />
          <StatCard icon={<Timer size={20} />} tone="#B45309" value={latest ? turn(latest.avg_turnaround_days) : "-"}
            label="Sign-off turnaround" sub={delta(dTurn, "d", true) ?? "avg submit → decision"} />
          <StatCard icon={<UserX size={20} />} tone="#E11D48" value={chronic.length} label="Chronically late" sub="Behind in ≥2 cycles" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <div className="mb-1 text-sm font-semibold text-text1">Completion across cycles</div>
            <div className="mb-3 text-xs text-text3">Share of departments received and signed off, per cycle.</div>
            {chartData.length === 0 ? (
              <p className="py-10 text-center text-sm text-text3">No cycles have run yet.</p>
            ) : (
              <GroupedBarChart data={chartData} series={[
                { key: "received", name: "Received %", color: "#15803D" },
                { key: "approved", name: "Approved %", color: "#2563EB" },
              ]} />
            )}
            {turnData.some((d) => d > 0) && (
              <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                <span className="flex items-center gap-2 text-xs font-semibold text-text2"><Clock size={15} className="text-warning" /> Sign-off turnaround</span>
                <Sparkline data={turnData} color="#B45309" width={128} height={30} />
                <span className="ml-auto text-xs font-semibold text-text2 nums">{ran.map((c) => turn(c.avg_turnaround_days)).join(" → ")}</span>
              </div>
            )}
          </Card>

          <Card className="min-w-0 p-0">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-text1"><UserX size={15} className="text-danger" /> Chronically late</span>
              <span className="text-xs font-semibold text-text3 nums">{chronic.length}</span>
            </div>
            {chronic.length === 0 ? (
              <p className="p-5 text-sm text-text3">No entity has fallen behind in more than one cycle.</p>
            ) : (
              <div className="divide-y divide-border">
                {chronic.map((e) => (
                  <div key={e.code} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-text1">{e.name}</div>
                      <div className="mt-0.5 text-[11px] text-text3">{e.code}</div>
                    </div>
                    <StatusBadge value="high" label={`${e.cycles_late} cycles`} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-4 min-w-0 p-0">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">All cycles</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className={THEAD_TR}>
                <th className={`${TH} pl-5`}>Cycle</th><th className={TH}>Window</th><th className={TH}>Status</th>
                <th className={TH_NUM}>Received</th><th className={TH_NUM}>Approved</th>
                <th className={TH_NUM}>Turnaround</th><th className={`${TH} pr-5`}>Run by</th>
              </tr></thead>
              <tbody>
                {[...cycles].reverse().map((c) => (
                  <tr key={c.id} className={TROW}>
                    <td className={`${TD} pl-5 font-semibold`}>{c.name}</td>
                    <td className={`${TD} text-text2`}>{c.starts_on} → {c.ends_on}</td>
                    <td className={TD}><StatusBadge {...(BADGE[c.status] ?? { value: c.status, label: c.status })} /></td>
                    <td className={TD_NUM}>{c.ran ? `${c.received_pct}%` : "-"}<span className="ml-1 text-[11px] font-normal text-text3">{c.ran ? `(${c.received}/${c.departments_total})` : ""}</span></td>
                    <td className={TD_NUM}>{c.ran ? `${c.approved_pct}%` : "-"}</td>
                    <td className={`${TD_NUM} text-text2`}>{turn(c.avg_turnaround_days)}</td>
                    <td className={`${TD} pr-5 text-text3`}>{c.opened_by || "-"}{c.closed_by ? `, closed by ${c.closed_by}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
