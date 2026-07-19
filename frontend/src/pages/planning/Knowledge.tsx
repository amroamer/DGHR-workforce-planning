import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { BookOpen, Calculator, AlertTriangle, Workflow, Layers, CalendarDays, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { familyHint, FAMILY_COLOR, FAMILY_LABEL, JOB_LEVELS, type Family } from "@/lib/planning";

const FAMILIES: Family[] = ["demand", "ratio", "coverage", "project", "mandate"];

const GLOSSARY = [
  // These six were one number until the supply split. The glossary is where a reviewer settles an
  // argument about which word a figure means, so each is defined against the others.
  { term: "Approved positions", def: "The authorised establishment: posts the department is allowed to have, filled or not." },
  { term: "Filled positions", def: "Posts with a person in them. Same thing as headcount, and the same thing as actual employees." },
  { term: "Vacancies", def: "Approved positions − filled positions. Always derived, never entered, so the three can't drift apart." },
  { term: "Headcount", def: "PEOPLE: bodies in post. Not the same as FTE: six half-time professionals are 6 headcount." },
  { term: "Establishment FTE", def: "TIME: the full-time-equivalent those people give. Six half-timers are 3.0 FTE. Always ≤ headcount." },
  { term: "Available FTE", def: "Establishment FTE, minus staff seconded out, plus contractors/temporary/seconded-in capacity the entity says counts. THIS is what the gap measures against. A department that lent two people away doesn't have their time to deploy." },
  { term: "Workforce adjustment", def: "Capacity that isn't your own filled establishment: secondments in/out, contractors, temporary resources, outsourced work. Each states an FTE, a window, both ends of the move, and whether it counts toward available supply." },
  { term: "Required FTE", def: "The demand: what the work needs. Required = max(workload build-up, statutory floor). Computed centrally; entities never calculate it." },
  { term: "Gap", def: "Available FTE − Required. Negative = shortfall (understaffed). Positive = surplus (redeployable)." },
  { term: "Workload build-up", def: "The sum of every driver's FTE, each sized by its family formula. Demand-family posts are rounded up." },
  { term: "Statutory floor", def: "A legal/licensing minimum number of posts. It only changes Required when it binds, i.e. when it exceeds the workload build-up." },
  { term: "Driver family", def: "The formula class a driver belongs to (demand, ratio, coverage, project, mandate). It decides how volume converts to FTE." },
  { term: "Typeset", def: "A department type. It sets the default drivers and standard parameters a department starts from." },
  { term: "Emiratization %", def: "Emirati headcount ÷ total headcount, rolled up from each submission's workforce profile." },
];

const FLAGS = [
  { flag: "Sizing variance above 15%", tone: "danger", when: "The gap exceeds 15% of Required FTE. The department is materially over- or under-staffed against its own drivers. Worth a clarification before approving." },
  { flag: "Statutory floor applies", tone: "warning", when: "A legal minimum was declared. Check the legal basis is real and current. A floor can override the workload build-up entirely." },
  { flag: "No drivers entered", tone: "purple", when: "The submission has no workload drivers, so Required rests on the floor alone (or is zero). Almost always needs to go back to the entity." },
];

// Semantic tone → soft token pill (literal classes so Tailwind's scanner emits them).
const FLAG_TONE: Record<string, string> = {
  danger: "bg-danger-bg text-danger",
  warning: "bg-warning-bg text-warning",
  purple: "bg-purple-bg text-purple",
};

const WORKFLOW = [
  "Entity builds a submission per department (team → drivers → fixed requirements → notes → submit).",
  "It lands in Government Position → entity → submission, with the engine's sizing and any flags.",
  "You Approve, Request clarification (attached to a specific driver/mandate/note), or Reject with a reason.",
  "A clarification or rejection reopens the submission for the entity; they answer against that exact element and resubmit.",
  "Approved submissions count toward the government-wide position, Human Capital roll-up and projection.",
];

// Knowledge Center — the reference for running the exercise: definitions, how the engine decides,
// what each flag means, and the review workflow. Live method data (families, typesets, cycle) is
// pulled from the API; Method & Typesets holds the full typeset catalogue.
export function PlanningKnowledge() {
  const navigate = useNavigate();
  const { data: typesets } = useQuery({ queryKey: ["q-typesets"], queryFn: api.planning.typesets });
  // Formulas come from the published method registry — never retyped into the UI.
  const { data: registry } = useQuery({ queryKey: ["method-registry"], queryFn: api.planning.methodRegistry, staleTime: 5 * 60_000 });
  const { data: cycle } = useQuery({ queryKey: ["q-cycle"], queryFn: api.planning.cycle, refetchInterval: 4000 });
  const c = cycle?.cycle;

  return (
    <>
      <PageHeader title="Knowledge Center" subtitle="How the sizing model works, what the flags mean, and the language we use: the reference behind every screen." />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <Card>
              <div className="mb-1.5 flex items-center gap-2 text-base font-semibold text-text1"><Calculator size={16} className="text-primary" /> How the engine decides</div>
              <p className="mb-4 text-xs text-text3">One rule governs every department, in every entity.</p>
              <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-lg bg-inset px-3 py-2.5 text-xs text-text2">
                <span className="rounded bg-card px-2 py-1">Workload build-up</span><span>vs</span>
                <span className="rounded bg-card px-2 py-1">Statutory floor</span><span>→ max →</span>
                <span className="rounded bg-navy-900 px-2 py-1 font-semibold text-white">Required FTE</span><span>vs</span>
                <span className="rounded bg-card px-2 py-1">Available FTE</span><span>=</span>
                <span className="rounded bg-danger px-2 py-1 font-semibold text-white">Gap</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className={`${TH} pl-0`}>Family</th><th className={TH}>Formula</th><th className={TH}>Scales with volume?</th>
                  </tr></thead>
                  <tbody>
                    {FAMILIES.map((f) => (
                      <tr key={f} className={TROW}>
                        <td className={`${TD} pl-0`}><span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: FAMILY_COLOR[f] }}>{FAMILY_LABEL[f]}</span></td>
                        <td className={TD}><code className="inline-block rounded bg-inset px-2 py-1 font-mono text-xs text-text2">{familyHint(registry, f)}</code></td>
                        <td className={`${TD} text-text2`}>
                          {f === "demand" || f === "project" ? "Yes, re-prices under scenarios" : "No, held flat under scenarios"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 max-w-[70ch] text-xs leading-relaxed text-text3">
                Demand posts are ceilinged (never trimmed). A statutory floor is reported separately and only enters the family split when it <b className="text-text2">binds</b>.
              </p>
            </Card>

            <Card>
              <div className="mb-1.5 flex items-center gap-2 text-base font-semibold text-text1"><AlertTriangle size={16} className="text-warning" /> What each flag means</div>
              <p className="mb-4 text-xs text-text3">Flags are computed live by the engine, never seeded.</p>
              <div className="space-y-3">
                {FLAGS.map((f) => (
                  <div key={f.flag} className="rounded-lg border border-border bg-surface2 p-3.5">
                    <span className={`mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${FLAG_TONE[f.tone]}`}>{f.flag}</span>
                    <p className="max-w-[64ch] text-xs leading-relaxed text-text2">{f.when}</p>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => navigate("/dghr/alerts")}>View flagged submissions</Button>
            </Card>

            <Card>
              <div className="mb-1.5 flex items-center gap-2 text-base font-semibold text-text1"><Workflow size={16} className="text-primary" /> The review workflow</div>
              <p className="mb-4 text-xs text-text3">From entity submission to the government-wide position.</p>
              <ol className="space-y-3">
                {WORKFLOW.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary nums">{i + 1}</span>
                    <span className="max-w-[68ch] text-xs leading-relaxed text-text2">{s}</span>
                  </li>
                ))}
              </ol>
            </Card>

            <Card>
              <div className="mb-1.5 flex items-center gap-2 text-base font-semibold text-text1"><BookOpen size={16} className="text-primary" /> Glossary</div>
              <p className="mb-4 text-xs text-text3">The exact meaning of every term used across the portal.</p>
              <div className="space-y-3">
                {GLOSSARY.map((g) => (
                  <div key={g.term} className="border-b border-border pb-3 last:border-0 last:pb-0">
                    <div className="text-sm font-semibold text-text1">{g.term}</div>
                    <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-text2">{g.def}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            {c && (
              <Card>
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text1"><CalendarDays size={15} className="text-primary" /> Active cycle</div>
                <div className="text-sm font-semibold text-text1">{c.name}</div>
                <div className="mt-3 space-y-1.5 text-xs text-text2">
                  <div className="flex justify-between gap-2"><span>Status</span><b className="text-text1">{c.status}</b></div>
                  <div className="flex justify-between gap-2"><span>Deadline</span><b className="text-text1 nums">{c.deadline}</b></div>
                  <div className="flex justify-between gap-2"><span>Received</span><b className="text-text1 nums">{cycle?.departments_received} / {cycle?.departments_total}</b></div>
                  <div className="flex justify-between gap-2"><span>Entities</span><b className="text-text1 nums">{cycle?.entities}</b></div>
                </div>
              </Card>
            )}

            <Card>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text1"><Layers size={15} className="text-primary" /> Department types</div>
              <p className="mb-3 text-xs text-text3">{(typesets ?? []).length} typesets define the default drivers.</p>
              <div className="space-y-1.5">
                {(typesets ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[t.primary_family] }} />
                    <span className="flex-1 truncate text-text2">{t.name}</span>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={() => navigate("/dghr/method")}>Open Method & Typesets</Button>
            </Card>

            <Card>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-text1"><BarChart3 size={15} className="text-primary" /> Job levels</div>
              <p className="mb-3 text-xs text-text3">The workforce profile every entity reports against.</p>
              <div className="space-y-1.5">
                {JOB_LEVELS.map((l) => (
                  <div key={l.key} className="text-xs text-text2">{l.label}</div>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
