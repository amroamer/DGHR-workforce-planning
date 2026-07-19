import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Flag, CheckCircle2, XCircle, Send, MessageSquareWarning, Lock, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import type { CalendarEvent } from "@/lib/planning";

const KIND: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  cycle_open: { label: "Cycle opens", color: "#2563EB", icon: <Flag size={13} /> },
  deadline: { label: "Deadline", color: "#E11D48", icon: <AlertTriangle size={13} /> },
  cycle_close: { label: "Cycle closes", color: "#94A3B8", icon: <Lock size={13} /> },
  submitted: { label: "Submitted", color: "#2563EB", icon: <Send size={13} /> },
  approved: { label: "Approved", color: "#15803D", icon: <CheckCircle2 size={13} /> },
  rejected: { label: "Returned", color: "#E11D48", icon: <XCircle size={13} /> },
  decided: { label: "Decided", color: "#7C3AED", icon: <CheckCircle2 size={13} /> },
  clarification: { label: "Clarification", color: "#B45309", icon: <MessageSquareWarning size={13} /> },
};

const fmtDay = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const monthKey = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const daysBetween = (iso: string) => Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);

// S19: the wave against an actual timeline — a Gantt of the collection window with milestone
// diamonds, event pins and a "today" line.
function WaveGantt({ starts_on, deadline, ends_on, events }: { starts_on: string; deadline: string; ends_on: string; events: CalendarEvent[] }) {
  const ms = (s: string) => new Date(s + "T00:00:00").getTime();
  const t0 = ms(starts_on), t1 = Math.max(ms(ends_on), t0 + 86400000), tDead = ms(deadline);
  const span = Math.max(1, t1 - t0);
  const now = Date.now();
  const W = 900, padL = 14, padR = 14, barY = 46, barH = 28;
  const x = (t: number) => padL + ((Math.min(t1, Math.max(t0, t)) - t0) / span) * (W - padL - padR);
  const ticks: { t: number; label: string }[] = [];
  const d = new Date(t0); d.setDate(1);
  for (let g = 0; g < 24 && d.getTime() <= t1; g++) {
    if (d.getTime() >= t0) ticks.push({ t: d.getTime(), label: d.toLocaleDateString("en-GB", { month: "short" }) });
    d.setMonth(d.getMonth() + 1);
  }
  // Merge milestones that land on the same day (deadline often == closes) so labels don't overlap.
  const milestones: [string, number, string][] = [];
  for (const mm of [["Opens", t0, "#2563EB"], ["Deadline", tDead, "#E11D48"], ["Closes", t1, "#94A3B8"]] as [string, number, string][]) {
    const near = milestones.find((x) => Math.abs(x[1] - mm[1]) < 86400000);
    if (near) near[0] = `${near[0]} / ${mm[0]}`;
    else milestones.push([mm[0], mm[1], mm[2]]);
  }
  return (
    <svg viewBox={`0 0 ${W} 150`} className="w-full" style={{ height: 175 }} preserveAspectRatio="xMidYMid meet">
      {/* Gentle, low-key pulse on the current-date marker; disabled under reduced-motion. */}
      <style>{`
        @keyframes calTodayPulse { 0%,100% { opacity:.42; transform:scale(1); } 50% { opacity:.06; transform:scale(2.2); } }
        .cal-today-halo { transform-box: fill-box; transform-origin: center; animation: calTodayPulse 2.6s var(--ease-standard, ease-in-out) infinite; }
        @media (prefers-reduced-motion: reduce) { .cal-today-halo { animation: none; opacity:.3; } }
      `}</style>
      <defs>
        {/* Subtle top-lit sheen along the active timeline — concrete hex (var() is unreliable in SVG paint). */}
        <linearGradient id="wg-sheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.20" />
          <stop offset="0.55" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tk, i) => (
        <g key={i}>
          <line x1={x(tk.t)} y1={28} x2={x(tk.t)} y2={128} stroke="rgb(var(--border))" strokeDasharray="3 4" />
          <text x={x(tk.t) + 4} y={22} fontSize="12" fill="rgb(var(--text-3))">{tk.label}</text>
        </g>
      ))}
      <rect x={x(t0)} y={barY} width={Math.max(2, x(tDead) - x(t0))} height={barH} rx={6} fill="rgb(var(--primary))" opacity={0.92} />
      <rect x={x(tDead)} y={barY} width={Math.max(2, x(t1) - x(tDead))} height={barH} rx={6} fill="rgb(var(--text-3))" opacity={0.28} />
      <rect x={x(t0)} y={barY} width={Math.max(2, x(t1) - x(t0))} height={barH} rx={6} fill="url(#wg-sheen)" />
      <text x={x(t0) + 10} y={barY + 18} fontSize="12" fontWeight="600" fill="#fff">Submission window</text>
      {milestones.map(([lbl, t, c], i) => (
        <g key={i}>
          {/* Standardised milestone markers: uniform diamonds pinned above the window bar. */}
          <path d={`M ${x(t)} ${barY - 20} l 9 9 l -9 9 l -9 -9 z`} fill={c} />
          <text x={x(t)} y={barY + barH + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill="rgb(var(--text-2))">{lbl}</text>
        </g>
      ))}
      {events.map((e, i) => {
        const k = KIND[e.kind] ?? { color: "#94A3B8" };
        return <circle key={i} cx={x(ms(e.date))} cy={barY + barH + 34} r={4.5} fill={k.color}><title>{`${e.title} (${e.date})`}</title></circle>;
      })}
      {now >= t0 && now <= t1 && (
        <g>
          <line x1={x(now)} y1={22} x2={x(now)} y2={132} stroke="#15803D" strokeWidth={2.5} />
          <circle className="cal-today-halo" cx={x(now)} cy={22} r={5} fill="#15803D" />
          <circle cx={x(now)} cy={22} r={3.5} fill="#15803D" />
          <text x={Math.min(W - 40, x(now) + 7)} y={132} fontSize="11" fontWeight="700" fill="#15803D">Today</text>
        </g>
      )}
    </svg>
  );
}

// Programme & Wave Management, real milestones only: the collection cycle's dates plus this entity's own
// submission / decision / clarification activity. Nothing is invented.
export function PlanningCalendar() {
  const { entityId } = useAudience();
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: ["q-calendar", entityId], queryFn: () => api.planning.calendar(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const { data: reminders } = useQuery({ queryKey: ["q-reminders", entityId], queryFn: () => api.planning.entityReminders(entityId!), enabled: entityId != null, refetchInterval: 4000 });

  const cycle = data?.cycle;
  const events = data?.events ?? [];
  const daysLeft = cycle ? daysBetween(cycle.deadline) : 0;

  const groups = events.reduce<Record<string, CalendarEvent[]>>((a, e) => {
    const k = monthKey(e.date);
    return { ...a, [k]: [...(a[k] ?? []), e] };
  }, {});

  return (
    <>
      <PageHeader title="Programme & Wave Management" subtitle="Key dates for this wave and everything that has happened on your submissions." />
      <PageBody>
        {cycle && (
          <Card className="mb-4 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text1">{cycle.name}</div>
                <div className="text-xs text-text3">Status: {cycle.status}</div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-bold ${daysLeft < 0 ? "bg-danger-bg text-danger" : daysLeft <= 14 ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>
                {daysLeft < 0 ? `Deadline passed ${Math.abs(daysLeft)} days ago` : `${daysLeft} days to deadline`}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["Opens", cycle.starts_on], ["Deadline", cycle.deadline], ["Closes", cycle.ends_on]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-border bg-inset p-3">
                  <div className="text-[11px] uppercase tracking-wide text-text3">{l}</div>
                  <div className="nums text-sm font-semibold text-text1">{fmtDay(v)}</div>
                </div>
              ))}
              <div className="rounded-lg border border-border bg-inset p-3">
                <div className="text-[11px] uppercase tracking-wide text-text3">Still to submit</div>
                <div className="nums text-sm font-semibold text-text1">
                  {data?.departments_outstanding ?? 0} of {data?.departments_total ?? 0}
                </div>
              </div>
            </div>
          </Card>
        )}

        {cycle && (
          <Card className="mb-4 p-5">
            <div className="mb-1 text-sm font-semibold text-text1">Wave timeline</div>
            <div className="mb-2 text-xs text-text3">The collection window, its milestones and your activity on one Gantt.</div>
            <WaveGantt starts_on={cycle.starts_on} deadline={cycle.deadline} ends_on={cycle.ends_on} events={events} />
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <Card className="min-w-0 p-0">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Timeline</div>
            {events.length === 0 ? (
              <EmptyState icon={<CalendarDays size={26} />} title="Nothing scheduled yet"
                description="Cycle dates and your submission activity will appear here as the cycle progresses." />
            ) : (
              <div className="p-5">
                {Object.entries(groups).map(([month, list]) => (
                  <div key={month} className="mb-5 last:mb-0">
                    <div className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-text3">{month}</div>
                    <div className="space-y-2.5">
                      {list.map((e, i) => {
                        const k = KIND[e.kind] ?? { label: e.kind, color: "#94A3B8", icon: <CalendarDays size={13} /> };
                        const clickable = e.department_id != null;
                        return (
                          <div key={`${e.date}-${i}`}
                            onClick={() => clickable && navigate(`/entity/departments/${e.department_id}`)}
                            className={`flex items-start gap-3 rounded-lg border border-transparent bg-surface2/40 px-3.5 py-3 transition-colors duration-fast ${clickable ? "cursor-pointer hover:border-border hover:bg-surface2" : ""}`}>
                            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                              style={{ background: `${k.color}1a`, color: k.color }}>{k.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-semibold text-text1">{e.title}</div>
                              {e.detail && <div className="truncate text-xs text-text3">{e.detail}</div>}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="nums text-xs font-semibold text-text2">{fmtDay(e.date)}</div>
                              <div className="text-[11px]" style={{ color: k.color }}>{k.label}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card className="p-5">
              <div className="mb-3 text-sm font-semibold text-text1">Legend</div>
              <div className="space-y-2">
                {Object.entries(KIND).filter(([k]) => k !== "decided").map(([k, v]) => (
                  <div key={k} className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />
                    <span className="text-text2">{v.label}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-sm font-semibold text-text1">Reminders</div>
                {reminders && reminders.total > 0 && <span className="nums text-[11px] text-text3">{reminders.read}/{reminders.total} read</span>}
              </div>
              <p className="mb-3 text-xs text-text3">Sent to your champion and form-fillers, with read receipts.</p>
              {(reminders?.reminders ?? []).length === 0 ? <p className="text-sm text-text3">No reminders sent yet.</p> : (
                <div className="space-y-2">
                  {(reminders?.reminders ?? []).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${r.read ? "bg-success" : "bg-text3/40"}`} />
                      <span className="min-w-0 flex-1 truncate text-text2">{r.recipient_name} <span className="text-text3">({r.recipient_role})</span></span>
                      <span className={`text-[11px] font-semibold ${r.read ? "text-success" : "text-text3"}`}>{r.read ? "Read" : "Sent"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {(data?.departments_outstanding ?? 0) > 0 && (
              <Card className="p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text1"><AlertTriangle size={15} className="text-warning" /> Action needed</div>
                <p className="mb-3 text-sm text-text3">{data?.departments_outstanding} department{(data?.departments_outstanding ?? 0) === 1 ? "" : "s"} still to submit before the deadline.</p>
                <Button size="sm" variant="secondary" onClick={() => navigate("/entity/departments")}>Go to Departments</Button>
              </Card>
            )}
          </aside>
        </div>
      </PageBody>
    </>
  );
}
