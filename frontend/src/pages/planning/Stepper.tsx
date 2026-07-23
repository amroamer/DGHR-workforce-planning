import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Save, Send, Plus, Trash2, ChevronLeft, ChevronRight, Check, Calculator,
  AlertTriangle, CheckCircle2, MessageSquareWarning, Users, ScrollText, Mic, Sparkles, Info,
  Lock, GitBranch, ShieldCheck, FileText, Target, TrendingUp,
  Clock, CornerDownRight, AlertCircle, PencilLine,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, relativeTime } from "@/lib/utils";
import { useTone } from "@/lib/tone";
import { useSpeech, joinTranscript } from "@/lib/useSpeech";
import { useVoiceLang } from "@/lib/voiceLang";
import { VoiceLangToggle } from "@/components/shared/VoiceLangToggle";
import { PageHeader } from "@/components/shared/PageHeader";
import { Alert } from "@/components/ui/alert";
import { PageBody } from "@/components/shared/AppShell";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Q_STATUS_LABEL, Q_STATUS_VALUE } from "./Departments";
import {
  computeSizing, driverFte, familyHint, measureVolume, FAMILY_COLOR, FAMILY_LABEL,
  JOB_LEVELS, LEVEL_LABEL, COST_PER_FTE, fmtAED,
  type AdjustmentInput, type BandGroup, type Clarification, type DriverInput, type Family, type MandateInput, type MethodRegistry, type SizedMeasure, type SmartAssistResult, type SubmissionPayload, type WorkforceRowInput,
} from "@/lib/planning";
import { ProjectedGapChart, SupplyChain, AdjustmentList, HcTiles, LevelBar, fmtFte } from "./widgets";
import { Textarea, ReadOnlyField, CalcField, fieldClass } from "@/components/ui/field";

// S10/S13: Smart Assist moved to right after "Your team" so it can draft the entries the later
// steps then refine. Order: Your team, Smart Assist, Your drivers, Fixed requirements, Review.
const STEPS = ["Your team", "Smart Assist", "Your drivers", "Fixed requirements", "Review & submit"];
const VOICE_SAMPLE = "This quarter we processed about 52,000 permit applications, up from 47,000 last year. Each application takes roughly 18 minutes end to end. We are legally required to keep at least four certified assessors on duty at all times under Cabinet Resolution 12. Two of my team are seconded to the digital programme until March. I expect volumes to grow around 10 percent next year when the new zoning rules come in.";
const FAMILIES: Family[] = ["demand", "ratio", "coverage", "mandate", "project"];
// A new driver starts from the METHOD's declared defaults rather than a retyped literal, so the
// stepper cannot seed a value the published method doesn't actually stand behind.
function emptyParamsFor(reg: MethodRegistry | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const mt of reg?.methods ?? []) for (const sp of mt.param_specs ?? []) out[sp.key] = Number(sp.default) || 0;
  return out;
}
// Align the stepper's fields to the shared form-control kit (§10): one height, one focus
// treatment, tinted inset when disabled — identical behaviour, consistent styling.
const fieldCls = fieldClass;
// Numeric cell inputs inside the workforce/demographics tables — calmer, tabular, inset when disabled.
const numCellCls = "h-9 w-24 rounded-btn border border-border bg-card px-2 text-right text-sm nums outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-inset disabled:text-text2";

const Lbl = ({ children }: { children: React.ReactNode }) => <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text3">{children}</label>;

/** The three measures side by side, so "Required FTE" can never be read as the wrong period.
 *  Labels and periods come from the DB (calc_measures) — never retyped here. */
function MeasureTable({ measures, forecastStated }: { measures?: SizedMeasure[]; forecastStated?: boolean }) {
  if (!measures?.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border">
      {measures.map((ms) => (
        <div
          key={ms.key}
          title={ms.description}
          className={cn(
            "flex items-baseline justify-between gap-2 border-b border-border px-3 py-2 last:border-0",
            ms.derived ? "bg-inset" : "bg-card",
          )}
        >
          <div className="min-w-0">
            <div className="text-[12px] text-text1">{ms.label}</div>
            {ms.key === "forecast" && !forecastStated && (
              // A flat forecast because nobody stated one is NOT a forecast of no growth.
              <div className="text-[10px] text-warning">No forecast stated (assumed flat)</div>
            )}
          </div>
          <div className={cn("shrink-0 font-mono text-[13px] font-semibold tabular-nums",
            ms.derived ? (ms.value > 0 ? "text-danger" : ms.value < 0 ? "text-success" : "text-text3") : "text-text1")}>
            {ms.derived && ms.value > 0 ? "+" : ""}{ms.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function PlanningStepper() {
  const { deptId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [approvedPositions, setApprovedPositions] = useState(0);
  const [notes, setNotes] = useState("");
  const [drivers, setDrivers] = useState<DriverInput[]>([]);
  const [mandates, setMandates] = useState<MandateInput[]>([]);
  const [workforce, setWorkforce] = useState<WorkforceRowInput[]>([]);
  const [bands, setBands] = useState<BandGroup[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentInput[]>([]);
  const [saved, setSaved] = useState<SubmissionPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<SmartAssistResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // Attestation, captured at submit — a submission can't be sent without it (the server rejects too).
  const [attested, setAttested] = useState(false);
  const [attestedBy, setAttestedBy] = useState("");
  // A frozen record does two jobs — answering DGHR's questions and reading what was sent. They get
  // their own tabs instead of being stacked in one wizard. null = follow the default (Answer when
  // there are open questions, otherwise the record); a click pins the choice.
  const [mode, setMode] = useState<"answer" | "record" | null>(null);

  const { data } = useQuery({ queryKey: ["q-submission", deptId], queryFn: () => api.planning.submission(Number(deptId)), enabled: !!deptId });
  useEffect(() => {
    if (!data) return;
    setSaved(data);
    setApprovedPositions(data.department?.approved_positions ?? 0);
    setNotes(data.notes ?? "");
    setDrivers(data.sizing.drivers.map((d) => ({ name: d.name, unit: d.unit, family: d.family, volume: d.volume, forecast: d.forecast, source: d.source ?? "", params: d.params })));
    setMandates(data.sizing.mandates.map((m) => ({ role: m.role, legal_basis: m.legal_basis, positions: m.positions })));
    const wf = data.workforce?.rows ?? [];
    setWorkforce(JOB_LEVELS.map((lv) => {
      const r = wf.find((x) => x.job_level === lv.key);
      return { job_level: lv.key, headcount: r?.headcount ?? 0, fte: r?.fte ?? r?.headcount ?? 0, emirati_count: r?.emirati_count ?? 0 };
    }));
    // The server always returns a complete band grid (dimensions × buckets, zeroed where unset).
    setBands((data.workforce?.bands ?? []).map((g) => ({ ...g, buckets: g.buckets.map((b) => ({ ...b })) })));
    setAdjustments((data.supply?.adjustments ?? []).map((a) => ({
      kind: a.kind, label: a.label, fte: a.fte, headcount: a.headcount,
      starts_on: a.starts_on, ends_on: a.ends_on,
      source_department_id: a.source_department_id, receiving_department_id: a.receiving_department_id,
      counts_in_supply: a.counts_in_supply, note: a.note,
    })));
  }, [data]);

  // Editability now comes from the server: only a draft that hasn't been superseded is editable.
  // A submitted, in-clarification, approved or rejected version is a record — it is revised, not edited.
  // The collection window is the second gate: a closed cycle (or one this entity isn't in) makes
  // every field read-only regardless of draft status — the same rule the server enforces on write.
  const win = saved?.window;
  const windowClosed = !!win && !win.can_submit;
  const locked = saved ? (!saved.editable || windowClosed) : true;
  const revise = async () => {
    if (!saved) return;
    setBusy(true);
    try { const v = await api.planning.revise(saved.id); setSaved(v); setStep(1); qc.invalidateQueries(); toast.success(`Opened v${v.version} to edit.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not open a revision."); }
    finally { setBusy(false); }
  };
  // The published method — formulas, parameter defaults and rounding rules the engine will apply.
  // Static: it changes only when an admin edits the method, not per render.
  const { data: registry } = useQuery({ queryKey: ["method-registry"], queryFn: api.planning.methodRegistry, staleTime: 5 * 60_000 });
  const emptyParams = useMemo(() => emptyParamsFor(registry), [registry]);
  // Which period the big number states — from the DB, so the panel can't mislabel itself.
  const currentMeasure = registry?.measures?.find((x) => x.key === "current");
  const wfTotals = useMemo(() => {
    const hc = workforce.reduce((s, r) => s + (Number(r.headcount) || 0), 0);
    const fte = Math.round(workforce.reduce((s, r) => s + (Number(r.fte) || 0), 0) * 100) / 100;
    const emr = workforce.reduce((s, r) => s + (Number(r.emirati_count) || 0), 0);
    // Cost follows TIME — you don't pay a half-timer a full salary.
    const cost = workforce.reduce((s, r) => s + (Number(r.fte) || 0) * (COST_PER_FTE[r.job_level] || 0), 0);
    return { hc, fte, emr, pct: hc ? Math.round((emr / hc) * 1000) / 10 : 0, cost };
  }, [workforce]);

  // Supply, derived live exactly as services/supply.py derives it — the entity sees the same chain
  // DGHR will see. `currentFte` is no longer typed by hand: a department's FTE IS its people's time,
  // so a separate box is precisely how it drifted away from headcount in the first place.
  const netAdjustment = useMemo(() => Math.round(adjustments.reduce(
    (s, a) => s + (a.counts_in_supply ? (Number(a.fte) || 0) * (a.kind === "secondment_out" ? -1 : 1) : 0), 0) * 100) / 100,
    [adjustments]);
  const establishmentFte = wfTotals.fte;
  const availableFte = Math.round((establishmentFte + netAdjustment) * 100) / 100;
  const vacancies = approvedPositions - wfTotals.hc;

  const live = useMemo(() => computeSizing(registry, drivers, mandates, availableFte), [registry, drivers, mandates, availableFte]);

  const setWf = (i: number, patch: Partial<WorkforceRowInput>) => setWorkforce((w) => w.map((r, j) => {
    if (j !== i) return r;
    const next = { ...r, ...patch };
    // Time can never exceed the people supplying it — 3 people are at most 3.0 FTE.
    next.fte = Math.min(Number(next.fte) || 0, Number(next.headcount) || 0);
    next.emirati_count = Math.min(Number(next.emirati_count) || 0, Number(next.headcount) || 0);
    return next;
  }));
  const setBand = (di: number, bi: number, v: number) => setBands((bs) => bs.map((g, gi) =>
    gi !== di ? g : { ...g, buckets: g.buckets.map((b, j) => (j === bi ? { ...b, headcount: Math.max(0, v) } : b)) }));
  // Distribute the department's headcount evenly across a dimension's buckets (largest remainder).
  const evenFillBand = (di: number) => setBands((bs) => bs.map((g, gi) => {
    if (gi !== di) return g;
    const n = g.buckets.length || 1, base = Math.floor(wfTotals.hc / n), rem = wfTotals.hc - base * n;
    return { ...g, buckets: g.buckets.map((b, j) => ({ ...b, headcount: base + (j < rem ? 1 : 0) })) };
  }));
  const setAdj = (i: number, patch: Partial<AdjustmentInput>) =>
    setAdjustments((w) => w.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const addAdj = () => setAdjustments((w) => [...w, {
    kind: "secondment_out", label: "", fte: 0, headcount: 0,
    starts_on: null, ends_on: null, source_department_id: null, receiving_department_id: null,
    counts_in_supply: true, note: "",
  }]);
  const removeAdj = (i: number) => setAdjustments((w) => w.filter((_, j) => j !== i));

  const persist = async (): Promise<SubmissionPayload | null> => {
    if (!saved) return null;
    setBusy(true);
    try {
      // current_fte is NOT sent: the server derives it from the workforce rows, so there is exactly
      // one definition of a department's establishment FTE and it can't be contradicted from here.
      const res = await api.planning.saveSubmission(saved.id, {
        approved_positions: approvedPositions, notes, drivers, mandates, workforce, adjustments,
        bands: bands.map((g) => ({ dimension: g.dimension, buckets: g.buckets.map((b) => ({ bucket: b.bucket, headcount: Number(b.headcount) || 0 })) })),
      });
      setSaved(res); qc.invalidateQueries({ queryKey: ["q-depts"] }); return res;
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed."); return null; }
    finally { setBusy(false); }
  };
  const saveDraft = async () => { if (await persist()) toast.success("Saved."); };
  const next = async () => { if (!locked) await persist(); setStep((s) => Math.min(5, s + 1)); };
  // S10-14: the HR champion verifies the consolidated report before it is sent to DGHR.
  const championVerify = async () => {
    if (!saved || !saved.entity) return;
    setBusy(true);
    try { if (!locked) await persist(); const v = await api.planning.championVerify(saved.id); setSaved(v); toast.success("Verified by the entity champion."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Verification failed."); }
    finally { setBusy(false); }
  };
  const submit = async () => {
    if (!saved) return;
    if (!attested) return toast.error("Confirm the attestation before submitting.");
    if (!attestedBy.trim()) return toast.error("Add the name of the person confirming.");
    if (!(await persist())) return;
    setBusy(true);
    try { setSaved(await api.planning.submit(saved.id, { attested, attested_by: attestedBy.trim() })); qc.invalidateQueries(); toast.success("Submitted to DGHR."); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Submit failed."); }
    finally { setBusy(false); }
  };

  // Real dictation via the browser's speech engine. Finalized words are committed to the note;
  // the interim tail rides along live and is replaced as recognition firms it up.
  const notesBaseRef = useRef("");
  const speech = useSpeech({
    onTranscript: (finalChunk, interim) => {
      if (finalChunk) notesBaseRef.current = joinTranscript(notesBaseRef.current, finalChunk);
      setNotes(interim ? joinTranscript(notesBaseRef.current, interim) : notesBaseRef.current);
    },
    onEnd: () => toast.message("Voice captured. Edit the transcript, then draft with Smart Assist."),
    onError: (err) => toast.error(err === "not-allowed" ? "Microphone access was blocked. Allow it in the browser and try again." : `Voice capture failed (${err}).`),
    lang: useVoiceLang((s) => s.lang),
  });
  const voiceNote = () => {
    if (!speech.supported) {
      // No speech engine in this browser — fall back to the sample transcript so the flow still demos.
      setNotes(VOICE_SAMPLE);
      toast.message("Voice isn't supported in this browser. Sample transcript inserted for you to edit.");
      return;
    }
    if (speech.listening) return speech.stop();
    notesBaseRef.current = notes;
    speech.start();
    toast.message("Listening… speak your note, then tap the mic again to stop.");
  };
  const runSmartAssist = async () => {
    if (!notes.trim()) return toast.error("Type a note or record a voice note first.");
    setAiBusy(true);
    try { setSuggest(await api.planning.smartAssist(notes)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Smart Assist failed."); }
    finally { setAiBusy(false); }
  };
  const acceptDriver = (d: SmartAssistResult["drivers"][number]) => { setDrivers((ds) => [...ds, { ...d }]); toast.success("Driver added to Step 2."); };
  const acceptMandate = (mm: SmartAssistResult["mandates"][number]) => { setMandates((ms) => [...ms, { role: mm.role, legal_basis: "", positions: mm.positions }]); toast.success("Fixed requirement added to Step 3."); };

  const setDriver = (i: number, patch: Partial<DriverInput>) => setDrivers((ds) => ds.map((d, j) => j === i ? { ...d, ...patch } : d));
  const setParam = (i: number, key: string, v: number) => setDrivers((ds) => ds.map((d, j) => j === i ? { ...d, params: { ...d.params, [key]: v } } : d));

  if (!saved) return <><PageHeader title="Department submission" subtitle="Loading…" /><PageBody><div className="rounded-card border border-border bg-card p-10 text-center text-text3">Loading…</div></PageBody></>;

  // A DGHR question is the head of a thread; entity replies and DGHR follow-ups hang off it by
  // parent_id. Grouping here is what lets each question own its whole conversation on the Answer tab.
  const allClars = saved.clarifications;
  const questions = allClars
    .filter((c) => c.side === "dghr" && c.parent_id == null)
    .sort((a, b) => (b.status === "open" ? 1 : 0) - (a.status === "open" ? 1 : 0));
  const repliesFor = (qid: number) =>
    allClars.filter((c) => c.parent_id === qid).sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const openCount = questions.filter((q) => q.status === "open").length;
  const answeredCount = questions.length - openCount;
  const hasQuestions = questions.length > 0;
  // Default to the job that's outstanding; once the user picks a tab, honour it.
  const activeMode: "answer" | "record" = mode ?? (locked && openCount > 0 ? "answer" : "record");
  const showAnswer = locked && hasQuestions && activeMode === "answer";
  const canRevise = saved.is_latest && !windowClosed;

  return (
    <>
      <PageHeader title={`${saved.department?.name ?? "Department"}`}
        subtitle={`${saved.department?.typeset ?? ""}, confirm what drives your workload: sizing is computed for you.`}
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => navigate("/entity/departments")}><ChevronLeft size={15} /> Departments</Button>
          {!locked && <Button variant="secondary" size="sm" onClick={saveDraft} disabled={busy}><Save size={15} /> Save</Button>}
        </>} />
      <PageBody>
        {/* Closed-window banner. Distinct from the frozen-version banner below: this fires when the
            cycle itself is shut (or out of scope), even on a draft that would otherwise be editable. */}
        {windowClosed && !saved.frozen_reason && (
          <Alert tone="warning" icon={<Lock size={16} />} className="mb-4">
            <span className="font-semibold">Submissions are closed.</span> {win?.reason} Everything below is read-only.
          </Alert>
        )}
        {/* Frozen-version banner (record view only). A submitted record can't be edited in place —
            the entity revises it into a new version, leaving what DGHR is reviewing exactly as sent.
            On the Answer tab this is redundant with the tab header, so it's suppressed there. */}
        {locked && saved.frozen_reason && !showAnswer && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-l-4 border-border border-l-purple bg-purple-bg p-3.5 shadow-card">
            <Lock size={18} className="shrink-0 text-purple" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-purple">v{saved.version}, the record of what was submitted</div>
              <div className="text-xs text-purple/80">Read-only. To change a figure, revise it into a new version.</div>
            </div>
            {saved.is_latest && (
              <Button size="sm" onClick={revise} disabled={busy || windowClosed}><GitBranch size={15} /> Revise → new version</Button>
            )}
            {!saved.is_latest && saved.superseded_by_id && (
              <Button size="sm" variant="secondary" onClick={() => { const v = saved.versions.find((x) => x.id === saved.superseded_by_id); if (v) navigate(`/entity/departments/${saved.department?.id}`); }}>Open latest version</Button>
            )}
          </div>
        )}

        {/* Mode tabs — a frozen record answers questions AND is read as a document; each gets a tab. */}
        {locked && hasQuestions && (
          <div className="mb-4 flex items-center gap-1 rounded-card border border-border bg-card p-1 shadow-card">
            <button
              onClick={() => setMode("answer")}
              className={cn("flex items-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition-colors",
                activeMode === "answer" ? "bg-primary text-white shadow-sm" : "text-text2 hover:bg-inset")}>
              <MessageSquareWarning size={15} /> Answer DGHR
              {openCount > 0 && (
                <span className={cn("nums rounded-full px-1.5 text-[11px] font-bold",
                  activeMode === "answer" ? "bg-white/20 text-white" : "bg-warning/15 text-warning")}>{openCount}</span>
              )}
            </button>
            <button
              onClick={() => setMode("record")}
              className={cn("flex items-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition-colors",
                activeMode === "record" ? "bg-primary text-white shadow-sm" : "text-text2 hover:bg-inset")}>
              <FileText size={15} /> What we sent
            </button>
          </div>
        )}

        {showAnswer && (
          <AnswerPanel
            saved={saved}
            questions={questions}
            repliesFor={repliesFor}
            openCount={openCount}
            answeredCount={answeredCount}
            canRevise={canRevise}
            busy={busy}
            onRevise={revise}
            onReplied={(p) => { setSaved(p); qc.invalidateQueries(); toast.success("Reply sent to DGHR."); }}
          />
        )}

        <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]", showAnswer && "hidden")}>
          {/* ─────────── LEFT: stepper ─────────── */}
          <div className="min-w-0">
            {/* progress */}
            <div className="mb-6 flex items-center">
              {STEPS.map((label, i) => {
                const n = i + 1, done = step > n, cur = step === n;
                return (
                  <div key={label} className={cn("flex items-center", n < 5 ? "flex-1" : "")}>
                    <button onClick={() => setStep(n)} className="group flex items-center gap-2.5">
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-tab ease-standard",
                        cur ? "bg-primary text-white shadow-card ring-4 ring-primary/20"
                            : done ? "bg-success text-white"
                            : "border-2 border-border-strong bg-card text-text3 group-hover:border-primary/50 group-hover:text-text2")}>
                        {done ? <Check size={16} /> : n}
                      </span>
                      <span className={cn("hidden whitespace-nowrap text-sm transition-colors duration-tab lg:block",
                        cur ? "font-bold text-text1" : done ? "font-semibold text-text2" : "font-medium text-text3")}>{label}</span>
                    </button>
                    {n < 5 && <div className={cn("mx-2.5 h-0.5 flex-1 rounded-full transition-colors duration-tab", done ? "bg-success" : "bg-border-strong")} />}
                  </div>
                );
              })}
            </div>

            {/* decision banners. DGHR clarifications live on the Answer tab now, not stacked here.
                A pointer nudges the reader there when questions are open. */}
            {saved.status === "rejected" && <Banner tone="danger" icon={<AlertTriangle size={16} />} title="Returned: rejected by DGHR" body={saved.decision_note} />}
            {saved.status === "approved" && <Banner tone="success" icon={<CheckCircle2 size={16} />} title="Approved by DGHR" body={saved.decision_note} />}
            {hasQuestions && openCount > 0 && (
              <button onClick={() => setMode("answer")}
                className="mb-4 flex w-full items-center gap-2 rounded-card border border-l-4 border-warning/30 border-l-warning bg-warning-bg/40 p-3 text-left text-sm text-warning hover:bg-warning-bg/60">
                <MessageSquareWarning size={16} className="shrink-0" />
                <span className="font-semibold">{openCount} open question{openCount > 1 ? "s" : ""} from DGHR.</span>
                <span className="text-text2">Switch to the Answer tab to respond.</span>
                <ChevronRight size={15} className="ml-auto shrink-0" />
              </button>
            )}

            <div className="rounded-card border border-border bg-card p-6 shadow-card">
              {/* STEP 1 */}
              {step === 1 && (
                <div className="space-y-5">
                  <SectionTitle icon={<Users size={16} />} title="Your team" hint="Your establishment, the people in it, and their time." />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Lbl>Department</Lbl><ReadOnlyField value={saved.department?.name ?? ""} /></div>
                    <div><Lbl>Typeset</Lbl><ReadOnlyField value={saved.department?.typeset ?? ""} /></div>
                  </div>

                  {/* Approved posts, people, and their time are three different questions. Only the
                      first is typed here; the rest are derived from the profile below, which is what
                      stops "current FTE" and "headcount" silently becoming the same number again. */}
                  <div className="grid gap-4 sm:grid-cols-4">
                    <div>
                      <Lbl>Approved positions</Lbl>
                      <input type="number" min={0} className={fieldCls} value={approvedPositions} disabled={locked}
                        onChange={(e) => setApprovedPositions(Math.max(0, Number(e.target.value)))} />
                      <p className="mt-1 text-[11px] text-text2">Authorised establishment.</p>
                    </div>
                    <div>
                      <Lbl>Filled positions</Lbl>
                      <CalcField value={wfTotals.hc.toLocaleString()} />
                      <p className="mt-1 text-[11px] text-text2">People in post, from the profile.</p>
                    </div>
                    <div>
                      <Lbl>Vacancies</Lbl>
                      <CalcField value={vacancies.toLocaleString()} />
                      <p className="mt-1 text-[11px]" style={{ color: vacancies < 0 ? "rgb(var(--danger))" : "rgb(var(--text-2))" }}>
                        {vacancies < 0 ? "Over establishment" : "Approved − filled."}
                      </p>
                    </div>
                    <div>
                      <Lbl>Establishment FTE</Lbl>
                      <CalcField value={fmtFte(establishmentFte)} />
                      <p className="mt-1 text-[11px] text-text2">
                        {wfTotals.hc - establishmentFte > 0 ? `${fmtFte(wfTotals.hc - establishmentFte)} below headcount (part-time).` : "All full-time."}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Lbl>Workforce profile: people, time, job-level mix & Emiratization</Lbl>
                    <div className="overflow-x-auto rounded-card border border-border">
                      <table className="w-full min-w-[420px] text-sm">
                        <thead><tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text3">
                          <th className="px-3 py-2.5 text-left">Job level</th>
                          <th className="px-3 py-2.5 text-right">Headcount</th>
                          <th className="px-3 py-2.5 text-right">FTE</th>
                          <th className="px-3 py-2.5 text-right">of which Emirati</th>
                          <th className="px-3 py-2.5 text-right">Annual cost</th>
                        </tr></thead>
                        <tbody>
                          {workforce.map((r, i) => (
                            <tr key={r.job_level} className="border-b border-border last:border-0">
                              <td className="px-3 py-2.5 text-text1">{LEVEL_LABEL[r.job_level]}</td>
                              <td className="px-3 py-2.5 text-right">
                                <input type="number" min={0} disabled={locked} value={r.headcount}
                                  onChange={(e) => setWf(i, { headcount: Math.max(0, Number(e.target.value)) })}
                                  className={numCellCls} />
                              </td>
                              {/* PEOPLE vs TIME. Two half-timers are 2 headcount and 1.0 FTE — the
                                  distinction the platform could not previously express. */}
                              <td className="px-3 py-2.5 text-right">
                                <input type="number" min={0} max={r.headcount} step={0.5} disabled={locked} value={r.fte ?? 0}
                                  onChange={(e) => setWf(i, { fte: Math.max(0, Number(e.target.value)) })}
                                  className={numCellCls} />
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <input type="number" min={0} max={r.headcount} disabled={locked} value={r.emirati_count}
                                  onChange={(e) => setWf(i, { emirati_count: Math.max(0, Number(e.target.value)) })}
                                  className={numCellCls} />
                              </td>
                              <td className="px-3 py-2.5 text-right nums text-text2">{fmtAED((Number(r.fte) || 0) * (COST_PER_FTE[r.job_level] || 0))}</td>
                            </tr>
                          ))}
                          <tr className="bg-surface2 font-semibold">
                            <td className="px-3 py-2.5 text-text1">Total</td>
                            <td className="px-3 py-2.5 text-right nums">{wfTotals.hc.toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right nums">{fmtFte(wfTotals.fte)}</td>
                            <td className="px-3 py-2.5 text-right nums">{wfTotals.pct}% Emirati</td>
                            <td className="px-3 py-2.5 text-right nums">{fmtAED(wfTotals.cost)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1.5 text-xs text-text3">Cost follows FTE, not headcount, at a standard annual rate per level. Feeds your Human Capital Overview and the government-wide roll-up.</p>
                  </div>

                  {/* Demographic distributions behind the HC Overview donuts. Each dimension should sum
                      to the department's headcount; the nationality Emirati bucket should match the
                      Emirati figure entered above. Optional, but this is what makes the donuts real. */}
                  {bands.length > 0 && (
                    <div>
                      <Lbl>Workforce demographics: feeds the Human Capital Overview donuts</Lbl>
                      <p className="mb-2 text-xs text-text3">Optional distributions across gender, age, grade, duty station and nationality. Each should sum to your headcount ({wfTotals.hc.toLocaleString()}).</p>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {bands.map((g, di) => {
                          const total = g.buckets.reduce((s, b) => s + (Number(b.headcount) || 0), 0);
                          const ok = total === wfTotals.hc;
                          return (
                            <div key={g.dimension} className="rounded-card border border-border bg-surface2 p-3">
                              <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold text-text1">{g.label}</span>
                                <span className={cn("shrink-0 text-[11px] nums", ok ? "text-success" : total === 0 ? "text-text3" : "text-warning")}>
                                  {total}/{wfTotals.hc}
                                  {!locked && <button type="button" onClick={() => evenFillBand(di)} className="ml-2 font-semibold text-primary hover:underline">even</button>}
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                {g.buckets.map((b, bi) => (
                                  <label key={b.bucket} className="flex items-center gap-2 text-[11px] text-text2">
                                    <span className="min-w-0 flex-1 truncate">{b.label}</span>
                                    <input type="number" min={0} disabled={locked} value={b.headcount}
                                      onChange={(e) => setBand(di, bi, Number(e.target.value))}
                                      className="h-8 w-20 shrink-0 rounded-btn border border-border bg-card px-2 text-right text-xs nums outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-inset disabled:text-text2" />
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Structured capacity in/out. "Two staff seconded to the digital programme until
                      March" belongs here, not in the notes box — a sentence cannot be counted, so
                      the department's supply silently read 2 FTE too high. */}
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Lbl>Secondments, contractors & temporary resources</Lbl>
                      {!locked && <Button variant="secondary" size="sm" onClick={addAdj}><Plus size={14} /> Add</Button>}
                    </div>
                    <p className="mb-2 mt-1 text-xs text-text3">
                      Anything changing the capacity you can actually deploy: people lent out or borrowed,
                      contractors, temporary cover, outsourced work. Don't describe these in the notes: recorded
                      here, they move your available FTE; described in prose, they move nothing.
                    </p>

                    {adjustments.length === 0 ? (
                      <p className="rounded-card border border-dashed border-border/60 bg-inset px-3 py-4 text-center text-xs text-text3">
                        None recorded. Your available FTE equals your establishment FTE.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {adjustments.map((a, i) => {
                          const sign = a.kind === "secondment_out" ? -1 : 1;
                          const signed = a.counts_in_supply ? sign * (Number(a.fte) || 0) : 0;
                          const isSecondment = a.kind === "secondment_in" || a.kind === "secondment_out";
                          const otherLabel = a.kind === "secondment_out" ? "Receiving department" : "Source department";
                          const otherKey = a.kind === "secondment_out" ? "receiving_department_id" : "source_department_id";
                          return (
                            <div key={i} className="rounded-card border border-border bg-surface2 p-3">
                              <div className="grid gap-3 sm:grid-cols-4">
                                <div>
                                  <Lbl>Type</Lbl>
                                  <select className={cn(fieldCls, "select-field")} value={a.kind} disabled={locked}
                                    onChange={(e) => setAdj(i, { kind: e.target.value as AdjustmentInput["kind"] })}>
                                    {(saved.adjustment_kinds ?? []).map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <Lbl>FTE</Lbl>
                                  <input type="number" min={0} step={0.5} className={fieldCls} value={a.fte} disabled={locked}
                                    onChange={(e) => setAdj(i, { fte: Math.max(0, Number(e.target.value)) })} />
                                  <p className="mt-1 text-[11px] text-text3">Always positive: the type decides the sign.</p>
                                </div>
                                <div>
                                  <Lbl>People</Lbl>
                                  <input type="number" min={0} className={fieldCls} value={a.headcount ?? 0} disabled={locked}
                                    onChange={(e) => setAdj(i, { headcount: Math.max(0, Number(e.target.value)) })} />
                                </div>
                                <div>
                                  <Lbl>Effect on supply</Lbl>
                                  <div className="flex h-10 items-center text-lg font-bold tabular-nums"
                                    style={{ color: signed > 0 ? "rgb(var(--success))" : signed < 0 ? "rgb(var(--danger))" : "rgb(var(--text-3))" }}>
                                    {signed === 0 ? "-" : `${signed > 0 ? "+" : "−"}${fmtFte(Math.abs(signed))} FTE`}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                                <div><Lbl>Description</Lbl>
                                  <input className={fieldCls} value={a.label ?? ""} disabled={locked} placeholder="e.g. Seconded to the digital programme"
                                    onChange={(e) => setAdj(i, { label: e.target.value })} /></div>
                                <div><Lbl>Start date</Lbl>
                                  <input type="date" className={fieldCls} value={a.starts_on ?? ""} disabled={locked}
                                    onChange={(e) => setAdj(i, { starts_on: e.target.value || null })} /></div>
                                <div><Lbl>End date</Lbl>
                                  <input type="date" className={fieldCls} value={a.ends_on ?? ""} disabled={locked}
                                    onChange={(e) => setAdj(i, { ends_on: e.target.value || null })} /></div>
                                <div>
                                  <Lbl>{isSecondment ? otherLabel : "Source"}</Lbl>
                                  {isSecondment ? (
                                    <select className={cn(fieldCls, "select-field")} disabled={locked}
                                      value={(a[otherKey as "source_department_id" | "receiving_department_id"] ?? "") as number | ""}
                                      onChange={(e) => setAdj(i, { [otherKey]: e.target.value ? Number(e.target.value) : null } as Partial<AdjustmentInput>)}>
                                      <option value="">Outside this entity</option>
                                      {(saved.sibling_departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                                    </select>
                                  ) : (
                                    <ReadOnlyField value="External to government" />
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs text-text2">
                                  <input type="checkbox" checked={a.counts_in_supply} disabled={locked}
                                    onChange={(e) => setAdj(i, { counts_in_supply: e.target.checked })}
                                    className="h-4 w-4 rounded border-border" />
                                  Include in available supply.
                                  <span className="text-text3">Untick for capacity you can't plan against (e.g. an outsourced service).</span>
                                </label>
                                {!locked && (
                                  <button onClick={() => removeAdj(i)} className="text-xs font-semibold text-danger hover:underline">Remove</button>
                                )}
                              </div>
                              <div className="mt-2">
                                <input className={fieldCls} value={a.note ?? ""} disabled={locked} placeholder="Note (optional)"
                                  onChange={(e) => setAdj(i, { note: e.target.value })} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* The chain, live. The entity sees exactly what DGHR will see. */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card bg-inset px-3 py-2.5 text-xs text-text2">
                      <span>Establishment <b className="nums text-text1">{fmtFte(establishmentFte)}</b></span>
                      <span className="text-text3">{netAdjustment >= 0 ? "+" : "−"}</span>
                      <span>adjustments <b className="nums text-text1">{fmtFte(Math.abs(netAdjustment))}</b></span>
                      <span className="text-text3">=</span>
                      <span>available <b className="nums text-primary">{fmtFte(availableFte)} FTE</b></span>
                      <span className="text-text3">(this is what your gap is measured against)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Your drivers */}
              {step === 3 && (
                <div className="space-y-5">
                  <SectionTitle icon={<Calculator size={16} />} title="Your drivers" hint="What can you count? Applications, inspections, projects, sites, people served." />
                  {drivers.map((d, i) => {
                    // Both periods, explicitly. This row used to show one unlabelled "FTE" sized
                    // from `volume`, so the forecast the user typed right beside it appeared to do
                    // nothing — and the number gave no clue which period it spoke for.
                    const fte = driverFte(registry, d.family, d.volume, d.params);
                    const fteFcst = driverFte(registry, d.family, measureVolume(d, "forecast"), d.params);
                    const stated = (Number(d.forecast) || 0) > 0;
                    return (
                      <div key={i} className="group rounded-card border border-border border-l-4 bg-card p-4 shadow-card" style={{ borderLeftColor: FAMILY_COLOR[d.family] }}>
                        <div className="mb-3 flex items-end gap-3">
                          <div className="flex-1"><Lbl>Driver</Lbl><input className={fieldCls} value={d.name} disabled={locked} placeholder="e.g. Applications processed" onChange={(e) => setDriver(i, { name: e.target.value })} /></div>
                          <div className="w-40"><Lbl>Family</Lbl>
                            <select className={cn(fieldCls, "select-field")} value={d.family} disabled={locked} onChange={(e) => setDriver(i, { family: e.target.value as Family })}>{FAMILIES.map((f) => <option key={f} value={f}>{FAMILY_LABEL[f]}</option>)}</select>
                          </div>
                          <div className="text-center"><Lbl>FTE this cycle</Lbl>
                            <div className="nums flex h-10 min-w-[62px] items-center justify-center rounded-btn px-3 text-base font-bold text-white" style={{ background: FAMILY_COLOR[d.family] }}>{fte}</div>
                          </div>
                          <div className="text-center"><Lbl>Next cycle</Lbl>
                            <div
                              title={stated ? "Sized from this driver's own forecast volume." : "No forecast stated (assumed flat)."}
                              className={cn("nums flex h-10 min-w-[62px] items-center justify-center rounded-btn border px-3 text-base font-bold",
                                stated ? "border-border bg-inset text-text1" : "border-dashed border-border bg-inset text-text3")}
                            >
                              {fteFcst}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                          <div><Lbl>Unit</Lbl><input className={fieldCls} value={d.unit} disabled={locked} onChange={(e) => setDriver(i, { unit: e.target.value })} /></div>
                          <div><Lbl>12-mo volume</Lbl><input type="number" className={fieldCls} value={d.volume} disabled={locked} onChange={(e) => setDriver(i, { volume: Number(e.target.value) })} /></div>
                          <div><Lbl>Next-yr forecast</Lbl><input type="number" className={fieldCls} value={d.forecast} disabled={locked} onChange={(e) => setDriver(i, { forecast: Number(e.target.value) })} /></div>
                          <ParamField family={d.family} params={d.params} locked={locked} onChange={(k, v) => setParam(i, k, v)} />
                        </div>
                        {/* Where the volume came from — provenance a reviewer can check, not a bare number. */}
                        <div className="mt-3"><Lbl>Source of this volume</Lbl>
                          <input className={fieldCls} value={d.source ?? ""} disabled={locked}
                            placeholder="e.g. FY2026 case-management system extract"
                            onChange={(e) => setDriver(i, { source: e.target.value })} /></div>
                        <div className="mt-2.5 flex items-center justify-between gap-3">
                          <span className="rounded-btn bg-inset px-2 py-1 font-mono text-[11px] text-text3">ƒ {familyHint(registry, d.family)}</span>
                          {!locked && <button className="text-xs font-semibold text-text3 opacity-0 transition-opacity duration-fast hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" onClick={() => setDrivers((ds) => ds.filter((_, j) => j !== i))}><Trash2 size={13} className="mr-1 inline" />Remove</button>}
                        </div>
                      </div>
                    );
                  })}
                  {!locked && <button onClick={() => setDrivers((ds) => [...ds, { name: "", unit: "", family: "demand", volume: 0, forecast: 0, source: "", params: { ...emptyParams } }])}
                    className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-3 text-sm font-semibold text-text2 transition-colors duration-fast hover:border-primary hover:bg-primary/[0.04] hover:text-primary"><Plus size={16} /> Add driver</button>}
                </div>
              )}

              {/* STEP 4: Fixed requirements */}
              {step === 4 && (
                <div className="space-y-4">
                  <SectionTitle icon={<ScrollText size={16} />} title="Fixed requirements" hint="Roles you must hold by law, regulation, licence or safety rule (a statutory floor)." />
                  {mandates.map((m, i) => (
                    <div key={i} className="group flex items-end gap-3 rounded-card border border-border bg-surface2 p-4">
                      <div className="flex-1"><Lbl>Role & legal basis</Lbl><input className={fieldCls} value={m.role} disabled={locked} placeholder="e.g. Licensed inspectors (Law 12/2024, Art. 6)" onChange={(e) => setMandates((ms) => ms.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} /></div>
                      <div className="w-28"><Lbl>Positions</Lbl><input type="number" className={fieldCls} value={m.positions} disabled={locked} onChange={(e) => setMandates((ms) => ms.map((x, j) => j === i ? { ...x, positions: Number(e.target.value) } : x))} /></div>
                      {!locked && <button aria-label="Remove requirement" className="mb-2.5 text-text3 opacity-0 transition-opacity duration-fast hover:text-danger focus-visible:opacity-100 group-hover:opacity-100" onClick={() => setMandates((ms) => ms.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
                    </div>
                  ))}
                  {mandates.length === 0 && (
                    <div className="flex flex-col items-center gap-2.5 rounded-card border border-dashed border-border/60 bg-inset px-6 py-8 text-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface2 text-text3"><ScrollText size={20} /></span>
                      <div className="text-sm font-semibold text-text1">None recorded.</div>
                      <p className="max-w-sm text-xs leading-relaxed text-text3">Most departments have none. Add one only if a law or licence fixes a minimum.</p>
                    </div>
                  )}
                  {!locked && <button onClick={() => setMandates((ms) => [...ms, { role: "", legal_basis: "", positions: 1 }])}
                    className="flex w-full items-center justify-center gap-2 rounded-card border border-dashed border-border py-3 text-sm font-semibold text-text2 transition-colors duration-fast hover:border-primary hover:bg-primary/[0.04] hover:text-primary"><Plus size={16} /> Add fixed requirement</button>}
                </div>
              )}

              {/* STEP 2 (moved): Smart Assist, right after Your team */}
              {step === 2 && (
                <div className="space-y-4">
                  <SectionTitle icon={<MessageSquareWarning size={16} />} title="Notes & Smart Assist" hint="Anything the numbers don't show. Or describe your work in plain words and let Smart Assist draft the entries." />
                  <div className="relative mx-auto max-w-2xl">
                    {/* Static blue→purple glow — sets an assistive, generative mood, no motion. */}
                    <div aria-hidden className="pointer-events-none absolute inset-0 -m-6 rounded-card"
                      style={{ background: "radial-gradient(46% 60% at 22% 0%, rgb(var(--primary) / 0.13), transparent 70%), radial-gradient(46% 62% at 88% 6%, rgb(var(--purple) / 0.13), transparent 70%)" }} />
                    <div className="relative space-y-3">
                      <Textarea rows={6} disabled={locked} value={notes} onChange={(e) => setNotes(e.target.value)}
                        placeholder="Type freely, or record a voice note. Peaks, secondments, new regulations, volumes…" />
                      {!locked && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" onClick={runSmartAssist} disabled={aiBusy}><Sparkles size={15} /> {aiBusy ? "Reading…" : "Draft with Smart Assist"}</Button>
                          <Button variant="secondary" size="sm" onClick={voiceNote}
                            className={speech.listening ? "!border-danger/40 !text-danger" : ""}>
                            <Mic size={15} className={speech.listening ? "animate-pulse" : ""} />
                            {speech.listening ? "Listening… tap to stop" : "Record a voice note"}
                          </Button>
                          <VoiceLangToggle />
                        </div>
                      )}
                      {suggest && (
                    <div className="rounded-card border border-dashed border-teal/50 bg-teal-bg/30 p-4">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal"><Sparkles size={13} /> Smart Assist {suggest.source === "ai" ? "(live model)" : "(offline)"}: nothing is added until you accept</div>
                      {suggest.drivers.map((d, i) => (
                        <div key={i} className="mb-2 flex items-center gap-3 rounded-lg bg-card/70 p-2.5">
                          <div className="flex-1 min-w-0"><div className="font-semibold text-text1">{d.name}</div><div className="text-xs text-text3">{Number(d.volume).toLocaleString()} {d.unit}, forecast {Number(d.forecast).toLocaleString()}, {FAMILY_LABEL[d.family]}</div></div>
                          <Button size="sm" onClick={() => acceptDriver(d)}><Plus size={13} /> Add as driver</Button>
                        </div>
                      ))}
                      {suggest.mandates.map((mm, i) => (
                        <div key={i} className="mb-2 flex items-center gap-3 rounded-lg bg-card/70 p-2.5">
                          <div className="flex-1 min-w-0"><div className="font-semibold text-text1">{mm.role}</div><div className="text-xs text-text3">Statutory floor: {mm.positions} positions</div></div>
                          <Button size="sm" onClick={() => acceptMandate(mm)}><Plus size={13} /> Add requirement</Button>
                        </div>
                      ))}
                      {suggest.context.map((c, i) => <p key={i} className="flex items-start gap-1.5 text-xs text-text2"><Info size={13} className="mt-0.5 shrink-0 text-teal" /> {c}</p>)}
                    </div>
                  )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5 — complete submission summary + attestation */}
              {step === 5 && (
                <div className="space-y-5">
                  <SectionTitle icon={<Send size={16} />} title="Review & submit" hint="The whole submission on one page. Confirm it, attest, and send to DGHR." />

                  {/* ── the headline: required vs available, and the gap ── */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <SummaryStat icon={<Target size={16} />} label="Required FTE" value={live.required_fte} tone="#7C3AED" sub="what the work needs" />
                    <SummaryStat icon={<Users size={16} />} label="Available FTE" value={fmtFte(live.current_fte)} tone="#2563EB" sub="net of secondments" />
                    <SummaryStat icon={<TrendingUp size={16} />} label={live.gap < 0 ? "Shortfall" : "Surplus"} value={`${live.gap > 0 ? "+" : ""}${fmtFte(live.gap)}`} tone={live.gap < 0 ? "#E11D48" : "#15803D"} sub="available − required" />
                    <SummaryStat icon={<Users size={16} />} label="Headcount" value={wfTotals.hc.toLocaleString()} tone="#0D9488" sub={`${fmtFte(wfTotals.fte)} FTE`} />
                  </div>

                  {/* ── warnings & unresolved validations ── */}
                  {(() => {
                    const warns = [...(saved.sizing.flags ?? []), ...(saved.supply?.flags ?? [])];
                    const openClars = saved.clarifications.filter((c) => c.side === "dghr" && c.status === "open");
                    if (!warns.length && !openClars.length) {
                      return (
                        <div className="flex items-center gap-2 rounded-card border border-l-4 border-border border-l-success bg-success-bg/40 px-4 py-3 text-sm font-medium text-success">
                          <CheckCircle2 size={16} className="shrink-0" /> No warnings or unresolved clarifications.
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-card border border-l-4 border-border border-l-warning bg-warning-bg p-4">
                        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-warning"><AlertTriangle size={15} /> Warnings & unresolved validations</div>
                        <ul className="space-y-1 text-xs text-warning">
                          {warns.map((f, k) => <li key={`w${k}`} className="flex gap-1.5"><span>•</span>{f}</li>)}
                          {openClars.map((c) => <li key={`c${c.id}`} className="flex gap-1.5"><span>•</span>Unanswered clarification on <b>{c.element_label || c.element_type}</b>: {c.message}</li>)}
                        </ul>
                        <div className="mt-2 text-[11px] text-warning/80">These don't block submission, but DGHR will see them. Resolve what you can first.</div>
                      </div>
                    );
                  })()}

                  {/* ── current workforce, job-level profile, Emiratization, cost ── */}
                  {saved.workforce?.has_data && (
                    <SummaryCard title="Current workforce" hint="People, time, job-level mix, Emiratization and cost.">
                      <HcTiles hc={saved.workforce} />
                      <div className="mt-4"><LevelBar levels={saved.workforce.by_level} /></div>
                    </SummaryCard>
                  )}

                  {/* ── supply reconciliation: establishment → available ── */}
                  {saved.supply?.has_data && (
                    <SummaryCard title="Current FTE & supply" hint="Approved posts → people → their time → capacity in and out.">
                      <SupplyChain s={saved.supply} />
                    </SummaryCard>
                  )}

                  {/* ── all workload drivers, with their sources ── */}
                  <SummaryCard title="Workload drivers" hint="Every driver, its sized FTE, and where its volume came from.">
                    {drivers.length === 0 ? <p className="text-sm text-text3">No drivers entered.</p> : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[520px] text-left text-sm">
                          <thead><tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text3"><th className="py-2">Driver</th><th className="py-2">Family</th><th className="py-2 text-right">Volume</th><th className="py-2 text-right">Forecast</th><th className="py-2 text-right">FTE</th></tr></thead>
                          <tbody>{drivers.map((d, i) => (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="py-2.5">
                                <div className="text-text1">{d.name || <span className="text-text3">(unnamed)</span>}</div>
                                <div className="text-[11px] text-text3">{d.source?.trim() ? `Source: ${d.source}` : <span className="text-danger">Source not stated</span>}</div>
                              </td>
                              <td className="py-2.5"><FamilyChip family={d.family} /></td>
                              <td className="py-2.5 text-right nums text-text2">{Number(d.volume).toLocaleString()}{d.unit ? ` ${d.unit}` : ""}</td>
                              <td className="py-2.5 text-right nums text-text3">{Number(d.forecast) > 0 ? Number(d.forecast).toLocaleString() : "flat"}</td>
                              <td className="py-2.5 text-right nums font-semibold text-text1">{driverFte(registry, d.family, d.volume, d.params)}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-card bg-inset px-3 py-2 text-xs text-text2">
                      <span className="nums rounded-btn bg-surface2 px-2 py-1">Build-up {live.build_up}</span><span>vs</span>
                      <span className="nums rounded-btn bg-surface2 px-2 py-1">Floor {live.floor_total}</span><span>→ max →</span>
                      <span className="nums rounded-btn bg-navy-900 px-2 py-1 font-semibold text-white">Required {live.required_fte}</span>
                    </div>
                  </SummaryCard>

                  {/* ── fixed requirements (statutory floors) ── */}
                  {mandates.length > 0 && (
                    <SummaryCard title="Fixed requirements" hint="Statutory floors: legal minimums that can override the workload build-up.">
                      {mandates.map((mm, i) => (
                        <div key={i} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                          <span className="text-text1">{mm.positions} × {mm.role || "-"}{mm.legal_basis ? <span className="text-text3">, {mm.legal_basis}</span> : ""}</span>
                        </div>
                      ))}
                    </SummaryCard>
                  )}

                  {/* ── forecast assumptions ── */}
                  <SummaryCard title="Forecast assumptions" hint="What next cycle needs, and how it's derived.">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-card bg-inset p-3"><div className="text-[11px] text-text3">Next-cycle required</div><div className="nums text-lg font-bold text-text1">{live.forecast_required_fte ?? live.required_fte}{live.planning_change != null && live.planning_change !== 0 && <span className={cn("ml-1 text-sm", live.planning_change > 0 ? "text-danger" : "text-success")}>({live.planning_change > 0 ? "+" : ""}{live.planning_change})</span>}</div></div>
                      <div className="rounded-card bg-inset p-3"><div className="text-[11px] text-text3">Basis</div><div className="text-xs font-semibold text-text2">{live.forecast_stated ? "From your stated forecast volumes" : "No forecast stated (next cycle assumed flat)"}</div></div>
                    </div>
                    {saved.projection?.assumptions && (
                      <p className="mt-2 text-[11px] leading-relaxed text-text3">{saved.projection.assumptions.demand} {saved.projection.assumptions.supply}</p>
                    )}
                  </SummaryCard>

                  {/* ── temporary workforce adjustments ── */}
                  {(saved.supply?.adjustments?.length ?? 0) > 0 && (
                    <SummaryCard title="Temporary workforce adjustments" hint="Secondments, contractors and temporary resources that move your available FTE.">
                      <AdjustmentList rows={saved.supply.adjustments} />
                    </SummaryCard>
                  )}

                  {/* ── supporting documents ── */}
                  <SummaryCard title="Supporting documents" hint="Evidence attached to this department's submission.">
                    {saved.documents.length === 0 ? (
                      <p className="text-sm text-text3">No documents attached.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {saved.documents.map((doc) => (
                          <a key={doc.id} href={api.planning.documentDownloadUrl(doc.id)} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 rounded-btn bg-surface2 px-2.5 py-2 text-sm transition-colors duration-fast hover:bg-surface3">
                            <FileText size={15} className="shrink-0 text-text3" />
                            <span className="min-w-0 flex-1 truncate text-text1">{doc.filename}</span>
                            <span className="rounded bg-inset px-1.5 py-0.5 text-[10px] text-text2">{doc.category}</span>
                            {doc.scope === "entity" && <span className="text-[10px] text-text3">entity-wide</span>}
                            {doc.missing && <span className="text-[10px] text-warning">reference</span>}
                          </a>
                        ))}
                      </div>
                    )}
                    {!locked && saved.entity && (
                      <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-primary hover:underline">
                        <Plus size={14} /> Attach a document
                        <input type="file" className="hidden" disabled={busy}
                          onChange={async (e) => {
                            const f = e.target.files?.[0]; if (!f || !saved.entity || !saved.department) return;
                            setBusy(true);
                            try { await api.planning.uploadDocument(saved.entity.id, f, "Supporting evidence", attestedBy.trim() || "Entity user", saved.department.id); qc.invalidateQueries(); toast.success("Document attached."); setSaved(await api.planning.submission(saved.department.id)); }
                            catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed."); }
                            finally { setBusy(false); e.target.value = ""; }
                          }} />
                      </label>
                    )}
                  </SummaryCard>

                  {/* ── projection ── */}
                  {saved.projection?.points?.length ? (
                    <SummaryCard title="Projection" hint={`Demand vs supply over ${saved.projection.assumptions?.horizon_years ?? saved.projection.years ?? "-"} years if nothing changes.`}>
                      <ProjectedGapChart points={saved.projection.points} height={190} />
                    </SummaryCard>
                  ) : null}

                  {notes && <SummaryCard title="Note"><p className="text-sm text-text2">{notes}</p></SummaryCard>}

                  {/* S10-14: the HR champion verifies this consolidated report before it goes to DGHR. */}
                  <SummaryCard title="Champion review" hint="The entity's HR champion verifies this consolidated report, then it is submitted to DGHR.">
                    {saved.champion_verified_by ? (
                      <div className="flex items-center gap-2 text-sm text-success"><ShieldCheck size={16} /> Verified by HR champion <b className="text-text1">{saved.champion_verified_by}</b>{saved.champion_verified_at ? `, ${saved.champion_verified_at.slice(0, 10)}` : ""}.</div>
                    ) : locked ? (
                      <div className="text-sm text-text3">This submission was sent without a recorded champion verification.</div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-sm text-text2">HR champion: <b className="text-text1">{saved.entity?.champion_name ?? "-"}</b></div>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={championVerify}><ShieldCheck size={15} /> Verify as HR champion</Button>
                        <span className="text-[11px] text-text3">Confirms the drivers, rationale and FTEs make sense before DGHR sees them.</span>
                      </div>
                    )}
                  </SummaryCard>

                  {/* ── attestation + submit ── */}
                  {locked ? (
                    <div className="rounded-card border border-border bg-info-bg/40 p-4 text-sm text-text2">
                      This submission is with DGHR for review.
                      {saved.attested && saved.attested_by && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-text3"><ShieldCheck size={13} className="text-success" /> Attested by <b className="text-text1">{saved.attested_by}</b>{saved.attested_at ? ` on ${saved.attested_at.slice(0, 10)}` : ""}.</div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-card border-2 border-primary/30 bg-primary/5 p-4">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-border" />
                        <span className="text-sm text-text1">{saved.attestation_text || "I confirm that the submitted figures are complete, supported by the stated sources and approved by the relevant entity owner."}</span>
                      </label>
                      <div className="mt-3 max-w-xs">
                        <Lbl>Confirmed by (full name)</Lbl>
                        <input className={fieldCls} value={attestedBy} onChange={(e) => setAttestedBy(e.target.value)} placeholder="Name of the confirming officer" />
                      </div>
                      <Button className="mt-4 w-full" onClick={submit} disabled={busy || locked || !attested || !attestedBy.trim()}>
                        <Send size={16} /> {saved.status === "draft" ? "Attest & submit to DGHR" : "Attest & resubmit to DGHR"}
                      </Button>
                      {(!attested || !attestedBy.trim()) && <p className="mt-2 text-center text-[11px] text-text3">Tick the confirmation and add your name to enable submission.</p>}
                    </div>
                  )}
                </div>
              )}

              {/* nav */}
              <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
                <Button variant="secondary" disabled={step === 1} onClick={() => setStep((s) => Math.max(1, s - 1))}><ChevronLeft size={15} /> Back</Button>
                {step < 5 && <Button onClick={next} disabled={busy}>Continue <ChevronRight size={15} /></Button>}
              </div>
            </div>
          </div>

          {/* ─────────── RIGHT: live sizing rail ─────────── */}
          <aside className="space-y-4 self-start lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
              <div className="flex items-center justify-between bg-navy-900 px-5 py-3.5">
                <div className="flex items-center gap-2 text-white"><Calculator size={16} /><span className="text-sm font-semibold">Live sizing</span></div>
                <StatusBadge value={Q_STATUS_VALUE[saved.status]} label={Q_STATUS_LABEL[saved.status]} />
              </div>
              <div className="p-5">
                {/* The panel says WHICH PERIOD it represents. It always sized from the reported
                    12-month volume, but nothing said so — leaving "Required FTE" ambiguous between
                    this cycle, next cycle, an approved establishment and a recommendation. */}
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text3">
                  {currentMeasure?.label ?? "Current required FTE"}
                </div>
                {/* Computed client-side from the DB-held formula. The test hook pins the assertion
                    that this equals what the server stores — the two must never drift. */}
                <div data-testid="live-required-fte" className="nums text-[40px] font-bold leading-none text-text1">{live.required_fte}</div>
                <div className="mt-1 text-[11px] text-text3">
                  {currentMeasure?.period_note ?? "This cycle, from reported 12-month volumes."}
                </div>

                <MeasureTable measures={live.measures} forecastStated={live.forecast_stated} />

                {/* "Current" here means ON PAYROLL (supply) — deliberately not called "current",
                    which now names the current-volume DEMAND figure above. Two different "currents"
                    on one panel would be worse than the ambiguity this change removes. */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {/* Net of secondments — so "on payroll" was the wrong word for it. */}
                  <div className="rounded-card bg-surface2 p-3"><div className="text-[11px] text-text3">Available today</div><div className="nums text-xl font-bold text-text1">{fmtFte(live.current_fte)}</div></div>
                  <div className="rounded-card bg-surface2 p-3"><div className="text-[11px] text-text3">Gap vs this cycle</div><div className={cn("nums text-xl font-bold", live.gap < 0 ? "text-danger" : "text-success")}>{live.gap > 0 ? "+" : ""}{live.gap}</div></div>
                </div>
                {live.family_split.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3">By family</div>
                    <div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-surface2">
                      {live.family_split.map((p) => <div key={p.family} style={{ width: `${(p.fte / Math.max(1, live.family_split.reduce((s, x) => s + x.fte, 0))) * 100}%`, background: FAMILY_COLOR[p.family] }} />)}
                    </div>
                    <div className="space-y-1">
                      {live.family_split.map((p) => <div key={p.family} className="flex items-center gap-2 text-xs"><span className="h-2.5 w-2.5 rounded" style={{ background: FAMILY_COLOR[p.family] }} /><span className="flex-1 text-text2">{FAMILY_LABEL[p.family]}</span><span className="nums font-semibold text-text1">{p.fte}</span></div>)}
                    </div>
                  </div>
                )}
                {live.floor_total > 0 && <div className="mt-4 rounded-card bg-danger/5 px-3 py-2 text-xs text-text2">Statutory floor <b className="nums text-danger">{live.floor_total}</b>{live.floor_binds ? ", binds (overrides workload)" : ""}</div>}
              </div>
            </div>
            {/* Workforce profile summary (live) */}
            <div className="rounded-card border border-border bg-card p-5 shadow-card">
              <div className="mb-3 text-sm font-semibold text-text1">Workforce profile</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-card bg-surface2 p-2"><div className="text-[11px] text-text3">Headcount</div><div className="nums text-lg font-bold text-text1">{wfTotals.hc.toLocaleString()}</div></div>
                <div className="rounded-card bg-surface2 p-2"><div className="text-[11px] text-text3">Emirati</div><div className="nums text-lg font-bold text-text1">{wfTotals.pct}%</div></div>
                <div className="rounded-card bg-surface2 p-2"><div className="text-[11px] text-text3">Cost</div><div className="nums text-sm font-bold text-text1">{fmtAED(wfTotals.cost)}</div></div>
              </div>
            </div>

            {/* Projected gap (server-computed; refreshes on save) */}
            {saved.projection?.points?.length ? (
              <div className="rounded-card border border-border bg-card p-5 shadow-card">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Projected gap</div>
                  <span className="text-[11px] text-text3">{saved.projection.years ?? "-"} yrs</span>
                </div>
                <ProjectedGapChart points={saved.projection.points} height={150} />
                <p className="mt-1 text-[11px] text-text3">Updates when you save. {saved.projection.assumptions?.note}</p>
              </div>
            ) : null}

            <div className="rounded-card border border-border bg-inset p-4 text-xs leading-relaxed text-text3">
              <b className="text-text2">How it works:</b> required FTE = max(workload build-up, statutory floor). Demand posts are ceilinged; floors are reported separately and never trimmed.
            </div>
          </aside>
        </div>
      </PageBody>
    </>
  );
}

function SummaryCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="text-sm font-semibold text-text1">{title}</div>
      {hint && <div className="mb-3 text-xs text-text3">{hint}</div>}
      {!hint && <div className="mb-1" />}
      {children}
    </div>
  );
}

function SummaryStat({ label, value, sub, tone, icon }: { label: string; value: React.ReactNode; sub?: string; tone: string; icon?: React.ReactNode }) {
  const t = useTone();
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      {icon && (
        <span className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: t.chip(tone), color: t.fg(tone) }}>{icon}</span>
      )}
      <div className="nums text-[26px] font-bold leading-none" style={{ color: t.fg(tone) }}>{value}</div>
      <div className="mt-1.5 text-xs font-semibold text-text1">{label}</div>
      {sub && <div className="text-[11px] text-text3">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return <div className="border-b border-border pb-3"><div className="flex items-center gap-2 text-text1"><span className="text-primary">{icon}</span><h2 className="text-base font-bold">{title}</h2></div><p className="mt-1 text-xs text-text3">{hint}</p></div>;
}
function FamilyChip({ family }: { family: Family }) {
  return <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: FAMILY_COLOR[family] }}>{FAMILY_LABEL[family]}</span>;
}
function ParamField({ family, params, locked, onChange }: { family: Family; params: any; locked: boolean; onChange: (k: string, v: number) => void }) {
  const inp = (k: string, label: string, step?: string, dflt = 0) => (
    <div><Lbl>{label}</Lbl><input type="number" step={step} className={fieldCls} value={params[k] ?? dflt} disabled={locked} onChange={(e) => onChange(k, Number(e.target.value))} /></div>
  );
  if (family === "demand") return inp("minutes_per_unit", "Min / unit");
  if (family === "ratio") return inp("serving_ratio", "Ratio 1:n");
  if (family === "coverage") return inp("relief_factor", "Relief ×", "0.05", 1);
  if (family === "mandate") return <div className="flex items-end pb-2 text-[11px] text-text3">Volume = statutory positions</div>;
  return inp("team_size", "Team / unit", "0.1");
}
// ── Answer tab: a frozen record's questions, one self-contained card each ──────────────────────
// Task-first: each DGHR question shows the figure it's about, the full back-and-forth (your replies
// included — the old inline banner threw them away), and one place to answer. Reply explains a
// figure; revising corrects it — the two are kept visibly distinct.
const ELEMENT_KIND_LABEL: Record<string, string> = {
  driver: "Demand driver", mandate: "Statutory floor", profile: "Workforce profile",
  supply: "Supply reconciliation", notes: "Notes", submission: "Submission",
};

function AnswerPanel({ saved, questions, repliesFor, openCount, answeredCount, canRevise, busy, onRevise, onReplied }: {
  saved: SubmissionPayload; questions: Clarification[]; repliesFor: (qid: number) => Clarification[];
  openCount: number; answeredCount: number; canRevise: boolean; busy: boolean;
  onRevise: () => void; onReplied: (p: SubmissionPayload) => void;
}) {
  const openQs = questions.filter((q) => q.status === "open");
  const mostUrgent = openQs.slice().sort((a, b) => (URGENCY_RANK[b.level] ?? 0) - (URGENCY_RANK[a.level] ?? 0))[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* progress strip — what's left, how urgent, and the one escalation path */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-warning/15 text-warning"><MessageSquareWarning size={18} /></span>
          <div>
            <div className="text-sm font-bold text-text1">{questions.length} question{questions.length > 1 ? "s" : ""} from DGHR</div>
            <div className="text-xs text-text3">{openCount} to answer, {answeredCount} answered</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5" title="One dot per question">
          {questions.map((q) => <span key={q.id} title={q.element_label} className={cn("h-2.5 w-2.5 rounded-full", q.status === "open" ? "bg-warning" : "bg-success")} />)}
        </div>
        {mostUrgent && <UrgencyChip q={mostUrgent} />}
        {canRevise && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={onRevise} disabled={busy}>
            <GitBranch size={15} /> Revise to correct a figure
          </Button>
        )}
      </div>

      {openCount === 0 && (
        <div className="flex items-center gap-2 rounded-card border border-l-4 border-border border-l-success bg-success-bg/40 px-4 py-3 text-sm font-medium text-success">
          <CheckCircle2 size={16} /> All questions answered. DGHR will follow up if anything else is needed.
        </div>
      )}

      {questions.map((q) => (
        <QuestionCard key={q.id} q={q} replies={repliesFor(q.id)} saved={saved} canRevise={canRevise} busy={busy} onRevise={onRevise} onReplied={onReplied} />
      ))}
    </div>
  );
}

const URGENCY_RANK: Record<string, number> = { open: 0, due_soon: 1, overdue: 2, escalated: 3 };
function UrgencyChip({ q }: { q: Clarification }) {
  const asked = q.created_at ? `Asked ${relativeTime(q.created_at)}` : "";
  if (q.level === "escalated") return <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-semibold text-danger"><AlertCircle size={12} /> Escalated, {Math.round(q.days_over)}d over SLA</span>;
  if (q.level === "overdue") return <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2.5 py-1 text-[11px] font-semibold text-danger"><AlertCircle size={12} /> Overdue, {Math.round(q.days_over)}d</span>;
  if (q.level === "due_soon") return <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning"><Clock size={12} /> Due soon</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-inset px-2.5 py-1 text-[11px] font-medium text-text3" title={asked}><Clock size={12} /> {asked || "Within SLA"}</span>;
}

function QuestionCard({ q, replies, saved, canRevise, busy, onRevise, onReplied }: {
  q: Clarification; replies: Clarification[]; saved: SubmissionPayload;
  canRevise: boolean; busy: boolean; onRevise: () => void; onReplied: (p: SubmissionPayload) => void;
}) {
  const open = q.status === "open";
  const [showReply, setShowReply] = useState(false);
  const kind = ELEMENT_KIND_LABEL[q.element_type] ?? "Submission";
  const title = q.element_label || q.element_type;
  // DGHR often labels a whole-section question with the section's own name; don't print it twice.
  const showKind = title.toLowerCase() !== kind.toLowerCase();
  return (
    <div className={cn("overflow-hidden rounded-card border shadow-card", open ? "border-warning/40" : "border-border")}>
      <div className={cn("flex flex-wrap items-center gap-2 border-b px-4 py-3", open ? "border-warning/20 bg-warning-bg/30" : "border-border bg-inset/60")}>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", open ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
          {open ? <MessageSquareWarning size={15} /> : <CheckCircle2 size={15} />}
        </span>
        <div className="min-w-0">
          {showKind && <div className="text-[11px] font-semibold uppercase tracking-wide text-text3">{kind}</div>}
          <div className="text-sm font-bold text-text1">{title}</div>
        </div>
        <div className="ml-auto">
          {open ? <UrgencyChip q={q} />
            : <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success"><Check size={12} /> Answered</span>}
        </div>
      </div>

      <div className="space-y-3 bg-card p-4">
        <InlineFigure saved={saved} q={q} />
        <Thread q={q} replies={replies} />

        {open ? (
          <>
            <ClarificationReply c={q} subId={saved.id} onReplied={onReplied} />
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text3">
              <Info size={12} className="shrink-0" />
              <span>Replying <b className="text-text2">explains</b> the figure. If the number itself is wrong,</span>
              {canRevise
                ? <button onClick={onRevise} disabled={busy} className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline disabled:opacity-50"><PencilLine size={12} /> revise to correct it →</button>
                : <span>revise the latest version to correct it.</span>}
            </div>
          </>
        ) : showReply ? (
          <ClarificationReply c={q} subId={saved.id} onReplied={onReplied} />
        ) : (
          <button onClick={() => setShowReply(true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"><CornerDownRight size={13} /> Add another reply</button>
        )}
      </div>
    </div>
  );
}

function Thread({ q, replies }: { q: Clarification; replies: Clarification[] }) {
  const msgs = [q, ...replies];
  return (
    <div className="space-y-2">
      {msgs.map((mm) => {
        const isDghr = mm.side === "dghr";
        return (
          <div key={mm.id} className={cn("rounded-lg p-3 text-sm", isDghr ? "bg-inset" : "ml-5 border border-primary/20 bg-primary/5")}>
            <div className="mb-1 flex items-center gap-1.5 text-[11px] text-text3">
              {isDghr ? <MessageSquareWarning size={12} className="text-warning" /> : <CornerDownRight size={12} className="text-primary" />}
              <span className="font-semibold text-text2">{isDghr ? (mm.author || "DGHR") : "You"},</span>
              <span>{isDghr ? "DGHR" : "Entity"}{mm.created_at ? "," : ""}</span>
              {mm.created_at && <span>{relativeTime(mm.created_at)}</span>}
            </div>
            <div className="text-text1">{mm.message}</div>
          </div>
        );
      })}
    </div>
  );
}

/** The exact figure a question is about, pulled from the submitted record so the user never hunts. */
function InlineFigure({ saved, q }: { saved: SubmissionPayload; q: Clarification }) {
  const rows = figureRows(saved, q);
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-border bg-inset/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text3"><Target size={12} /> The figure in question</div>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map((r, i) => {
          const wide = r.value.length > 40;
          return (
            <div key={i} className={cn("border-b border-border/40 pb-1 last:border-0", wide ? "sm:col-span-2" : "flex items-baseline justify-between gap-3")}>
              <span className="text-xs text-text2">{r.label}</span>
              <span className={cn("text-sm font-semibold text-text1", wide ? "mt-0.5 block" : "nums")}>{r.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function figureRows(saved: SubmissionPayload, q: Clarification): { label: string; value: string }[] {
  switch (q.element_type) {
    case "driver": {
      const d = saved.sizing.drivers.find((x) => (x.element_key && x.element_key === q.element_key) || x.id === q.element_id);
      if (!d) return [];
      return [
        { label: "Driver", value: d.name },
        { label: "Reported volume", value: `${d.volume.toLocaleString()} ${d.unit}` },
        { label: "Forecast volume", value: d.forecast_stated === false ? "not stated (assumed flat)" : `${d.forecast.toLocaleString()} ${d.unit}` },
        { label: "Source", value: d.source || "-" },
        { label: "Sizes to", value: `${fmtFte(d.fte)} FTE` },
      ];
    }
    case "mandate": {
      const mnd = saved.sizing.mandates.find((x) => x.role === q.element_label);
      if (!mnd) return [];
      return [
        { label: "Role", value: mnd.role },
        { label: "Legal basis", value: mnd.legal_basis || "-" },
        { label: "Statutory positions", value: String(mnd.positions) },
      ];
    }
    case "profile": {
      const w = saved.workforce;
      return [
        { label: "Headcount", value: w.headcount.toLocaleString() },
        { label: "Establishment FTE", value: fmtFte(w.fte) },
        { label: "Emiratization", value: `${w.emiratization_pct}%` },
        { label: "Emirati headcount", value: w.emirati_count.toLocaleString() },
        { label: "Annual cost", value: fmtAED(w.annual_cost_aed) },
      ];
    }
    case "supply": {
      const s = saved.supply;
      return [
        { label: "Approved positions", value: s.approved_positions.toLocaleString() },
        { label: "Filled positions", value: s.filled_positions.toLocaleString() },
        { label: "Vacancies", value: s.vacancies.toLocaleString() },
        { label: "Establishment FTE", value: fmtFte(s.establishment_fte) },
        { label: "Net adjustments", value: `${s.net_adjustment_fte >= 0 ? "+" : ""}${fmtFte(s.net_adjustment_fte)} FTE` },
        { label: "Available FTE", value: fmtFte(s.available_fte) },
      ];
    }
    case "notes":
      return saved.notes ? [{ label: "Your note", value: saved.notes }] : [];
    default:
      return [
        { label: "Required FTE (this cycle)", value: String(saved.sizing.required_fte) },
        { label: "Available FTE", value: fmtFte(saved.sizing.current_fte) },
        { label: "Gap", value: `${saved.sizing.gap > 0 ? "+" : ""}${saved.sizing.gap}` },
      ];
  }
}

/** Answer box — draft with AI, dictate, or type, then send. The reply travels back through the
 *  review record (api.planning.reply) and never edits the submission. */
function ClarificationReply({ c, subId, onReplied }: {
  c: Clarification; subId: number; onReplied: (p: SubmissionPayload) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const baseRef = useRef("");
  const speech = useSpeech({
    onTranscript: (fin, interim) => {
      if (fin) baseRef.current = joinTranscript(baseRef.current, fin);
      setText(interim ? joinTranscript(baseRef.current, interim) : baseRef.current);
    },
    onError: (err) => toast.error(err === "not-allowed" ? "Microphone access was blocked." : `Voice capture failed (${err}).`),
    lang: useVoiceLang((s) => s.lang),
  });
  const mic = () => {
    if (!speech.supported) return toast.error("Voice capture isn't supported in this browser.");
    if (speech.listening) return speech.stop();
    baseRef.current = text;
    speech.start();
  };
  const draft = async () => {
    setDrafting(true);
    try {
      const r = await api.aiDraftClarification({
        submission_id: subId, direction: "reply", element_type: c.element_type,
        element_key: c.element_key || "", element_label: c.element_label || "", clarification_id: c.id,
      });
      if (r.draft) { setText(r.draft); baseRef.current = r.draft; }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not draft a reply."); }
    finally { setDrafting(false); }
  };
  const send = async () => {
    if (!text.trim()) return toast.error("Write the reply first.");
    setBusy(true);
    try { onReplied(await api.planning.reply(subId, c.id, text.trim())); setText(""); baseRef.current = ""; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Reply failed."); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <Lbl>Your reply to DGHR</Lbl>
      <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Answer the question, cite the source behind the figure…" className="min-h-[60px]" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={draft} disabled={drafting}>
          <Sparkles size={14} /> {drafting ? "Drafting…" : "Draft with AI"}
        </Button>
        <Button size="sm" variant="secondary" onClick={mic}
          className={speech.listening ? "!border-danger/40 !text-danger" : ""}>
          <Mic size={14} className={speech.listening ? "animate-pulse" : ""} /> {speech.listening ? "Stop" : "Dictate"}
        </Button>
        <VoiceLangToggle />
        <Button size="sm" className="ml-auto" onClick={send} disabled={busy || !text.trim()}>
          <Send size={14} /> Send reply
        </Button>
      </div>
    </div>
  );
}

function Banner({ tone, icon, title, body }: { tone: "danger" | "success" | "warn"; icon: React.ReactNode; title: string; body: string }) {
  const c = tone === "danger" ? "border-danger/30 bg-danger-bg/40 text-danger" : tone === "success" ? "border-success/30 bg-success-bg/40 text-success" : "border-warning/30 bg-warning-bg/40 text-warning";
  return <div className={`mb-4 flex items-start gap-2 rounded-card border p-3 text-sm ${c}`}>{icon}<div className="min-w-0"><div className="font-semibold">{title}</div>{body && <div className="mt-0.5 text-text2">{body}</div>}</div></div>;
}
