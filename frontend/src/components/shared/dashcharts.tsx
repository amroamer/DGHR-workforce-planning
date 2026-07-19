import * as React from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, Treemap, XAxis, YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChartTheme, useAnimateOnKey, tooltipProps } from "@/lib/useChartTheme";
import { useTone } from "@/lib/tone";
import { LEVEL_COLOR, type JobLevelKey } from "@/lib/planning";

// Final-value emphasis (§13): a bold label drawn ONLY on a series' last point. Recharts
// calls the content fn per point; we render only when index === last. Works for bars
// (x,y,width given) and lines/areas (x,y given, no width).
function lastValueLabel(lastIdx: number, fill: string, fmt?: (v: number) => string,
  collide?: { registry: Map<number, number>; self: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (p: any) => {
    if (p == null || p.index !== lastIdx || p.value == null) return null;
    const cx = p.x + (p.width ? p.width / 2 : 0);
    let cy = p.y - 8;
    if (collide) {
      // Multi-series charts: converging series end close together and their labels
      // overlap. Each label registers its rendered y; later ones nudge below any
      // earlier label they'd hit. Uses REAL pixel positions, so it stays correct.
      for (let guard = 0; guard < 8; guard++) {
        let moved = false;
        for (const [k, y] of collide.registry) {
          if (k !== collide.self && Math.abs(cy - y) < 15) { cy = y + 15; moved = true; }
        }
        if (!moved) break;
      }
      collide.registry.set(collide.self, cy);
    }
    // Whole-number callout by default (§4.3 — no noisy decimals on exec charts); the
    // tooltip still carries full precision. A `fmt` (e.g. currency) wins when provided.
    const text = typeof p.value === "number" ? (fmt ? fmt(p.value) : Math.round(p.value).toLocaleString()) : String(p.value);
    return (
      <text x={cx} y={cy} textAnchor="middle" fontSize={13} fontWeight={700} fill={fill}>{text}</text>
    );
  };
}

// Categorical palette (design-system tokens) — reads on both light cards and dark navy cards.
export const CAT = ["#2563EB", "#0D9488", "#7C3AED", "#B45309", "#E11D48", "#0EA5E9", "#15803D", "#DB2777"];
export const catColor = (i: number) => CAT[i % CAT.length];
const LEVELS: JobLevelKey[] = ["managers", "professionals", "associate_professionals", "clerical_support"];
const LEVEL_NAME: Record<JobLevelKey, string> = {
  managers: "Managers", professionals: "Professionals",
  associate_professionals: "Associate Professionals", clerical_support: "Clerical Support & Below",
};

// Grow-in gate: false on first paint, true right after mount, so width/scale transitions
// animate from their zero state once. Honours prefers-reduced-motion (starts grown).
function useGrowOnMount(): boolean {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [grown, setGrown] = React.useState(!!reduce);
  React.useEffect(() => {
    if (reduce) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return grown;
}

// ─────────────── Panel (card + title + provenance chip) ───────────────
export function ProvenanceChip({ live }: { live: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
      live ? "bg-success-bg text-success" : "bg-purple-bg text-purple")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-success" : "bg-purple")} />
      {live ? "Live" : "Illustrative reference"}
    </span>
  );
}

export function Panel({ title, subtitle, live, action, className, children }: {
  title?: React.ReactNode; subtitle?: React.ReactNode; live?: boolean;
  action?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-card border border-border bg-card p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg sm:p-5", className)}>
      {(title || action || live != null) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <div className="text-sm font-semibold text-text1">{title}</div>}
            {subtitle && <div className="mt-0.5 text-xs text-text3">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {action}
            {/* Live is the page-wide default (noted once beside the controls) — only the
                exception, "Illustrative reference", earns a chip on the card. */}
            {live === false && <ProvenanceChip live={live} />}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

// ─────────────── Page tabs (underline) — the top-level view switch ───────────────
// Deliberately distinct from Segmented (the in-panel chart toggle) so "change the page"
// reads differently from "change this chart".
export function PageTabs<T extends string>({ value, options, onChange }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-6 border-b border-border" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn("relative -mb-px border-b-2 px-0.5 pb-2.5 pt-1 text-[15px] font-semibold transition-colors",
            value === o.value ? "border-primary text-text1" : "border-transparent text-text3 hover:text-text2")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────── Segmented control + Select (themed) ───────────────
export function Segmented<T extends string>({ value, options, onChange, size = "md" }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-page p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("rounded-md font-semibold transition",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
            value === o.value ? "bg-card text-primary shadow-sm" : "text-text2 hover:text-text1")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: {
  label?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-text3">{label}</span>}
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}
        className="select-field h-9 rounded-btn border border-border bg-card px-2.5 text-sm font-semibold text-text1">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// ─────────────── KPI tile (value + label + sub + optional YoY / progress) ───────────────
export function KpiTile({ value, label, sub, tone, yoy, progress }: {
  value: React.ReactNode; label: string; sub?: string; tone?: string;
  yoy?: number; progress?: { value: number; target: number };
}) {
  const t = useTone();
  const c = useChartTheme();
  const pct = progress && progress.target > 0 ? Math.min(100, Math.round((progress.value / progress.target) * 100)) : null;
  return (
    // h-full + flex-col so tiles fill their grid row: progress pins to the bottom, and a
    // tile without progress centers its figure instead of leaving dead space beneath it.
    <div className={cn("flex h-full flex-col rounded-card border border-border bg-card p-4 shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg", pct == null && "justify-center")}>
      <div className="flex items-baseline gap-2">
        <div className="nums text-[26px] font-bold leading-none tracking-tight text-text1 sm:text-[30px]">{value}</div>
        {yoy != null && (
          <span className="inline-flex items-center gap-0.5 text-xs font-bold" style={{ color: yoy >= 0 ? c.success : c.danger }}>
            {yoy >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(yoy)}%
          </span>
        )}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-text1">{label}</div>
      {sub && <div className="text-xs text-text3">{sub}</div>}
      {pct != null && (
        <div className="mt-auto pt-2.5">
          <div className="h-1.5 overflow-hidden rounded-full bg-page">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: tone ? t.fg(tone) : c.primary }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-text3">
            <span>Current progress</span><span>{pct}% of target</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────── Segmented job-level bar (Employment by Job Level) ───────────────
export function LevelMixBar({ levels }: { levels: { key: string; label: string; pct: number; headcount?: number }[] }) {
  const total = levels.reduce((s, l) => s + l.pct, 0);
  if (!total) return <div className="text-sm text-text3">No workforce data.</div>;
  return (
    <div>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-page">
        {levels.map((l, i) => l.pct > 0 && (
          <span key={l.key} title={`${l.label}: ${l.pct}%`} className="transition-[width] duration-700 ease-out"
            style={{ width: `${l.pct}%`, background: LEVEL_COLOR[l.key] ?? catColor(i) }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {levels.map((l, i) => (
          <div key={l.key} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded" style={{ background: LEVEL_COLOR[l.key] ?? catColor(i) }} />
            <span className="flex-1 truncate text-text2">{l.label}</span>
            <span className="font-semibold tabular-nums text-text1">{l.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Employment combo: bars + target line, OR stacked-by-level ───────────────
export function EmploymentChart({ data, byLevel, barLabel = "Employment", lineLabel = "Target", height = 300, animKey }: {
  data: { year: number; employment?: number; target?: number }[];
  byLevel?: { year: number }[]; // stacked LevelYear[] when provided
  barLabel?: string; lineLabel?: string; height?: number;
  /** re-animates when this changes (scope/basis/scenario switch) — inert across polls */
  animKey?: string;
}) {
  const c = useChartTheme();
  const anim = useAnimateOnKey(animKey);
  if (byLevel && byLevel.length) {
    return (
      <div>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={byLevel} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={44} />
            <Tooltip {...tooltipProps(c)} cursor={{ fill: c.axis, fillOpacity: 0.06 }} />
            {LEVELS.map((k, i) => (
              <Bar key={k} dataKey={k} name={LEVEL_NAME[k]} stackId="a" fill={LEVEL_COLOR[k] ?? catColor(i)}
                radius={i === 0 ? [3, 3, 0, 0] : undefined} maxBarSize={46} isAnimationActive={anim} animationDuration={650} animationEasing="ease-out" />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <Legend items={LEVELS.map((k, i) => ({ label: LEVEL_NAME[k], color: LEVEL_COLOR[k] ?? catColor(i) }))} />
      </div>
    );
  }
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 22, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={44} />
          <Tooltip {...tooltipProps(c)} cursor={{ fill: c.axis, fillOpacity: 0.06 }} />
          <Bar dataKey="employment" name={barLabel} fill={c.primary} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={anim} animationDuration={650} animationEasing="ease-out">
            <LabelList dataKey="employment" content={lastValueLabel(data.length - 1, c.primary)} />
          </Bar>
          {data.some((d) => d.target != null) && (
            <Line type="monotone" dataKey="target" name={lineLabel} stroke={c.text1} strokeWidth={2}
              dot={{ r: 3, fill: c.text1 }} isAnimationActive={anim} animationDuration={750} animationEasing="ease-out" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <Legend items={[{ label: barLabel, color: c.primary }, ...(data.some((d) => d.target != null) ? [{ label: lineLabel, color: c.text1 }] : [])]} />
    </div>
  );
}

// ─────────────── Area trend (cost) with formatter ───────────────
export function AreaTrend({ data, yKey, format, height = 240, animKey }: {
  data: Record<string, number>[]; yKey: string; format?: (v: number) => string; height?: number; animKey?: string;
}) {
  const c = useChartTheme();
  const anim = useAnimateOnKey(animKey, 750);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 22, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="areaTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.primary} stopOpacity={0.22} />
            <stop offset="100%" stopColor={c.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="year" tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={52}
          tickFormatter={(v) => (format ? format(Number(v)) : String(v))} />
        <Tooltip {...tooltipProps(c)} formatter={(v: number) => (format ? format(Number(v)) : v)} />
        <Area type="monotone" dataKey={yKey} stroke={c.primary} strokeWidth={2.5} fill="url(#areaTrendFill)"
          dot={{ r: 3, fill: c.primary }} isAnimationActive={anim} animationDuration={750} animationEasing="ease-out">
          <LabelList dataKey={yKey} content={lastValueLabel(data.length - 1, c.primary, format)} />
        </Area>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─────────────── Demographic donut (buckets + legend) ───────────────
export function DemographicDonut({ buckets, height = 150, colors, animKey }: {
  buckets: { bucket: string; label: string; headcount: number; pct: number }[]; height?: number; colors?: string[]; animKey?: string;
}) {
  const anim = useAnimateOnKey(animKey);
  const data = buckets.filter((b) => b.headcount > 0);
  const total = buckets.reduce((s, b) => s + b.headcount, 0);
  const pal = colors ?? CAT;
  // Hover state shared by slice ↔ legend so either one highlights the other and drives
  // the center readout. `null` = resting (center shows the largest bucket).
  const [active, setActive] = React.useState<string | null>(null);
  if (!total) return <div className="grid h-[150px] place-items-center text-sm text-text3">No data</div>;
  const colorOf = (bucket: string) => pal[data.findIndex((d) => d.bucket === bucket) % pal.length];
  const shown = (active && buckets.find((b) => b.bucket === active)) || data[0];
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="headcount" innerRadius={height * 0.34} outerRadius={height * 0.48}
              paddingAngle={1} stroke="none" isAnimationActive={anim} animationDuration={650} animationEasing="ease-out"
              onMouseEnter={(_, i) => setActive(data[i]?.bucket ?? null)} onMouseLeave={() => setActive(null)}>
              {data.map((d, i) => (
                <Cell key={d.bucket} fill={pal[i % pal.length]}
                  fillOpacity={active && d.bucket !== active ? 0.3 : 1}
                  style={{ transition: "opacity .2s" }} />
              ))}
            </Pie>
            {/* No Recharts <Tooltip>: on a small donut it lands dead-centre and collides with the
                readout below. The centre + legend already show label · % · count on hover. */}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
          <div className="nums text-xl font-bold tracking-tight text-text1">{shown?.pct}%</div>
          <div className="max-w-full truncate text-[10px] text-text3">{shown?.label}</div>
          {shown && <div className="nums text-[10px] text-text3">{shown.headcount.toLocaleString()}</div>}
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {buckets.map((b, i) => (
          <div key={b.bucket}
            onMouseEnter={() => b.headcount > 0 && setActive(b.bucket)} onMouseLeave={() => setActive(null)}
            className={cn("flex cursor-default items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors",
              active === b.bucket ? "bg-surface2" : "hover:bg-surface2/60",
              active && active !== b.bucket && "opacity-45")}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.headcount > 0 ? colorOf(b.bucket) : pal[i % pal.length] }} />
            <span className="flex-1 truncate text-text2">{b.label}</span>
            <span className="nums font-semibold text-text1">{b.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────── Half-donut gauge (actual vs target) ───────────────
export function Gauge({ value, target, label, size = 200 }: { value: number; target: number; label?: string; size?: number }) {
  const c = useChartTheme();
  const t = useTone();
  // Geometry derived so the full semicircle + round caps sit INSIDE the viewBox
  // (cy used to overshoot H, clipping the arc bottom and the % readout).
  const w = size * 0.09, R = size * 0.42, W = size, cx = size / 2;
  const cy = R + w / 2 + 4, H = cy + w / 2 + 2;
  const pol = (frac: number, r: number) => {
    const a = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const arc = (frac: number, r: number, w: number, color: string) => {
    const [x0, y0] = pol(0, r), [x1, y1] = pol(frac, r);
    const large = frac > 0.5 ? 1 : 0;
    return <path d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />;
  };
  const frac = target > 0 ? value / 100 : 0;
  const good = value >= target;
  const [tx, ty] = pol(target / 100, R);
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: size }}>
        {arc(1, R, w, c.track)}
        {arc(frac, R, w, good ? c.success : c.primary)}
        <line x1={cx + (R - size * 0.07) * Math.cos(Math.PI * (1 - target / 100))}
          y1={cy - (R - size * 0.07) * Math.sin(Math.PI * (1 - target / 100))} x2={tx} y2={ty}
          stroke={c.danger} strokeWidth={2} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={size * 0.2} fontWeight={700} fill={c.text1}>{value}%</text>
      </svg>
      <div className="-mt-1 text-center text-xs text-text3">
        {label ?? "vs target"} <b style={{ color: t.fg(good ? c.success : c.danger) }}>{target}%</b>
        {!good && target > 0 && <span className="text-text3">, {Math.round((target - value) * 10) / 10}pt to go</span>}
      </div>
    </div>
  );
}

// ─────────────── Dual-line gap by level (excess demand ↑ / supply ↓) ───────────────
export function GapDualLine({ series, height = 240, animKey }: {
  series: { key: string; label: string; points: { year: number; gap: number }[] }[]; height?: number; animKey?: string;
}) {
  const c = useChartTheme();
  const anim = useAnimateOnKey(animKey, 750);
  if (!series.length) return <div className="text-sm text-text3">No projection.</div>;
  const years = series[0].points.map((p) => p.year);
  const data = years.map((year, idx) => {
    const row: Record<string, number> = { year };
    series.forEach((s) => { row[s.key] = s.points[idx]?.gap ?? 0; });
    return row;
  });
  const colors = [c.primary, "#c07f2a", c.success, "#7a5fa0"];
  const lastIdx = data.length - 1;
  // Shared per-render registry of end-label pixel positions so converging series don't
  // draw their value labels on top of each other (resolved inside lastValueLabel).
  const labelRegistry = new Map<number, number>();
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 16, right: 28, left: -6, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={44} />
          <ReferenceLine y={0} stroke={c.axis} strokeDasharray="3 3" />
          <Tooltip {...tooltipProps(c)} />
          {series.map((s, i) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colors[i % colors.length]}
              strokeWidth={2} dot={{ r: 2.5 }} isAnimationActive={anim} animationDuration={750} animationEasing="ease-out">
              {/* Final-value emphasis on each line (§13), collision-nudged via the registry. */}
              <LabelList dataKey={s.key} content={lastValueLabel(lastIdx, colors[i % colors.length], undefined, { registry: labelRegistry, self: i })} />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-between text-[10px] text-text3">
        <span>▲ Excess demand (vacancies)</span><span>▼ Excess supply (surplus)</span>
      </div>
      <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i % colors.length] }))} />
    </div>
  );
}

// ─────────────── Rank list (label + value bar) ───────────────
export function RankList({ rows, valueFmt, accent }: {
  rows: { label: string; value: number; sub?: string }[]; valueFmt?: (v: number) => string; accent?: string;
}) {
  const c = useChartTheme();
  const grown = useGrowOnMount(); // bars start at 0 width and grow in once
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="min-w-0 truncate text-text1">{r.label}{r.sub && <span className="ml-1 text-text3">{r.sub}</span>}</span>
            <span className="shrink-0 font-semibold tabular-nums text-text2">{valueFmt ? valueFmt(r.value) : r.value.toLocaleString()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-page">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: grown ? `${(r.value / max) * 100}%` : 0, transitionDelay: `${i * 45}ms`, background: accent ?? c.primary }} />
          </div>
        </div>
      ))}
      {!rows.length && <div className="text-sm text-text3">Nothing to show.</div>}
    </div>
  );
}

// ─────────────── Pct-change list (skills / growing-declining) ───────────────
export function PctList({ rows, positive }: { rows: { label: string; pct: number | null; rank?: number }[]; positive?: boolean }) {
  const c = useChartTheme();
  return (
    <ol className="space-y-1.5">
      {rows.map((r, i) => {
        const up = positive ?? ((r.pct ?? 0) >= 0);
        return (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className="w-4 shrink-0 text-right text-xs tabular-nums text-text3">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-text1">{r.label}</span>
            {r.pct != null && (
              <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums"
                style={{ color: up ? c.success : c.danger }}>
                {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(r.pct)}%
              </span>
            )}
          </li>
        );
      })}
      {!rows.length && <div className="text-sm text-text3">No data.</div>}
    </ol>
  );
}

// ─────────────── Treemap (educational background) ───────────────
export function MiniTreemap({ rows, height = 220 }: { rows: { label: string; value: number }[]; height?: number }) {
  const c = useChartTheme();
  const data = rows.map((r, i) => ({ name: r.label, size: r.value, fill: catColor(i) }));
  if (!data.length) return <div className="grid h-[200px] place-items-center text-sm text-text3">No data</div>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <Treemap data={data} dataKey="size" stroke={c.tooltipBg} isAnimationActive={false}
        content={<TreeCell />}>
        <Tooltip {...tooltipProps(c)} />
      </Treemap>
    </ResponsiveContainer>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TreeCell(props: any) {
  const { x, y, width, height, name, fill, value, size } = props;
  const pct = Math.round(value ?? size ?? 0);
  const showName = width > 54 && height > 28;
  const showPct = width > 44 && height > 46;
  // paintOrder="stroke" lays a soft dark outline BEHIND the white fill, so the label stays legible
  // on any tile colour (teal/orange/blue) without the jagged look of an on-top stroke.
  const halo = { paintOrder: "stroke" as const, strokeLinejoin: "round" as const, style: { pointerEvents: "none" as const } };
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="none" />
      {showName && (
        <text x={x + 8} y={y + 19} fontSize={11.5} fontWeight={700} fill="#fff" stroke="rgba(15,23,42,.45)" strokeWidth={3} {...halo}>{name}</text>
      )}
      {showPct && (
        <text x={x + 8} y={y + 36} fontSize={11} fontWeight={600} fill="rgba(255,255,255,.82)" stroke="rgba(15,23,42,.4)" strokeWidth={2.5} {...halo}>{pct}%</text>
      )}
    </g>
  );
}

// ─────────────── shared legend ───────────────
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-[11px] text-text2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  );
}

// ─────────────── loading skeletons (shimmer placeholders shaped like the layout) ───────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface2", className)} />;
}

export function SkeletonPanel({ body = "h-40", className }: { body?: string; className?: string }) {
  return (
    <div className={cn("rounded-card border border-border bg-card p-4 shadow-card sm:p-5", className)}>
      <Skeleton className="mb-3 h-4 w-36" />
      <Skeleton className={body} />
    </div>
  );
}

/** First-load placeholder for the executive dashboards: hero row + KPI strip. */
export function DashSkeleton({ hero = false }: { hero?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className={cn("mb-4 grid gap-4", hero && "lg:grid-cols-[minmax(0,1fr)_320px]")}>
        <SkeletonPanel body="h-[300px]" />
        {hero && <SkeletonPanel body="h-[280px]" />}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <SkeletonPanel key={i} body="h-12" />)}
      </div>
    </div>
  );
}

// ─────────────── ranked table (universities / hotspots / majors) ───────────────
export function RankTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase text-text3">
            {head.map((h, i) => <th key={i} className={cn("py-2", i === 0 ? "pl-1" : "px-2", i === head.length - 1 && "pr-1 text-right")}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/60 last:border-0">
              {r.map((cell, ci) => (
                <td key={ci} className={cn("py-2 tabular-nums", ci === 0 ? "pl-1 font-semibold text-text2" : "px-2 text-text1",
                  ci === r.length - 1 && "pr-1 text-right")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
