// Shared visual widgets for the Planning pages: donut, current-vs-required mini-bar, stat card,
// plus the Human Capital (workforce) panel and the multi-year demand vs supply projection chart.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  FAMILY_COLOR, FAMILY_LABEL, LEVEL_COLOR, fmtAED,
  type Adjustment, type Family, type FamilySplit, type Supply as SupplyT,
  type WorkforceSummary, type WorkforceLevel, type ProjectionPoint, type SmartRemark,
} from "@/lib/planning";
import { useChartTheme } from "@/lib/useChartTheme";
import { useTone } from "@/lib/tone";

export function StatCard({ icon, tone, value, label, sub }: { icon: React.ReactNode; tone: string; value: React.ReactNode; label: string; sub?: React.ReactNode }) {
  const t = useTone();
  return (
    <div className="rounded-card border border-border bg-card p-5 shadow-card">
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: t.chip(tone), color: t.fg(tone) }}>{icon}</span>
      <div className="nums text-3xl font-bold leading-none text-text1">{value}</div>
      <div className="mt-1.5 text-sm font-semibold text-text1">{label}</div>
      {sub && <div className="text-xs text-text3">{sub}</div>}
    </div>
  );
}

export function Donut({ split, size = 168 }: { split: FamilySplit[]; size?: number }) {
  const c = useChartTheme();
  const total = split.reduce((s, p) => s + p.fte, 0);
  const R = 62, C = 2 * Math.PI * R, cx = size / 2, cy = size / 2;
  let off = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle r={R} cx={cx} cy={cy} fill="none" stroke={c.track} strokeWidth={22} />
        {total > 0 && split.map((p) => {
          const len = (p.fte / total) * C;
          const el = <circle key={p.family} r={R} cx={cx} cy={cy} fill="none" stroke={FAMILY_COLOR[p.family as Family]} strokeWidth={22} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cy})`} strokeLinecap="butt" />;
          off += len; return el;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="30" fontWeight="700" fill={c.text1}>{total}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" letterSpacing="1" fill={c.axis}>REQ FTE</text>
      </svg>
      <div className="flex-1 space-y-1.5">
        {split.length === 0 && <div className="text-sm text-text3">No submitted data yet.</div>}
        {split.map((p) => (
          <div key={p.family} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded" style={{ background: FAMILY_COLOR[p.family as Family] }} />
            <span className="flex-1 text-text2">{FAMILY_LABEL[p.family as Family]}</span>
            <span className="font-semibold tabular-nums text-text1">{p.fte}</span>
            <span className="w-9 text-right text-xs tabular-nums text-text3">{total ? Math.round((p.fte / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MiniBar({ current, required, max }: { current: number; required: number; max: number }) {
  return (
    <div className="w-full min-w-[120px]">
      <div className="h-1.5 rounded-full bg-text3/50" style={{ width: `${Math.min(100, (current / max) * 100)}%` }} />
      <div className="mt-1 h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, (required / max) * 100)}%` }} />
    </div>
  );
}

export function GapPill({ gap }: { gap: number | null }) {
  if (gap == null) return <span className="text-text3">-</span>;
  const cls = gap < 0 ? "bg-danger/10 text-danger" : gap > 0 ? "bg-success/10 text-success" : "bg-page text-text3";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${cls}`}>{gap > 0 ? "+" : ""}{gap}</span>;
}

// ─────────────────────── Human Capital (workforce) ───────────────────────
export function MiniStat({ value, label, sub }: { value: React.ReactNode; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="text-xl font-bold leading-none tabular-nums text-text1 sm:text-2xl">{value}</div>
      <div className="mt-1 text-xs font-semibold text-text2">{label}</div>
      {sub && <div className="text-[11px] text-text3">{sub}</div>}
    </div>
  );
}

/** FTE reads as a decimal only when it actually is one — "62" not "62.0", but "47.5" stays 47.5. */
export function fmtFte(n: number): string {
  const v = Number(n) || 0;
  return (Math.round(v * 100) % 100 === 0 ? Math.round(v) : Number(v.toFixed(2))).toLocaleString();
}

/** Headcount and FTE side by side — PEOPLE and TIME, deliberately never merged into one tile. */
export function HcTiles({ hc }: { hc: WorkforceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      <MiniStat value={hc.headcount.toLocaleString()} label="Headcount" sub="people in post" />
      <MiniStat value={fmtFte(hc.fte)} label="Establishment FTE"
        sub={hc.part_time_fte_gap > 0 ? `${fmtFte(hc.part_time_fte_gap)} below headcount (part-time)` : "all full-time"} />
      <MiniStat value={`${hc.emiratization_pct}%`} label="Emiratization" sub={`${hc.emirati_count.toLocaleString()} Emirati`} />
      <MiniStat value={fmtAED(hc.annual_cost_aed)} label="Annual cost" sub={hc.cost_per_fte ? `${fmtAED(hc.cost_per_fte)}/FTE` : undefined} />
    </div>
  );
}

/** The establishment → people → adjustments → available chain, as one readable ledger.
 *
 *  This panel is the answer to "current FTE and headcount are identical": it shows every step
 *  between an authorised post and an hour of work actually available to plan against, so no reader
 *  has to guess which of the words a number in front of them means. */
export function SupplyChain({ s, compact = false }: { s: SupplyT; compact?: boolean }) {
  const t = useTone();
  const Row = ({ label, value, sub, tone, strong, indent }: {
    label: string; value: React.ReactNode; sub?: string; tone?: string; strong?: boolean; indent?: boolean;
  }) => (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${strong ? "border-t border-border pt-2.5" : ""}`}>
      <div className={`min-w-0 ${indent ? "pl-3" : ""}`}>
        <div className={`truncate text-xs ${strong ? "font-bold text-text1" : "text-text2"}`}>{label}</div>
        {sub && <div className="truncate text-[10px] text-text3">{sub}</div>}
      </div>
      <div className={`shrink-0 nums ${strong ? "text-lg font-bold text-text1" : "text-sm font-semibold text-text2"}`}
        style={{ color: tone ? t.fg(tone) : undefined }}>{value}</div>
    </div>
  );

  return (
    <div>
      <Row label="Approved positions" value={s.approved_positions.toLocaleString()} sub="authorised establishment" />
      <Row label="Filled positions" value={s.filled_positions.toLocaleString()} sub="actual employees in post" indent />
      <Row label="Vacancies" value={s.vacancies.toLocaleString()} indent
        sub={s.approved_positions ? `${s.vacancy_pct}% of approved` : undefined}
        tone={s.vacancies > 0 ? "#B45309" : s.vacancies < 0 ? "#E11D48" : undefined} />
      <Row label="Establishment FTE" value={fmtFte(s.establishment_fte)} strong
        sub={s.part_time_fte_gap > 0 ? `${fmtFte(s.part_time_fte_gap)} FTE below headcount, part-time` : "every person full-time"} />
      {(s.by_kind ?? []).map((b) => (
        <Row key={b.kind} label={b.label} indent
          sub={`${b.count} arrangement${b.count === 1 ? "" : "s"}${b.signed_fte === 0 ? ", excluded from supply" : ""}`}
          value={b.signed_fte === 0 ? `(${fmtFte(b.fte)})` : `${b.signed_fte > 0 ? "+" : "−"}${fmtFte(Math.abs(b.signed_fte))}`}
          tone={b.signed_fte > 0 ? "#15803D" : b.signed_fte < 0 ? "#E11D48" : "#94A3B8"} />
      ))}
      <Row label="Available FTE" value={fmtFte(s.available_fte)} strong sub="what the gap measures against" />
      {!compact && (s.flags ?? []).map((f) => (
        <div key={f} className="mt-2 flex items-start gap-1.5 rounded-lg bg-warning-bg px-2.5 py-1.5 text-[11px] text-warning">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {f}
        </div>
      ))}
    </div>
  );
}

/** The adjustment rows themselves — an amount, a window, and both ends of the move. */
export function AdjustmentList({ rows }: { rows: Adjustment[] }) {
  const t = useTone();
  if (!rows.length) return <p className="text-xs text-text3">No secondments, contractors or temporary resources recorded.</p>;
  return (
    <div className="space-y-2">
      {rows.map((a) => {
        const other = a.kind === "secondment_out" ? a.receiving_department : a.source_department;
        return (
          <div key={a.id} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-semibold text-text1">{a.label || a.kind_label}</span>
              <span className="shrink-0 text-sm font-bold tabular-nums"
                style={{ color: t.fg(a.signed_fte > 0 ? "#15803D" : a.signed_fte < 0 ? "#E11D48" : "#94A3B8") }}>
                {a.signed_fte === 0 ? `(${fmtFte(a.fte)})` : `${a.signed_fte > 0 ? "+" : "−"}${fmtFte(Math.abs(a.signed_fte))}`} FTE
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-text3">
              <span className="rounded bg-page px-1.5 py-0.5 font-semibold text-text2">{a.kind_label}</span>
              {a.headcount > 0 && <span>{a.headcount} {a.headcount === 1 ? "person" : "people"}</span>}
              {(a.starts_on || a.ends_on) && <span>{a.starts_on ?? "-"} → {a.ends_on ?? "open-ended"}</span>}
              {other && <span>{a.kind === "secondment_out" ? "to" : "from"} {other}</span>}
              {!a.counts_in_supply && <span className="font-semibold text-text2">excluded from supply</span>}
              {a.counts_in_supply && !a.active && <span className="font-semibold text-warning">outside its dates</span>}
            </div>
            {a.note && <p className="mt-1 text-[11px] leading-snug text-text3">{a.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Segmented job-level headcount bar + legend (headcount, %, Emiratization per level). */
export function LevelBar({ levels }: { levels: WorkforceLevel[] }) {
  const total = levels.reduce((s, l) => s + l.headcount, 0);
  if (!total) return <div className="text-sm text-text3">No workforce data yet.</div>;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-page">
        {levels.map((l) => l.headcount > 0 ? (
          <span key={l.key} title={`${l.label}: ${l.headcount.toLocaleString()}`} style={{ width: `${l.pct}%`, background: LEVEL_COLOR[l.key] }} />
        ) : null)}
      </div>
      <div className="mt-3 space-y-1.5">
        {levels.map((l) => (
          <div key={l.key} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 shrink-0 rounded" style={{ background: LEVEL_COLOR[l.key] }} />
            <span className="min-w-0 flex-1 truncate text-text2">{l.label}</span>
            <span className="w-14 shrink-0 whitespace-nowrap text-right font-semibold tabular-nums text-text1">{l.headcount.toLocaleString()}</span>
            {/* FTE beside headcount, per level — where the part-timers actually are. */}
            <span className="w-20 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-text3">{fmtFte(l.fte)} FTE</span>
            <span className="w-9 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-text3">{l.pct}%</span>
            <span className="hidden w-20 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-text3 sm:inline">{l.emiratization_pct}% Emr</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────── multi-year demand vs supply projection (G3) ───────────────────────
// Two encodings of the same forecast: a zoomed trend line, and a "gap bridge" waterfall that shows
// what turns today's gap into the horizon-year gap (demand growth + supply erosion).
type ProjMode = "trend" | "bridge";

export function ProjectedGapChart({ points, height = 240 }: { points: ProjectionPoint[]; height?: number }) {
  const c = useChartTheme();
  const [mode, setMode] = useState<ProjMode>("trend");
  if (!points || points.length === 0) {
    return <div className="text-sm text-text3">No projection yet. Submit departments to build the forecast.</div>;
  }
  const n = points.length;
  const shortage = points[n - 1].gap < 0;
  const bandFill = shortage ? c.danger : c.success;
  const SUPPLY = c.neutral, DEMAND = c.primary;

  const toggle = (
    <div className="mb-2 flex justify-end">
      <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-[11px] font-semibold">
        {([["trend", "Trend"], ["bridge", "Gap bridge"]] as [ProjMode, string][]).map(([m, label]) => (
          <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m}
            className={`rounded-md px-2.5 py-1 transition ${mode === m ? "bg-primary text-white shadow-sm" : "text-text2 hover:text-text1"}`}>{label}</button>
        ))}
      </div>
    </div>
  );

  if (mode === "bridge") {
    return <div key="bridge" className="animate-fade">{toggle}<GapBridge points={points} c={c} height={height} /></div>;
  }

  // Zoomed trend line: the y-axis starts near the data's own floor (not 0) so the demand/supply
  // divergence is legible, with labelled gridlines making the zoom explicit.
  const W = 680, H = 300, padL = 60, padR = 18, padT = 20, padB = 42;
  const xAt = (i: number) => padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const vals = points.flatMap((p) => [p.demand, p.supply]);
  const rawMin = Math.min(...vals), rawMax = Math.max(...vals);
  const dspan = Math.max(1, rawMax - rawMin);
  const yMin = Math.max(0, Math.floor(rawMin - dspan * 0.22));
  const yMax = Math.ceil(rawMax + dspan * 0.14);
  const yAt = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);
  const line = (sel: (p: ProjectionPoint) => number) => points.map((p, i) => `${xAt(i)},${yAt(sel(p))}`).join(" ");
  const band = [
    ...points.map((p, i) => `${xAt(i)},${yAt(p.supply)}`),
    ...points.slice().reverse().map((p, i) => `${xAt(n - 1 - i)},${yAt(p.demand)}`),
  ].join(" ");
  const TICKS = 4;
  const gridVals = Array.from({ length: TICKS + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / TICKS);
  const last = points[n - 1];

  return (
    <div key="trend" className="animate-fade">
      {toggle}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line x1={padL} y1={yAt(gv)} x2={W - padR} y2={yAt(gv)} stroke={c.grid} strokeWidth={1}
              opacity={i === 0 ? 1 : 0.45} strokeDasharray={i === 0 ? "" : "3 4"} />
            <text x={padL - 10} y={yAt(gv) + 4} textAnchor="end" fontSize="13" fill={c.axis}>{Math.round(gv).toLocaleString()}</text>
          </g>
        ))}
        <polygon points={band} fill={bandFill} opacity={0.16} />
        <polyline points={line((p) => p.supply)} fill="none" stroke={SUPPLY} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={line((p) => p.demand)} fill="none" stroke={DEMAND} strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.year}>
            <circle cx={xAt(i)} cy={yAt(p.supply)} r={4} fill={SUPPLY} />
            <circle cx={xAt(i)} cy={yAt(p.demand)} r={4} fill={DEMAND} />
            <text x={xAt(i)} y={H - padB + 24} textAnchor="middle" fontSize="13" fontWeight="600" fill={c.axis}>{p.year}</text>
          </g>
        ))}
        <text x={xAt(n - 1)} y={yAt(last.demand) - 11} textAnchor="end" fontSize="14" fontWeight="700" fill={DEMAND}>{last.demand.toLocaleString()}</text>
        <text x={xAt(n - 1)} y={yAt(last.supply) + 20} textAnchor="end" fontSize="14" fontWeight="700" fill={SUPPLY}>{last.supply.toLocaleString()}</text>
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DEMAND }} />Demand (required)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SUPPLY }} />Supply (available)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: bandFill, opacity: 0.5 }} />{shortage ? "Shortage" : "Surplus"}</span>
        <span className="text-text3">axis zoomed to {Math.round(yMin).toLocaleString()}-{Math.round(yMax).toLocaleString()}</span>
      </div>
    </div>
  );
}

// The "gap bridge": how today's gap (supply − demand) becomes the horizon-year gap. Demand growth
// and supply erosion each widen it; both derive from the first and last projection points.
function GapBridge({ points, c, height }: { points: ProjectionPoint[]; c: ReturnType<typeof useChartTheme>; height: number }) {
  const first = points[0], last = points[points.length - 1];
  const gap0 = Math.round(first.gap);
  const gapN = Math.round(last.gap);
  const dDemand = -Math.round(last.demand - first.demand); // demand rising pulls the gap down
  const dSupply = Math.round(last.supply - first.supply);  // supply falling pulls the gap down
  const steps = [
    { key: "today", label: "Gap today", value: gap0, lo: Math.min(0, gap0), hi: Math.max(0, gap0), abs: true },
    { key: "demand", label: "Demand growth", value: dDemand, lo: Math.min(gap0, gap0 + dDemand), hi: Math.max(gap0, gap0 + dDemand), abs: false },
    { key: "supply", label: "Supply erosion", value: dSupply, lo: Math.min(gap0 + dDemand, gapN), hi: Math.max(gap0 + dDemand, gapN), abs: false },
    { key: "horizon", label: `Gap ${last.year}`, value: gapN, lo: Math.min(0, gapN), hi: Math.max(0, gapN), abs: true },
  ];
  const W = 680, H = 300, padL = 60, padR = 18, padT = 26, padB = 46;
  const allV = steps.flatMap((s) => [s.lo, s.hi]).concat(0);
  const vMin = Math.min(...allV), vMax = Math.max(...allV);
  const vspan = Math.max(1, vMax - vMin);
  const yMin = vMin - vspan * 0.14, yMax = vMax + vspan * 0.14;
  const yAt = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const bw = (W - padL - padR) / steps.length;
  const barW = bw * 0.5;
  const zeroY = yAt(0);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="xMidYMid meet">
        <line x1={padL - 6} y1={zeroY} x2={W - padR} y2={zeroY} stroke={c.axis} strokeWidth={1.5} />
        <text x={padL - 12} y={zeroY + 4} textAnchor="end" fontSize="13" fill={c.axis}>0</text>
        {steps.map((s, i) => {
          const cx = padL + bw * i + bw / 2;
          const top = yAt(s.hi), bottom = yAt(s.lo);
          const fill = s.value < 0 ? c.danger : s.value > 0 ? c.success : c.neutral;
          const labelAbove = top <= zeroY;
          return (
            <g key={s.key}>
              <rect x={cx - barW / 2} y={top} width={barW} height={Math.max(2, bottom - top)} rx={3} fill={fill} opacity={s.abs ? 0.92 : 0.72} />
              <text x={cx} y={labelAbove ? top - 9 : bottom + 18} textAnchor="middle" fontSize="14" fontWeight="700" fill={c.text1}>{s.value > 0 ? "+" : ""}{s.value.toLocaleString()}</text>
              <text x={cx} y={H - padB + 22} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={c.axis}>{s.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[11px] leading-relaxed text-text3">How today's gap becomes the {last.year} gap: demand growth and supply erosion (attrition, if unbackfilled) each widen it. A negative gap is a shortfall.</p>
    </div>
  );
}

export function ProjectedGapTable({ points }: { points: ProjectionPoint[] }) {
  if (!points?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-text3">
            <th className="py-1 font-semibold">Year</th>
            <th className="py-1 text-right font-semibold">Demand</th>
            <th className="py-1 text-right font-semibold">Supply</th>
            <th className="py-1 text-right font-semibold">Gap</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.year} className="border-t border-border">
              <td className="py-1.5 tabular-nums text-text2">{p.year}</td>
              <td className="py-1.5 text-right tabular-nums text-text1">{p.demand.toLocaleString()}</td>
              <td className="py-1.5 text-right tabular-nums text-text1">{p.supply.toLocaleString()}</td>
              <td className="py-1.5 text-right"><GapPill gap={p.gap} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Smart remarks (G6): a number translated into a recommended reviewer action. Tone + label + action
// all come from the API (services/sizing.py smart_remark); nothing is decided in the UI.
const REMARK_TONE: Record<SmartRemark["tone"], { bg: string; fg: string }> = {
  clean: { bg: "bg-success-bg", fg: "text-success" },
  shortage: { bg: "bg-danger-bg", fg: "text-danger" },
  surplus: { bg: "bg-warning-bg", fg: "text-warning" },
  high_surplus: { bg: "bg-purple-bg", fg: "text-purple" },
};

export function SmartRemarkCell({ remark }: { remark?: SmartRemark | null }) {
  if (!remark) return <span className="text-text3">-</span>;
  const t = REMARK_TONE[remark.tone] ?? REMARK_TONE.clean;
  return (
    <div className="flex flex-col gap-0.5">
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.bg} ${t.fg}`}>{remark.label}</span>
      <span className="text-[11px] leading-tight text-text3">{remark.action}</span>
    </div>
  );
}

// A simple horizontal distribution (S5 tenure, and reusable). Bars scale to the largest bucket.
export function DistributionBars({ items }: { items: { label: string; headcount: number; pct: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.headcount));
  if (!items.length) return <p className="text-sm text-text3">No workforce data yet.</p>;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 truncate text-xs text-text2">{it.label}</span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-page">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(it.headcount / max) * 100}%` }} />
          </div>
          <span className="w-12 shrink-0 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-text1">{it.headcount.toLocaleString()}</span>
          <span className="w-10 shrink-0 whitespace-nowrap text-right text-[11px] tabular-nums text-text3">{it.pct}%</span>
        </div>
      ))}
    </div>
  );
}

export function ReceivedChip({ received, total }: { received: number; total: number }) {
  const full = total > 0 && received === total;
  const some = received > 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs font-semibold tabular-nums text-text2">{received}/{total}</span>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-page">
        <span className={`block h-full rounded-full ${full ? "bg-success" : some ? "bg-primary" : "bg-border"}`} style={{ width: `${total ? (received / total) * 100 : 0}%` }} />
      </span>
    </span>
  );
}
