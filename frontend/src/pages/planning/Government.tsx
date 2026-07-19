import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Users, Target, TrendingUp, Building2, ArrowUpRight, AlertTriangle, ShieldCheck, FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TraceableValue } from "@/components/shared/TraceableValue";
import type { BasisKey, Coverage, RollupStatus } from "@/lib/planning";
import { useTone } from "@/lib/tone";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Acronym } from "@/components/shared/Acronym";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { MiniBar, GapPill, ReceivedChip, HcTiles, LevelBar, ProjectedGapChart, SupplyChain, SmartRemarkCell, fmtFte } from "./widgets";
import { SubmissionPipeline } from "@/components/shared/SubmissionPipeline";
import { AskDataPanel } from "@/components/shared/AskDataPanel";

// §19.4: Net Gap is the hero KPI (emphasis → tone-coloured value + tone border + stronger
// elevation); Entities Received is secondary (quiet → smaller, muted value).
function Kpi({ icon, tone, value, label, sub, emphasis, quiet }: {
  icon: React.ReactNode; tone: string; value: React.ReactNode; label: string; sub: string;
  emphasis?: boolean; quiet?: boolean;
}) {
  const t = useTone();
  return (
    <div
      className={cn("rounded-card border bg-card p-5", emphasis ? "shadow-elevated" : "border-border shadow-card")}
      style={emphasis ? { borderColor: t.fg(tone), borderWidth: 1.5 } : undefined}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: t.chip(tone), color: t.fg(tone) }}>{icon}</span>
      </div>
      <div
        className={cn("nums font-bold leading-none", emphasis ? "text-[34px]" : quiet ? "text-2xl text-text2" : "text-3xl text-text1")}
        style={emphasis ? { color: t.fg(tone) } : undefined}
      >
        {value}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-text1">{label}</div>
      <div className="text-xs text-text3">{sub}</div>
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase text-text3">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        className="select-field h-9 rounded-btn border border-border bg-card px-2 text-sm font-semibold text-text1">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** What the headline is standing on: approved · received-awaiting-sign-off · outstanding (or, under
 *  the estimated basis, modelled). Always shows the TRUE collection state regardless of basis — the
 *  point of the strip is that you cannot read a total without seeing its coverage. */
function CoverageMeter({ cov }: { cov: Coverage }) {
  const total = cov.departments_total || 1;
  const awaiting = cov.departments_received - cov.departments_approved;
  const segments = [
    { key: "approved", n: cov.departments_approved, color: "rgb(var(--success))", label: "Approved" },
    { key: "awaiting", n: awaiting, color: "rgb(var(--primary))", label: "Received, awaiting sign-off" },
    cov.departments_estimated
      ? { key: "estimated", n: cov.departments_estimated, color: "rgb(var(--purple))", label: "Estimated" }
      : { key: "outstanding", n: cov.departments_outstanding, color: "rgb(var(--border-strong))", label: "Outstanding" },
  ].filter((s) => s.n > 0);

  return (
    <div className="mt-3">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-border">
        {segments.map((s) => (
          <span key={s.key} title={`${s.label}: ${s.n}`} style={{ width: `${(s.n / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-text2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
            <b className="tabular-nums text-text1">{s.n}</b> {s.label}
          </span>
        ))}
        <span className="text-[11px] text-text3">of {cov.departments_total} departments government-wide</span>
      </div>
    </div>
  );
}

/** The headline's provenance, stated before the number is read. Only an approved position at full
 *  coverage is official; every other basis says so in its own words (composed server-side alongside
 *  the basis that produced it, so the wording can never drift from the filter). */
function PositionBanner({ cov }: { cov: Coverage }) {
  const tone = cov.official
    ? { bg: "rgb(var(--success-bg))", bar: "rgb(var(--success))", fg: "rgb(var(--success))", Icon: ShieldCheck }
    : cov.basis === "estimated"
      ? { bg: "rgb(var(--purple-bg))", bar: "rgb(var(--purple))", fg: "rgb(var(--purple))", Icon: FlaskConical }
      : { bg: "rgb(var(--warning-bg))", bar: "rgb(var(--warning))", fg: "rgb(var(--warning))", Icon: AlertTriangle };
  const { Icon } = tone;
  return (
    <div className="mb-4 flex gap-3 rounded-card p-3.5"
      style={{ background: tone.bg, borderLeftWidth: 4, borderLeftColor: tone.bar }}>
      <Icon size={18} className="mt-0.5 shrink-0" style={{ color: tone.bar }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold leading-snug" style={{ color: tone.fg }}>{cov.statement}</p>
        {cov.method && <p className="mt-1.5 text-xs leading-relaxed" style={{ color: tone.fg, opacity: 0.85 }}>{cov.method}</p>}
        <CoverageMeter cov={cov} />
      </div>
    </div>
  );
}

export function PlanningGovernment() {
  const navigate = useNavigate();
  const [scenario, setScenario] = useState("base");
  const [basis, setBasis] = useState<BasisKey>("received");
  // S1 page-top filters: one workforce filter at a time (a job level OR a single demographic bucket).
  const [jobLevel, setJobLevel] = useState("");
  const [demoDim, setDemoDim] = useState("");
  const [demoBucket, setDemoBucket] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const qFilters = useQuery({ queryKey: ["q-hc-filters"], queryFn: api.planning.hcFilters, staleTime: 300_000 });
  const workforceFiltered = !!(jobLevel || demoDim);
  // fetch all three so the scenario-impact panel can show them side by side (cached by key)
  const qBase = useQuery({ queryKey: ["q-gov", basis, "base"], queryFn: () => api.planning.government("base", basis), refetchInterval: 4000 });
  const qDem = useQuery({ queryKey: ["q-gov", basis, "demand"], queryFn: () => api.planning.government("demand", basis), refetchInterval: 4000 });
  const qProd = useQuery({ queryKey: ["q-gov", basis, "prod"], queryFn: () => api.planning.government("prod", basis), refetchInterval: 4000 });
  // Both follow `basis` — a panel pinned to received while the headline moves puts a contradiction
  // on one screen (Current FTE 6,421 beside a 4,741 headcount).
  const qHc = useQuery({ queryKey: ["q-gov-hc", basis, jobLevel, demoDim, demoBucket], queryFn: () => api.planning.govHumanCapital(basis, { job_level: jobLevel || undefined, dim: demoDim || undefined, bucket: demoBucket || undefined }), refetchInterval: 4000 });
  const qProj = useQuery({ queryKey: ["q-gov-proj", basis, scenario], queryFn: () => api.planning.govProjection(scenario, basis), refetchInterval: 4000 });
  const qPipe = useQuery({ queryKey: ["q-gov-pipeline"], queryFn: () => api.planning.pipeline(), refetchInterval: 4000 });
  const byScen: Record<string, typeof qBase.data> = { base: qBase.data, demand: qDem.data, prod: qProd.data };
  const data = byScen[scenario];
  const t = data?.totals;
  const cov = data?.coverage;
  const labels = data?.rollup_labels;
  const gsup = qHc.data?.supply;
  const entities = (data?.entities ?? []).slice().sort((a, b) => (b.received - a.received) || (b.required_fte - a.required_fte) || a.name.localeCompare(b.name));
  const maxEnt = Math.max(1, ...entities.map((e) => Math.max(e.current_fte, e.required_fte)));
  const gap = t?.gap ?? 0;
  const entitiesReceived = entities.filter((e) => e.received > 0).length;
  const genderDim = (qFilters.data?.dimensions ?? []).find((d) => d.key === "gender");
  const pickLevel = (lvl: string) => { setJobLevel(lvl); if (lvl) { setDemoDim(""); setDemoBucket(""); } };
  const pickDemo = (dim: string, bucket: string) => {
    if (bucket) { setDemoDim(dim); setDemoBucket(bucket); setJobLevel(""); }
    else if (demoDim === dim) { setDemoDim(""); setDemoBucket(""); }
  };
  const clearFilters = () => { setJobLevel(""); setDemoDim(""); setDemoBucket(""); };
  const activeFilterLabel = jobLevel
    ? (qFilters.data?.job_levels.find((l) => l.key === jobLevel)?.label ?? jobLevel)
    : demoDim
      ? `${qFilters.data?.dimensions.find((d) => d.key === demoDim)?.label ?? demoDim}: ${qFilters.data?.dimensions.find((d) => d.key === demoDim)?.buckets.find((b) => b.bucket === demoBucket)?.label ?? demoBucket}`
      : "";

  // Roll-up mix, walked in ladder order — rollup_labels IS the ladder, so no order is restated here.
  const mix = entities.reduce((a, e) => { a[e.rollup_status] = (a[e.rollup_status] ?? 0) + 1; return a; }, {} as Record<string, number>);
  const ladder = Object.keys(labels ?? {}) as RollupStatus[];

  const sizedFrom = !cov ? "" : cov.departments_estimated
    ? `${cov.departments_actual} actual + ${cov.departments_estimated} estimated`
    : `${cov.departments_counted} of ${cov.departments_total} departments`;

  return (
    <>
      <PageHeader title="Government-Wide Position" subtitle="Current vs required workforce across every entity and department, computed live from submitted data." />
      <PageBody>
        {/* Ask-the-data chat: grounded server-side in this page's own figures; keyed to the
            selected scenario so answers track what's on screen. */}
        <AskDataPanel key={scenario} scenario={scenario} />
        {/* S1: page-level filters across the very top. Selecting an entity opens its full view
            (incl. demand vs supply); job-level / demographic filters re-slice the workforce panels. */}
        {/* §19.4: softer filter container — quiet tinted surface, no heavy border/shadow. */}
        <div className="mb-4 rounded-card bg-surface2 p-3.5">
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Entity" value="" onChange={(v) => { if (v) navigate(`/dghr/gov-entity/${v}`); }}
              options={[{ value: "", label: "All entities" }, ...(qFilters.data?.entities ?? []).map((e) => ({ value: String(e.entity_id), label: e.name }))]} />
            <Select label="Job level" value={jobLevel} onChange={pickLevel}
              options={[{ value: "", label: "All levels" }, ...(qFilters.data?.job_levels ?? []).map((l) => ({ value: l.key, label: l.label }))]} />
            {genderDim && (
              <Select label={genderDim.label} value={demoDim === "gender" ? demoBucket : ""} onChange={(v) => pickDemo("gender", v)}
                options={[{ value: "", label: "All" }, ...genderDim.buckets.map((b) => ({ value: b.bucket, label: b.label }))]} />
            )}
            <button onClick={() => setAdvanced((a) => !a)} className="h-9 self-end rounded-btn border border-border bg-card px-3 text-xs font-semibold text-text2 hover:bg-page">
              {advanced ? "Hide advanced" : "Advanced"}
            </button>
            {workforceFiltered && (
              <button onClick={clearFilters} className="h-9 self-end rounded-btn px-3 text-xs font-semibold text-primary hover:underline">Clear filter</button>
            )}
          </div>
          {advanced && (
            <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
              {(qFilters.data?.dimensions ?? []).filter((d) => d.key !== "gender").map((d) => (
                <Select key={d.key} label={d.label} value={demoDim === d.key ? demoBucket : ""} onChange={(v) => pickDemo(d.key, v)}
                  options={[{ value: "", label: "All" }, ...d.buckets.map((b) => ({ value: b.bucket, label: b.label }))]} />
              ))}
            </div>
          )}
          {workforceFiltered && (
            <div className="mt-2 text-[11px] leading-relaxed text-text3">Demand (Required FTE, gap, projection) is workload-driven and is not filtered; this slices the workforce view below. Demographic slices scale FTE and cost proportionally.</div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Select label="View" value={basis} onChange={(v) => setBasis(v as BasisKey)}
            options={(data?.bases ?? [{ key: "received" as BasisKey, label: "All received submissions" }]).map((b) => ({ value: b.key, label: b.label }))} />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase text-text3">Scenarios</span>
            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
              {(data?.scenarios ?? [{ key: "base", label: "Baseline" }]).map((s) => (
                <button key={s.key} onClick={() => setScenario(s.key)}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold transition ${scenario === s.key ? "bg-primary text-white shadow-sm" : "text-text2 hover:text-text1"}`}>{s.label}</button>
              ))}
            </div>
          </div>
        </div>

        {cov && <PositionBanner cov={cov} />}

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {/* "Establishment on payroll" was wrong twice over: this figure is net of secondments, and
              the establishment isn't what the gap measures against. It is AVAILABLE FTE. */}
          <Kpi icon={<Users size={20} />} tone="#2563EB" value={fmtFte(t?.current_fte ?? 0)} label="Available FTE"
            sub={gsup ? `${gsup.filled_positions.toLocaleString()} people, ${fmtFte(gsup.establishment_fte)} FTE ${gsup.net_adjustment_fte >= 0 ? "+" : "−"} ${fmtFte(Math.abs(gsup.net_adjustment_fte))} adj.` : "net of secondments"} />
          <Kpi icon={<Target size={20} />} tone="#7C3AED" label="Required FTE" sub={sizedFrom}
            value={<TraceableValue kind="government" refId={0} label="the government-wide Required FTE" scenario={scenario}>{t?.required_fte ?? 0}</TraceableValue>} />
          <Kpi emphasis icon={<TrendingUp size={20} />} tone={gap < 0 ? "#E11D48" : "#15803D"} value={`${gap > 0 ? "+" : ""}${fmtFte(gap)}`} label="Net Gap (this year)" sub={gap < 0 ? "Shortfall to close" : "Surplus to redeploy"} />
          <Kpi quiet icon={<Building2 size={20} />} tone="#B45309" value={entitiesReceived} label="Entities Received" sub={`${cov?.departments_counted ?? 0} of ${cov?.departments_total ?? 0} departments counted`} />
        </div>

        {(t?.departments ?? 0) === 0 ? (
          <Card className="mb-4"><EmptyState icon={<Target size={26} />}
            title={basis === "complete" ? "No entity has submitted every department yet" : "No submissions yet"}
            description={basis === "complete"
              ? `Every one of the ${cov?.entities_total ?? 0} entities still has departments outstanding, so none of them has a total that is a whole number. This view has nothing it can honestly count. That absence is the finding. Switch to "All received submissions" for the partial position, or chase the gaps in Cycle & Administration.`
              : "The government-wide position fills in as entities submit their departments, with no seeded figures. Use Admin, Send reminders to chase them."} /></Card>
        ) : (
          <>
            {/* Government-wide Human Capital Overview + projected gap */}
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Card>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-text1">Human Capital Overview</div>
                  {workforceFiltered && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Filtered, {activeFilterLabel}</span>}
                </div>
                <div className="mb-4 text-xs text-text3">
                  Government-wide workforce: people, time, job levels, Emiratization and cost, rolled up from{" "}
                  {qHc.data?.departments_counted ?? 0} submitted departments.
                  {cov?.departments_estimated ? " Estimated departments are excluded: a headcount can be modelled, an Emiratization rate cannot." : ""}
                </div>
                {qHc.data?.has_data ? (
                  <>
                    <HcTiles hc={qHc.data} />
                    <div className="mt-4"><LevelBar levels={qHc.data.by_level} /></div>
                  </>
                ) : <p className="text-sm text-text3">No workforce data yet.</p>}
              </Card>

              {/* Every step between an authorised post and an hour actually available to plan
                  against — the answer to "current FTE and headcount are the same number". */}
              <Card>
                <div className="text-sm font-semibold text-text1">Supply reconciliation</div>
                <div className="mb-3 text-xs text-text3">
                  Approved posts are not filled posts, filled posts are not FTE, and FTE on your payroll
                  is not FTE available to you. Each line is a different question.
                </div>
                {gsup?.has_data ? <SupplyChain s={gsup} /> : <p className="text-sm text-text3">No workforce data yet.</p>}
              </Card>
              <Card>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Projected demand vs supply</div>
                  <span className="text-[11px] text-text3">{qProj.data?.assumptions?.horizon_years ?? "—"} yrs</span>
                </div>
                <div className="mb-3 text-xs text-text3">
                  Government-wide trajectory if nothing changes, across {qProj.data?.departments_counted ?? 0} departments.
                </div>
                <ProjectedGapChart points={qProj.data?.points ?? []} height={200} />
                {qProj.data?.assumptions && (
                  <p className="mt-2 text-[11px] leading-relaxed text-text3">
                    {qProj.data.assumptions.demand} {qProj.data.assumptions.supply}
                    {qProj.data.assumptions.coverage ? ` ${qProj.data.assumptions.coverage}` : ""}
                  </p>
                )}
              </Card>
            </div>

            <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,430px)_1fr]">
              <div className="space-y-4">
                <Card className="min-w-0 p-0">
                  <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Scenario impact</div>
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-border text-[11px] uppercase text-text3"><th className="px-5 py-2">Scenario</th><th className="px-3 py-2 text-right">Required</th><th className="px-3 py-2 text-right">vs Base</th><th className="px-5 py-2 text-right">Gap</th></tr></thead>
                    <tbody>
                      {(data?.scenarios ?? []).map((s) => {
                        const st = byScen[s.key]?.totals;
                        if (!st) return null;
                        const delta = st.required_fte - (qBase.data?.totals.required_fte ?? 0);
                        const active = scenario === s.key;
                        return (
                          <tr key={s.key} onClick={() => setScenario(s.key)}
                            className={`cursor-pointer border-b border-border last:border-0 ${active ? "bg-primary/5" : "hover:bg-page/60"}`}>
                            <td className={`px-5 py-2.5 ${active ? "font-bold text-primary" : "text-text1"}`}>{s.label}</td>
                            <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{st.required_fte}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-text3">{delta === 0 ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</td>
                            <td className="px-5 py-2.5 text-right"><GapPill gap={st.gap} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="px-5 py-3 text-xs text-text3">Only demand & project drivers re-price. Coverage posts and statutory floors never scale with volume.</p>
                </Card>
              </div>

              <Card className="min-w-0 p-0">
                <div className="border-b border-border px-5 py-3 text-sm font-semibold text-text1">Top functions impacting the supply and demand gaps</div>
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-b border-border text-[11px] uppercase text-text3"><th className="px-5 py-2">Function</th><th className="px-3 py-2 text-right">Depts</th><th className="px-3 py-2 text-right">Current</th><th className="px-3 py-2 text-right">Required</th><th className="px-5 py-2 text-right">Gap</th></tr></thead>
                  <tbody>{[...(data?.by_typeset ?? [])].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).map((b) => (
                    <tr key={b.typeset} className="border-b border-border last:border-0"><td className="px-5 py-2.5 text-text1">{b.typeset}</td><td className="px-3 py-2.5 text-right tabular-nums text-text2">{b.departments}</td><td className="px-3 py-2.5 text-right tabular-nums text-text2">{b.current_fte}</td><td className="px-3 py-2.5 text-right font-semibold tabular-nums">{b.required_fte}</td><td className="px-5 py-2.5 text-right"><GapPill gap={b.gap} /></td></tr>
                  ))}</tbody>
                </table>
              </Card>
            </div>
          </>
        )}

        {/* Submission pipeline (G7): where every department sits, government-wide. */}
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-text1">Submission pipeline</div>
            <span className="text-[11px] text-text3">{qPipe.data?.received ?? 0} received of {qPipe.data?.total ?? 0} departments</span>
          </div>
          <SubmissionPipeline stages={qPipe.data?.stages ?? []} total={qPipe.data?.total ?? 0} />
        </Card>

        {/* Always rendered — never gated on the totals. Under "Complete entities only" this table IS
            the answer to "why is it empty?", so hiding it would hide the finding. */}
        <Card className="min-w-0 p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
            <span className="text-sm font-semibold text-text1">Entities</span>
            <span className="flex items-center gap-3 text-[11px] text-text3"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-text3/50" />Current</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Required</span></span>
          </div>

          {/* Replaces "N of M entities have submitted", which was an ANY-department test (received > 0)
              being read as a completeness claim. Completeness is the only honest headline here. */}
          {cov && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-border bg-page/50 px-5 py-3">
              <span className="text-xs text-text2">
                <b className="text-text1">{cov.entities_complete} of {cov.entities_total}</b> entities have submitted every department
              </span>
              <span className="text-text3">|</span>
              {ladder.filter((k) => mix[k]).map((k) => (
                <StatusBadge key={k} value={k} label={`${mix[k]} ${labels![k]}`} />
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead><tr className="border-b border-border text-[11px] uppercase text-text3"><th className="px-5 py-2.5">Entity</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Received</th><th className="w-[18%] px-3 py-2.5">Current vs Required</th><th className="px-3 py-2.5 text-right">Current</th><th className="px-3 py-2.5 text-right">Required</th><th className="px-3 py-2.5 text-right">Gap</th><th className="px-5 py-2.5">Smart remarks</th></tr></thead>
            <tbody>
              {entities.map((e) => {
                // Counted, not received: under "Approved only" an entity with 5 received but 0 signed
                // off contributes nothing, and must read as contributing nothing.
                const active = e.counted > 0;
                return (
                  <tr key={e.entity_id} className={`border-b border-border last:border-0 ${e.received > 0 ? "cursor-pointer hover:bg-page/60" : "opacity-60"}`}
                    onClick={() => e.received > 0 && navigate(`/dghr/gov-entity/${e.entity_id}`)}>
                    <td className="px-5 py-3"><div className="flex items-center gap-2 font-semibold text-text1">{e.name} {e.received > 0 && <ArrowUpRight size={13} className="text-text3" />}</div><div className="text-[11px] text-text3"><Acronym short={e.code} full={e.name} /></div></td>
                    <td className="px-3 py-3">{labels && <StatusBadge value={e.rollup_status} label={labels[e.rollup_status]} />}</td>
                    <td className="px-3 py-3">
                      <ReceivedChip received={e.received} total={e.dept_count} />
                      {e.counted !== e.received && <div className="mt-1 text-[10px] text-text3">{e.counted} counted{e.estimated ? " (incl. estimated)" : ""}</div>}
                    </td>
                    <td className="px-3 py-3">{active ? <MiniBar current={e.current_fte} required={e.required_fte} max={maxEnt} /> : <span className="text-xs text-text3">—</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-text2">{active ? e.current_fte : "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-text1">{active ? e.required_fte : "—"}</td>
                    <td className="px-3 py-3 text-right">{active ? <GapPill gap={e.gap} /> : <span className="text-text3">—</span>}</td>
                    <td className="px-5 py-3">{active ? <SmartRemarkCell remark={e.remark} /> : <span className="text-text3">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
