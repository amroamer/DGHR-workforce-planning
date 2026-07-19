import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft, XCircle, MessageSquareWarning, Check, HelpCircle,
  GitBranch, History, ShieldCheck, UserCheck, Clock, AlertTriangle, FileCheck,
  Target, Users, TrendingUp, Building2, Sparkles, Mic,
} from "lucide-react";
import { useRef } from "react";
import { useSpeech, joinTranscript } from "@/lib/useSpeech";
import { useVoiceLang } from "@/lib/voiceLang";
import { VoiceLangToggle } from "@/components/shared/VoiceLangToggle";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/field";
import { THEAD_TR, TH, TROW } from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Acronym } from "@/components/shared/Acronym";
import { Modal, Field, TextArea } from "@/components/shared/Modal";
import { AdjustmentList, HcTiles, LevelBar, ProjectedGapChart, SupplyChain, StatCard, fmtFte } from "./widgets";
import { TraceableValue } from "@/components/shared/TraceableValue";
import { FAMILY_LABEL, type ReviewElement, type SubmissionPayload, type Clarification,
  type PreReviewElement, type PreReviewPayload } from "@/lib/planning";

const REVIEW_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", submitted: "Submitted", in_clarification: "In Clarification",
  recommended: "Recommended", approved: "Approved", rejected: "Rejected",
};
const REVIEW_STATUS_VALUE: Record<string, string> = {
  draft: "in_progress", submitted: "submitted", in_clarification: "returned",
  recommended: "under_review", approved: "approved", rejected: "returned",
};

const AGE_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  open: { bg: "rgb(var(--text-3) / 0.15)", fg: "rgb(var(--text-2))", label: "Open" },
  due_soon: { bg: "rgb(var(--warning-bg))", fg: "rgb(var(--warning))", label: "Due soon" },
  overdue: { bg: "rgb(var(--warning-bg))", fg: "rgb(var(--warning))", label: "Overdue" },
  escalated: { bg: "rgb(var(--danger-bg))", fg: "rgb(var(--danger))", label: "Escalated" },
};

/** One element's approve/query control — the addressing partial approval is built on. */
function ElementDecisionButtons({ el, onApprove, onQuery }: {
  el: ReviewElement; onApprove: () => void; onQuery: () => void;
}) {
  if (el.decision === "approved") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success"><Check size={11} /> Approved{el.actor ? `, ${el.actor}` : ""}</span>;
  }
  if (el.decision === "queried") {
    return <button onClick={onQuery} className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning" title={el.note}><HelpCircle size={11} /> Queried{el.actor ? `, ${el.actor}` : ""}</button>;
  }
  return (
    <span className="inline-flex gap-1">
      <button onClick={onApprove} className="rounded-md border border-success/30 px-1.5 py-0.5 text-[11px] font-semibold text-success hover:bg-success-bg" title="Approve this element"><Check size={12} /></button>
      <button onClick={onQuery} className="rounded-md border border-warning/30 px-1.5 py-0.5 text-[11px] font-semibold text-warning hover:bg-warning-bg" title="Query this element"><HelpCircle size={12} /></button>
    </span>
  );
}

/** The reviewer's copilot: an on-demand brief (summary, risks, first checks) computed from the
 *  submission, its version diff, review state and same-typeset peers. Never auto-generated and
 *  never cached — the reviewer asks, and the source badge says who answered. */
function ReviewBriefCard({ subId }: { subId: number }) {
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<{ summary: string; risks: { title: string; detail: string }[]; checks: string[]; source: string } | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.aiReviewBrief(subId);
      if (!r.summary) { toast.message("Nothing to brief yet."); return; }
      setBrief(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not build the brief."); }
    finally { setBusy(false); }
  };
  return (
    <Card className="mb-4 border-dashed border-teal/50 bg-teal-bg/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal">
          <Sparkles size={13} /> Review brief
        </div>
        {brief && (
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-text3">
            {brief.source === "ai" ? "live model" : "offline"}
          </span>
        )}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            <Sparkles size={14} /> {busy ? "Reading…" : brief ? "Regenerate" : "Brief me"}
          </Button>
        </div>
      </div>
      {!brief && <p className="mt-1.5 text-xs text-text3">What this version claims, how it compares to peers and its prior version, the risks worth challenging, and what to check first.</p>}
      {brief && (
        <div className="mt-2 space-y-3">
          <p className="text-sm leading-relaxed text-text2">{brief.summary}</p>
          {brief.risks.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">Risks to challenge</div>
              <ul className="space-y-1">
                {brief.risks.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-xs text-text2">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
                    <span><b className="text-text1">{r.title}.</b> {r.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.checks.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text3">Check first</div>
              <ol className="ml-4 list-decimal space-y-0.5 text-xs text-text2">
                {brief.checks.map((c, i) => <li key={i}>{c}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** Agent #1 — the pre-review. Triages every element (approve/query), drafts the question for each
 *  query, and proposes the overall move. Suggestions only: "Apply" writes each decision on the same
 *  maker-checker path a human click uses (elements/decide + clarify), so nothing bypasses the audit. */
function PreReviewCard({ subId, actor }: { subId: number; actor: number | null }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<PreReviewPayload | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const keyOf = (e: PreReviewElement) => `${e.element_type}:${e.element_key}`;

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.aiPreReview(subId);
      if (!r.elements.length) { toast.message("Nothing to pre-review yet."); return; }
      setPlan(r); setApplied(new Set());
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not pre-review."); }
    finally { setBusy(false); }
  };

  // The write — same endpoints the manual approve/query buttons call. A query both marks the element
  // queried AND sends the drafted question to the entity, exactly like the human "Query & ask" flow.
  const write = async (el: PreReviewElement) => {
    if (el.verdict === "approve") {
      await api.planning.decideElement(subId, { element_type: el.element_type, element_key: el.element_key, element_label: el.element_label, decision: "approved", actor_id: actor! });
    } else {
      await api.planning.decideElement(subId, { element_type: el.element_type, element_key: el.element_key, element_label: el.element_label, decision: "queried", note: el.draft, actor_id: actor! });
      await api.planning.clarify(subId, { element_type: el.element_type, element_id: null, element_key: el.element_key, element_label: el.element_label, message: el.draft, actor_id: actor! });
    }
  };

  const applyOne = async (el: PreReviewElement) => {
    if (actor == null) return toast.error("Select who is reviewing first.");
    try { await write(el); setApplied((s) => new Set(s).add(keyOf(el))); qc.invalidateQueries();
      toast.success(`${el.element_label} ${el.verdict === "approve" ? "approved" : "queried & asked"}.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply."); }
  };

  const applyAll = async () => {
    if (actor == null) return toast.error("Select who is reviewing first.");
    if (!plan) return;
    setApplying(true);
    let n = 0;
    try {
      for (const el of plan.elements) {
        if (applied.has(keyOf(el)) || el.current_decision) continue;
        await write(el); setApplied((s) => new Set(s).add(keyOf(el))); n++;
      }
      qc.invalidateQueries();
      toast.success(n ? `Applied ${n} decision${n !== 1 ? "s" : ""} — ${plan.counts.query} queried, ${plan.counts.approve} approved.` : "Every element was already decided.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply all."); }
    finally { setApplying(false); }
  };

  const isClarify = plan?.overall.action === "clarify";
  return (
    <Card className="mb-4 border-dashed border-primary/50 bg-primary/5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
          <Sparkles size={13} /> Pre-review agent
        </div>
        {plan && (
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-text3">
            {plan.source === "ai" ? "live model" : "offline"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {plan && (
            <Button size="sm" onClick={applyAll} disabled={applying}>
              <Check size={14} /> {applying ? "Applying…" : "Apply all"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            <Sparkles size={14} /> {busy ? "Reading…" : plan ? "Regenerate" : "Pre-review for me"}
          </Button>
        </div>
      </div>
      {!plan && <p className="mt-1.5 text-xs text-text3">Triages every element — approve or query — drafts the question for each query, and proposes the next move. You confirm; nothing is sent until you apply.</p>}
      {plan && (
        <div className="mt-2.5 space-y-3">
          {/* the proposed move */}
          <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-xs ${isClarify ? "bg-warning-bg/50" : "bg-success-bg/50"}`}>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${isClarify ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>
              {isClarify ? <><HelpCircle size={11} /> Raise {plan.counts.query} quer{plan.counts.query !== 1 ? "ies" : "y"}</> : <><ShieldCheck size={11} /> Recommend sign-off</>}
            </span>
            <span className="text-text2">{plan.overall.rationale}</span>
          </div>
          {/* per-element verdicts */}
          <ul className="divide-y divide-border">
            {plan.elements.map((el) => {
              const done = applied.has(keyOf(el)) || !!el.current_decision;
              const q = el.verdict === "query";
              return (
                <li key={keyOf(el)} className="flex flex-wrap items-start gap-2 py-2 first:pt-0 last:pb-0">
                  <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${q ? "bg-warning-bg text-warning" : "bg-success-bg text-success"}`}>
                    {q ? <><HelpCircle size={10} /> Query</> : <><Check size={10} /> Approve</>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-text1">{el.element_label}</div>
                    <div className="text-xs text-text2">{el.reason}</div>
                    {q && el.draft && (
                      <div className="mt-1 rounded-md border border-warning/25 bg-warning-bg/30 px-2 py-1.5 text-[11px] italic text-text2">“{el.draft}”</div>
                    )}
                  </div>
                  {done ? (
                    <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-success"><Check size={12} /> Applied</span>
                  ) : (
                    <button onClick={() => applyOne(el)}
                      className="mt-0.5 shrink-0 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] font-semibold text-text2 hover:bg-surface2">
                      Apply
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-text3">Suggestions only — “Apply” records each decision under the selected reviewer, and a query also sends the drafted question to the entity.</p>
        </div>
      )}
    </Card>
  );
}

function VersionBar({ data, onOpen }: { data: SubmissionPayload; onOpen: (id: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <GitBranch size={14} className="text-text3" />
      {data.versions.map((v) => (
        <button key={v.id} onClick={() => onOpen(v.id)}
          className={`rounded-md px-2 py-0.5 text-xs font-semibold ${v.id === data.id ? "bg-primary text-white" : "border border-border bg-card text-text2 hover:bg-page"}`}
          title={`v${v.version}, ${REVIEW_STATUS_LABEL[v.status] ?? v.status}`}>
          v{v.version}
        </button>
      ))}
    </div>
  );
}

function AgeChip({ c }: { c: Clarification }) {
  const t = AGE_TONE[c.level] ?? AGE_TONE.open;
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: t.bg, color: t.fg }}>
      {c.level === "escalated" ? <AlertTriangle size={9} /> : <Clock size={9} />}
      {t.label}, {c.days_open}d
    </span>
  );
}

export function PlanningDghrSubmission() {
  const { subId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["q-dghr-sub", subId], queryFn: () => api.planning.dghrSubmission(Number(subId)), enabled: !!subId, refetchInterval: 4000 });
  const { data: reviewersData } = useQuery({ queryKey: ["q-reviewers"], queryFn: api.planning.reviewers, staleTime: 5 * 60_000 });
  const { data: historyData } = useQuery({ queryKey: ["q-sub-history", data?.department?.id], queryFn: () => api.planning.history(data!.department!.id), enabled: !!data?.department?.id, refetchInterval: 4000 });

  const [modal, setModal] = useState<null | "reject" | "clarify" | "query" | "recommend" | "approve">(null);
  const [note, setNote] = useState("");
  const [conditions, setConditions] = useState("");
  const [clarEl, setClarEl] = useState<{ type: string; key: string; id: number | null; label: string }>({ type: "submission", key: "submission", id: null, label: "" });
  const [actorId, setActorId] = useState<number | null>(null);
  const [clarText, setClarText] = useState("");
  const [drafting, setDrafting] = useState(false);
  // Dictation for the clarify/query modals — dictates into the shared `note` field. The base ref is
  // synced to the current note when the mic starts, so voice appends to whatever's typed/AI-drafted.
  const noteBaseRef = useRef("");
  const noteSpeech = useSpeech({
    onTranscript: (fin, interim) => {
      if (fin) noteBaseRef.current = joinTranscript(noteBaseRef.current, fin);
      setNote(interim ? joinTranscript(noteBaseRef.current, interim) : noteBaseRef.current);
    },
    onError: (err) => toast.error(err === "not-allowed" ? "Microphone access was blocked." : `Voice capture failed (${err}).`),
    lang: useVoiceLang((s) => s.lang),
  });
  const dictateNote = () => {
    if (!noteSpeech.supported) return toast.error("Voice isn't supported in this browser.");
    if (noteSpeech.listening) return noteSpeech.stop();
    noteBaseRef.current = note;
    noteSpeech.start();
  };

  if (!data) return <><PageHeader title="Submission" subtitle="Loading…" /><PageBody><Card className="p-8 text-center text-text3">Loading…</Card></PageBody></>;
  const sz = data.sizing;
  const reviewers = reviewersData?.reviewers ?? [];
  // The reviewer must say who they are — the same person can't recommend AND approve.
  const actor = actorId ?? reviewers[0]?.id ?? null;
  const id = data.id;
  const pending = ["submitted", "in_clarification", "recommended"].includes(data.status);
  const review = data.review;
  const decisionFor = (type: string, key: string) =>
    review.elements.find((e) => e.element_type === type && e.element_key === key);

  // AI-drafted clarification question, grounded in the element's submitted figures. Fills the
  // textarea only — the reviewer edits and owns what is sent.
  const draftQuestion = async () => {
    setDrafting(true);
    try {
      const r = await api.aiDraftClarification({
        submission_id: id, direction: "question",
        element_type: clarEl.type, element_key: clarEl.key, element_label: clarEl.label,
      });
      if (r.draft) setNote(r.draft);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not draft a question."); }
    finally { setDrafting(false); }
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try { await fn(); qc.invalidateQueries(); toast.success(msg); setModal(null); setNote(""); setConditions(""); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed."); }
  };
  const needActor = () => { if (actor == null) { toast.error("Select who is reviewing first."); return true; } return false; };

  const approveElement = (type: string, key: string, label: string) => {
    if (needActor()) return;
    act(() => api.planning.decideElement(id, { element_type: type, element_key: key, element_label: label, decision: "approved", actor_id: actor! }), `${label} approved.`);
  };
  const openQuery = (type: string, key: string, id2: number | null, label: string) => { setClarEl({ type, key, id: id2, label }); setNote(""); setModal("query"); };
  const submitQuery = () => {
    if (needActor() || !note.trim()) return toast.error(note.trim() ? "Select a reviewer." : "Say what you're querying.");
    // A query is both a decision and a clarification: the element is marked queried AND the entity is asked.
    act(async () => {
      await api.planning.decideElement(id, { element_type: clarEl.type, element_key: clarEl.key, element_label: clarEl.label, decision: "queried", note, actor_id: actor! });
      await api.planning.clarify(id, { element_type: clarEl.type, element_id: clarEl.id, element_key: clarEl.key, element_label: clarEl.label, message: note, actor_id: actor! });
    }, "Queried and sent to the entity.");
  };
  const openClarify = (type: string, key: string, id2: number | null, label: string) => { setClarEl({ type, key, id: id2, label }); setNote(""); setModal("clarify"); };
  const clarify = () => { if (needActor() || !note.trim()) return toast.error(note.trim() ? "Select a reviewer." : "Enter your question."); act(() => api.planning.clarify(id, { element_type: clarEl.type, element_id: clarEl.id, element_key: clarEl.key, element_label: clarEl.label, message: note, actor_id: actor! }), "Clarification sent to entity."); };
  const recommend = () => { if (needActor() || !note.trim()) return toast.error(note.trim() ? "Select a reviewer." : "A rationale is required."); act(() => api.planning.recommend(id, { note, actor_id: actor! }), "Recommended for approval."); };
  const approve = () => { if (needActor() || !note.trim()) return toast.error(note.trim() ? "Select an approver." : "A rationale is required."); act(() => api.planning.approve(id, { note, actor_id: actor!, conditions: conditions.split("\n").map((c) => c.trim()).filter(Boolean) }), "Approved."); };
  const reject = () => { if (needActor() || !note.trim()) return toast.error(note.trim() ? "Select a reviewer." : "A reason is required."); act(() => api.planning.reject(id, { note, actor_id: actor! }), "Rejected."); };
  const revise = () => act(() => api.planning.revise(id).then((s) => navigate(`/dghr/gov-submission/${s.id}`)), "New version opened.");

  const recommenderName = reviewers.find((r) => r.id === data.recommended_by_id)?.name;
  const canApproveNow = data.status === "recommended" && actor != null && actor !== data.recommended_by_id;

  return (
    <>
      <PageHeader title={`${data.department?.name ?? "Department"}: Submission`}
        subtitle={`${data.entity?.name ?? ""}, ${data.department?.typeset ?? ""}`}
        actions={<Button variant="secondary" size="sm" onClick={() => navigate(data.entity ? `/dghr/gov-entity/${data.entity.id}` : "/dghr/government")}><ChevronLeft size={15} /> Entity</Button>} />
      <PageBody>
        {/* S3: parent entity name made prominent at the top. */}
        {data.entity && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <span className="text-lg font-bold text-text1">{data.entity.name}</span>
            <Acronym short={data.entity.code} full={data.entity.name} className="text-xs font-semibold text-text3" />
            <span className="text-text3">/</span>
            <span className="text-sm text-text2">{data.department?.name}</span>
          </div>
        )}
        {/* ── version + status bar ── */}
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3 text-sm">
          <StatusBadge value={REVIEW_STATUS_VALUE[data.status]} label={`v${data.version}, ${REVIEW_STATUS_LABEL[data.status]}`} />
          <VersionBar data={data} onOpen={(vid) => navigate(`/dghr/gov-submission/${vid}`)} />
          {!data.is_latest && (
            <span className="rounded-md bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
              Superseded (a newer version exists)
            </span>
          )}
          {data.status === "approved" && (
            <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-text2">
              <UserCheck size={14} className="text-text3" /> Recommended by <b className="text-text1">{data.recommended_by || "—"}</b>
              <ShieldCheck size={14} className="text-success" /> Approved by <b className="text-text1">{data.decided_by || "—"}</b>
            </span>
          )}
        </div>

        {/* Attestation + verification — compact banners, thin accent, tight spacing between them. */}
        <div className="mb-4 space-y-2">
          {/* The entity's signed attestation — DGHR reviews a record someone put their name to. */}
          {data.attested && (
            <Alert tone="success" icon={<FileCheck size={16} />}>
              <span className="italic">“{data.attestation_text}”</span>
              <div className="mt-0.5 font-semibold">Attested by {data.attested_by}{data.attested_at ? `, ${data.attested_at.slice(0, 10)}` : ""}</div>
            </Alert>
          )}

          {/* S18: who verified before it reached DGHR — the entity's HR champion. */}
          {data.champion_verified_by && (
            <Alert tone="info" icon={<ShieldCheck size={15} />}>
              Verified by entity champion <b>{data.champion_verified_by}</b>{data.champion_verified_at ? `, ${data.champion_verified_at.slice(0, 10)}` : ""} before submission to DGHR.
            </Alert>
          )}
        </div>

        {/* ── sizing summary as tiles (S3), matching the tile treatment used elsewhere ── */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <StatCard icon={<Target size={20} />} tone="#7C3AED" sub="what the work needs"
            label={sz.measures?.find((x) => x.key === "current")?.label ?? "Required FTE"}
            value={<TraceableValue kind="submission" refId={id} label={`Required FTE for ${data.department?.name ?? "this department"}`}>{sz.required_fte}</TraceableValue>} />
          <StatCard icon={<Users size={20} />} tone="#2563EB" label="Available FTE" value={fmtFte(sz.current_fte)} sub="net of secondments" />
          <StatCard icon={<TrendingUp size={20} />} tone={sz.gap < 0 ? "#E11D48" : "#15803D"} label="Gap"
            value={`${sz.gap > 0 ? "+" : ""}${fmtFte(sz.gap)}`} sub={sz.gap < 0 ? "shortfall to close" : "surplus to redeploy"} />
        </div>

        {/* ── flags + reviewer identity + actions ── */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-4 text-sm shadow-card">
          {(sz.flags ?? []).map((f) => <span key={f} className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">{f}</span>)}
          {(sz.flags ?? []).length === 0 && <span className="text-xs text-text3">No sizing flags on this submission.</span>}

          {pending && (
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-text3">Reviewing as</span>
              <select aria-label="Reviewer" value={actor ?? ""} onChange={(e) => setActorId(Number(e.target.value))}
                className="select-field h-8 rounded-btn border border-border bg-card px-2.5 text-xs font-semibold text-text1 outline-none transition-[border-color,box-shadow] duration-fast focus:border-primary focus:ring-2 focus:ring-primary/20">
                {reviewers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
              {data.status !== "recommended" ? (
                <Button size="sm" disabled={!review.all_approved}
                  title={review.all_approved ? "" : `${review.queried} queried, ${review.undecided} unreviewed`}
                  onClick={() => { setNote(""); setModal("recommend"); }}>
                  <UserCheck size={15} /> Recommend
                </Button>
              ) : (
                <Button size="sm" disabled={!canApproveNow}
                  title={canApproveNow ? "" : actor === data.recommended_by_id ? "You recommended this. A different person must approve" : "Awaiting a reviewer"}
                  onClick={() => { setNote(""); setConditions(""); setModal("approve"); }}>
                  <ShieldCheck size={15} /> Approve
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => { setNote(""); setModal("clarify"); setClarEl({ type: "submission", key: "submission", id: null, label: "" }); }}><MessageSquareWarning size={15} /> Clarify</Button>
              <Button variant="secondary" size="sm" className="!text-danger" onClick={() => { setNote(""); setModal("reject"); }}><XCircle size={15} /> Reject</Button>
            </div>
          )}
          {!pending && !data.editable && data.is_latest && (
            <Button size="sm" variant="secondary" className="ml-auto" onClick={revise}><GitBranch size={15} /> Revise → new version</Button>
          )}
        </div>

        {/* ── the reviewer's copilots, per version (keyed so neither survives a version switch) ── */}
        {pending && <PreReviewCard key={`pr-${id}`} subId={id} actor={actor} />}
        {pending && <ReviewBriefCard key={id} subId={id} />}

        {/* ── review progress + conditions ── */}
        {pending && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface2 p-3.5">
            <span className="text-xs font-semibold text-text1">Element sign-off</span>
            <div className="flex-1">
              <div className="flex h-2.5 w-full max-w-md overflow-hidden rounded-full bg-inset ring-1 ring-inset ring-border">
                <span className="bg-success transition-[width] duration-500 ease-standard" style={{ width: `${(review.approved / Math.max(1, review.total)) * 100}%` }} />
                <span className="bg-warning transition-[width] duration-500 ease-standard" style={{ width: `${(review.queried / Math.max(1, review.total)) * 100}%` }} />
              </div>
            </div>
            <span className="text-xs text-text2">
              <b className="text-success">{review.approved}</b> approved, <b className="text-warning">{review.queried}</b> queried, <b className="text-text1">{review.undecided}</b> to review
            </span>
            {review.all_approved && <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">Ready to recommend</span>}
          </div>
        )}
        {data.status === "approved" && data.conditions.length > 0 && (
          <Alert tone="warning" icon={<AlertTriangle size={16} />} title="Approved with conditions" className="mb-4">
            <ul className="ml-4 list-disc space-y-0.5">{data.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </Alert>
        )}

        {/* ── what changed since the version this one revised ── */}
        {data.diff && !data.diff.unchanged && (
          <Card className="mb-4">
            <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text1"><GitBranch size={15} className="text-primary" /> Changes from v{data.diff.from_version} → v{data.diff.to_version}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr className="border-b border-border text-[11px] uppercase text-text3"><th className="px-2 py-1.5">Element</th><th className="px-2 py-1.5">Field</th><th className="px-2 py-1.5 text-right">Before</th><th className="px-2 py-1.5 text-right">After</th></tr></thead>
                <tbody>
                  {data.diff.changes.map((c, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-2 py-1.5 text-text1">{c.element}</td>
                      <td className="px-2 py-1.5 text-text3">{c.field}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-text3 line-through">{c.before}</td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-text1">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* S3: scrollable per-position breakdown (role, grade band, headcount) under the totals. */}
            {(data.workforce.positions?.length ?? 0) > 0 && (
              <Card className="min-w-0 p-0">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <span className="text-sm font-semibold text-text1">Positions</span>
                  <span className="text-[11px] text-text3">{(data.workforce.positions ?? []).reduce((s, p) => s + p.headcount, 0)} people across {(data.workforce.positions ?? []).length} roles</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-card"><tr className={THEAD_TR}><th className="px-4 py-2.5">Role</th><th className={TH}>Grade band</th><th className="px-4 py-2.5 text-right">Headcount</th></tr></thead>
                    <tbody>
                      {(data.workforce.positions ?? []).map((p, i) => (
                        <tr key={i} className={TROW}>
                          <td className="px-4 py-3.5 text-sm text-text1">{p.role}{p.structural && <span className="ml-2 rounded bg-purple-bg px-1.5 py-0.5 text-[10px] font-semibold text-purple">Structural</span>}</td>
                          <td className="px-3 py-3.5 text-sm text-text2">{p.grade_band}</td>
                          <td className="px-4 py-3.5 text-right text-sm font-semibold nums text-text1">{p.headcount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* driver build-up — each row individually reviewable */}
            <Card>
              <div className="mb-2 text-sm font-semibold text-text1">Driver build-up</div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead><tr className="border-b border-border text-[11px] uppercase text-text3"><th className="px-2 py-2">Driver</th><th className="px-2 py-2">Family</th><th className="px-2 py-2 text-right">Volume</th><th className="px-2 py-2 text-right">FTE</th>{pending && <th className="px-2 py-2 text-right">Review</th>}</tr></thead>
                <tbody>
                  {sz.drivers.map((d) => {
                    const dec = decisionFor("driver", d.element_key ?? "");
                    return (
                    <tr key={d.id} className="border-b border-border">
                      <td className="px-2 py-2 text-text1">{d.name}<div className="text-[11px] text-text3">{d.unit}{d.source ? `, ${d.source}` : ""}</div></td>
                      <td className="px-2 py-2 text-text2">{FAMILY_LABEL[d.family]}</td>
                      <td className="px-2 py-2 text-right text-text2">{d.volume.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-semibold">
                        <TraceableValue kind="driver" refId={d.id} label={`${d.name} FTE`}>{d.fte}</TraceableValue>
                      </td>
                      {pending && dec && <td className="px-2 py-2 text-right"><ElementDecisionButtons el={dec}
                        onApprove={() => approveElement("driver", d.element_key ?? "", d.name)}
                        onQuery={() => openQuery("driver", d.element_key ?? "", d.id, d.name)} /></td>}
                    </tr>
                  ); })}
                </tbody>
              </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card border border-border bg-inset px-3 py-2.5 text-xs text-text3">
                <span className="inline-flex items-baseline gap-1.5 rounded-btn border border-border bg-card px-2.5 py-1.5">Build-up <b className="nums text-sm text-text1">{sz.build_up}</b></span>
                <span>vs</span>
                <span className="inline-flex items-baseline gap-1.5 rounded-btn border border-border bg-card px-2.5 py-1.5">Floor <b className="nums text-sm text-text1">{sz.floor_total}</b></span>
                <span>→ max →</span>
                <span className="inline-flex items-baseline gap-1.5 rounded-btn bg-navy-900 px-2.5 py-1.5 text-white"><span className="opacity-80">Required</span> <b className="nums text-sm">{sz.required_fte}</b></span>
                <span>vs</span>
                <span className="inline-flex items-baseline gap-1.5 rounded-btn border border-border bg-card px-2.5 py-1.5">Available <b className="nums text-sm text-text1">{fmtFte(sz.current_fte)}</b></span>
                <span>=</span>
                <span className={`inline-flex items-baseline gap-1.5 rounded-btn px-2.5 py-1.5 text-white ${sz.gap < 0 ? "bg-danger" : "bg-success"}`}><span className="opacity-80">Gap</span> <b className="nums text-sm">{sz.gap > 0 ? "+" : ""}{fmtFte(sz.gap)}</b></span>
              </div>
            </Card>

            {sz.mandates.length > 0 && (
              <Card>
                <div className="mb-2 text-sm font-semibold text-text1">Statutory floors (reported separately)</div>
                {sz.mandates.map((mm) => {
                  const key = (mm.role || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                  const dec = decisionFor("mandate", key);
                  return (
                  <div key={mm.id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                    <span className="text-text1">{mm.positions} × {mm.role}{mm.legal_basis ? `, ${mm.legal_basis}` : ""}</span>
                    {pending && dec && <ElementDecisionButtons el={dec}
                      onApprove={() => approveElement("mandate", key, mm.role)}
                      onQuery={() => openQuery("mandate", key, mm.id, mm.role)} />}
                  </div>
                ); })}
              </Card>
            )}

            {data.notes && <Card><div className="mb-1 text-sm font-semibold text-text1">Entity note</div><p className="text-sm text-text2">{data.notes}</p>{pending && <button className="mt-2 text-xs font-semibold text-warning hover:underline" onClick={() => openClarify("notes", "notes", null, "Entity note")}>Ask about this note</button>}</Card>}

            {data.workforce?.has_data && (
              <Card>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Workforce profile</div>
                  {pending && decisionFor("profile", "profile") && <ElementDecisionButtons el={decisionFor("profile", "profile")!}
                    onApprove={() => approveElement("profile", "profile", "Workforce profile")}
                    onQuery={() => openQuery("profile", "profile", null, "Workforce profile")} />}
                </div>
                <div className="mb-4 text-xs text-text3">People, time, job levels, Emiratization and cost submitted for this department.</div>
                <HcTiles hc={data.workforce} />
                <div className="mt-4"><LevelBar levels={data.workforce.by_level} /></div>
              </Card>
            )}

            {data.supply?.has_data && (
              <Card>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Supply reconciliation</div>
                  {pending && decisionFor("supply", "supply") && <ElementDecisionButtons el={decisionFor("supply", "supply")!}
                    onApprove={() => approveElement("supply", "supply", "Supply reconciliation")}
                    onQuery={() => openQuery("supply", "supply", null, "Supply reconciliation")} />}
                </div>
                <div className="mb-3 text-xs text-text3">Approved posts → people in them → their time → capacity in and out.</div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <SupplyChain s={data.supply} />
                  <div>
                    <div className="mb-2 text-xs font-semibold text-text2">Secondments, contractors & temporary resources</div>
                    <AdjustmentList rows={data.supply.adjustments} />
                  </div>
                </div>
              </Card>
            )}

            {data.projection?.points?.length ? (
              <Card>
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-sm font-semibold text-text1">Projected demand vs supply</div>
                  <span className="text-[11px] text-text3">{data.projection.years ?? "—"} yrs</span>
                </div>
                <div className="mb-3 text-xs text-text3">This department's trajectory if nothing changes.</div>
                <ProjectedGapChart points={data.projection.points} height={196} />
              </Card>
            ) : null}
          </div>

          {/* right rail — clarifications + history */}
          <div className="space-y-4 lg:col-span-1">
            <Card>
              <div className="mb-3 text-sm font-semibold text-text1">Clarifications</div>
              {data.clarifications.length === 0 ? <p className="text-sm text-text3">No clarifications raised.</p> : (
                <div className="space-y-2.5">
                  {data.clarifications.map((c) => (
                    <div key={c.id} className={`rounded-lg p-2.5 text-xs ${c.side === "dghr" ? "border border-warning/20 bg-warning-bg/40" : "bg-inset"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-text1">{c.author}</span>
                        {c.side === "dghr" && c.status === "open" ? <AgeChip c={c} /> : <span className="text-text3">{c.side === "dghr" ? "asked" : "replied"}</span>}
                      </div>
                      {c.element_label && <div className="mt-0.5 inline-block rounded bg-card px-1.5 py-0.5 text-[10px] text-text2">{c.element_label}</div>}
                      <div className="mt-1 text-text2">{c.message}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* S3: an inline entry field so the clarifications area visibly reads as editable. */}
              {pending && (
                <div className="mt-3 border-t border-border pt-3">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text3">Raise a clarification</label>
                  <Textarea value={clarText} onChange={(e) => setClarText(e.target.value)} rows={2}
                    placeholder="Ask the entity to clarify a figure…" className="min-h-[68px]" />
                  <Button size="sm" className="mt-2 w-full" disabled={!clarText.trim()}
                    onClick={() => { setNote(clarText); setClarEl({ type: "submission", key: "submission", id: null, label: "" }); setModal("clarify"); }}>
                    <MessageSquareWarning size={14} /> Raise clarification
                  </Button>
                </div>
              )}
            </Card>

            {historyData && historyData.events.length > 0 && (
              <Card>
                <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-text1"><History size={15} className="text-primary" /> Change history</div>
                <div className="space-y-2.5">
                  {historyData.events.slice(0, 12).map((e, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="mt-0.5 rounded bg-inset px-1.5 py-0.5 font-semibold text-text3">v{e.version}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-text1">{e.title}</div>
                        <div className="text-text3">{e.actor}{e.at ? `, ${e.at.slice(0, 10)}` : ""}</div>
                        {e.detail && <div className="mt-0.5 truncate text-text2" title={e.detail}>{e.detail}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </PageBody>

      {/* reject */}
      <Modal open={modal === "reject"} onClose={() => setModal(null)} title="Reject submission"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button className="!bg-danger" onClick={reject}>Reject</Button></>}>
        <Field label="Reason (required, sent to the entity)"><TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain why this submission is declined…" /></Field>
      </Modal>

      {/* clarify (whole element, no verdict) */}
      <Modal open={modal === "clarify"} onClose={() => setModal(null)} title={`Request clarification${clarEl.label ? `: ${clarEl.label}` : ""}`}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={clarify}>Send to entity</Button></>}>
        <p className="mb-2 text-xs text-text3">Attached to: <b>{clarEl.label || "the whole submission"}</b>. The entity answers against this element.</p>
        <Field label="Your question"><TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What do you need the entity to clarify?" /></Field>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button onClick={draftQuestion} disabled={drafting}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal hover:underline disabled:opacity-50">
            <Sparkles size={13} /> {drafting ? "Drafting…" : "Draft the question with AI"}
          </button>
          <button onClick={dictateNote}
            className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${noteSpeech.listening ? "text-danger" : "text-text2"}`}>
            <Mic size={13} className={noteSpeech.listening ? "animate-pulse" : ""} /> {noteSpeech.listening ? "Stop" : "Dictate"}
          </button>
          <VoiceLangToggle />
        </div>
      </Modal>

      {/* query one element — marks it queried AND asks the entity */}
      <Modal open={modal === "query"} onClose={() => setModal(null)} title={`Query: ${clarEl.label}`}
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button className="!bg-warning hover:!brightness-95" onClick={submitQuery}>Query & ask</Button></>}>
        <p className="mb-2 text-xs text-text3">Marks <b>{clarEl.label}</b> as queried and sends the entity a question. The submission can't be recommended until every element is approved.</p>
        <Field label="What needs clarifying? (required)"><TextArea rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain what you're querying…" /></Field>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <button onClick={draftQuestion} disabled={drafting}
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal hover:underline disabled:opacity-50">
            <Sparkles size={13} /> {drafting ? "Drafting…" : "Draft the question with AI"}
          </button>
          <button onClick={dictateNote}
            className={`inline-flex items-center gap-1 text-xs font-semibold hover:underline ${noteSpeech.listening ? "text-danger" : "text-text2"}`}>
            <Mic size={13} className={noteSpeech.listening ? "animate-pulse" : ""} /> {noteSpeech.listening ? "Stop" : "Dictate"}
          </button>
          <VoiceLangToggle />
        </div>
      </Modal>

      {/* recommend — stage 1 */}
      <Modal open={modal === "recommend"} onClose={() => setModal(null)} title="Recommend for approval"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button onClick={recommend}>Recommend</Button></>}>
        <p className="mb-2 text-xs text-text3">Stage 1 of two. You are recommending this version; a <b>different</b> reviewer must sign it off. Every element is approved.</p>
        <Field label="Rationale (required)"><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this ready to approve?" /></Field>
      </Modal>

      {/* approve — stage 2, maker-checker */}
      <Modal open={modal === "approve"} onClose={() => setModal(null)} title="Approve submission"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button><Button className="!bg-success hover:!brightness-95" onClick={approve}>Approve</Button></>}>
        <p className="mb-2 text-xs text-text3">
          Recommended by <b>{recommenderName || data.recommended_by || "a reviewer"}</b>. You are the second signature:
          this promotes the figure into the official approved position.
        </p>
        <Field label="Rationale (required)"><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Basis for signing off…" /></Field>
        <Field label="Conditions (optional, one per line)"><TextArea rows={2} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="e.g. Re-evidence the supervision ratio next cycle" /></Field>
      </Modal>
    </>
  );
}
