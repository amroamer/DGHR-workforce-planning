import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { LifeBuoy, Calculator, ScrollText, Send, MessageSquareWarning, Sparkles, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { familyHint, FAMILY_COLOR, FAMILY_LABEL, type Family } from "@/lib/planning";

const FAMILIES: Family[] = ["demand", "ratio", "coverage", "project", "mandate"];

const STEPS = [
  { icon: <Calculator size={15} />, title: "1. Your team", body: "Confirm your current FTE on payroll and your workforce profile: headcount, job levels and Emiratization. This is your supply figure." },
  { icon: <Calculator size={15} />, title: "2. Your drivers", body: "Enter what you can count: applications, inspections, projects, sites, people served. Each driver is sized with a standard formula. You don't calculate anything." },
  { icon: <ScrollText size={15} />, title: "3. Fixed requirements", body: "Only if a law, licence or safety rule fixes a minimum number of posts. Most departments have none." },
  { icon: <Sparkles size={15} />, title: "4. Notes & Smart Assist", body: "Anything the numbers don't show. Or describe your work in plain words and let Smart Assist draft the entries. Nothing is added until you accept it." },
  { icon: <Send size={15} />, title: "5. Review & submit", body: "Check the figures and send to DGHR. Your submission stays editable until DGHR decides." },
];

const FAQ = [
  { q: "Where does my Required FTE come from?", a: "Required FTE = the larger of your workload build-up (your drivers, sized by the standard formulas) and your statutory floor. Demand posts are rounded up, posts are never trimmed. You never calculate it; the engine does." },
  { q: "Why is my gap negative?", a: "A negative gap means required is higher than current, a shortfall. A positive gap means you have more people than the work requires, i.e. a surplus to redeploy." },
  { q: "Can I change my submission after sending it?", a: "It stays editable until DGHR decides. If DGHR raises a clarification or returns it, answer against the exact element flagged and resubmit." },
  { q: "What happens to my workforce profile?", a: "It rolls up into your Human Capital Overview and the government-wide view: headcount, job-level mix, Emiratization and cost. Cost uses a standard annual rate per job level." },
  { q: "Does the projection predict the future?", a: "No. It's a transparent, rule-based projection, not a black-box forecast: demand grows from your own 12-month forecast figures, and supply is held at today's FTE less annual attrition if it isn't backfilled. The assumptions are printed under every chart." },
];

// Help & Support — real guidance driven by the live method (typesets + formula families) and the
// live cycle. No fabricated metrics; the reference content is the app's actual sizing rules.
export function PlanningHelp() {
  const navigate = useNavigate();
  const { data: typesets } = useQuery({ queryKey: ["q-typesets"], queryFn: api.planning.typesets });
  // Formulas come from the published method registry — never retyped into the UI.
  const { data: registry } = useQuery({ queryKey: ["method-registry"], queryFn: api.planning.methodRegistry, staleTime: 5 * 60_000 });
  const { data: cycle } = useQuery({ queryKey: ["q-cycle"], queryFn: api.planning.cycle, refetchInterval: 4000 });
  const c = cycle?.cycle;

  return (
    <>
      <PageHeader title="Help & Support" subtitle="How the sizing works, what we ask you for, and who to contact." />
      <PageBody>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            <Card className="p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-text1"><Send size={15} className="text-primary" /> Submitting a department, step by step</div>
              <p className="mb-4 text-xs text-text3">Every department goes through the same five steps.</p>
              <div className="space-y-3">
                {STEPS.map((s) => (
                  <div key={s.title} className="flex items-start gap-3.5 rounded-lg bg-surface2/50 p-3.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{s.icon}</span>
                    <div className="min-w-0">
                      <div className="mb-0.5 text-sm font-semibold text-text1">{s.title}</div>
                      <div className="max-w-[62ch] text-xs leading-relaxed text-text2">{s.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-text1"><Calculator size={15} className="text-primary" /> The five driver families</div>
              <p className="mb-4 max-w-[70ch] text-xs text-text3">Each driver you enter belongs to one family. The family decides the formula, these are the exact formulas the engine uses.</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className={TH}>Family</th><th className={TH}>Formula</th><th className={TH}>Use it when</th>
                  </tr></thead>
                  <tbody>
                    {FAMILIES.map((f) => {
                      const hint = familyHint(registry, f);
                      return (
                      <tr key={f} className={TROW}>
                        <td className={TD}><span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: FAMILY_COLOR[f] }}>{FAMILY_LABEL[f]}</span></td>
                        <td className={TD}>{hint && <code className="inline-block rounded bg-inset px-2 py-1 font-mono text-xs text-text2">{hint}</code>}</td>
                        <td className={`${TD} text-text2`}>
                          {f === "demand" && "You can count transactions and know how long one takes."}
                          {f === "ratio" && "One person serves a population (e.g. HR per employee)."}
                          {f === "coverage" && "A post must be manned across shifts."}
                          {f === "project" && "Work comes as projects with a team size."}
                          {f === "mandate" && "A law or licence fixes the number of posts."}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 max-w-[80ch] rounded-lg border border-border bg-inset px-3 py-2 text-xs leading-relaxed text-text2">
                <b className="text-text1">The rule:</b> Required FTE = max(workload build-up, statutory floor). Demand posts are ceilinged; floors are reported separately and never trimmed.
              </p>
            </Card>

            <Card className="p-5">
              <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-text1"><MessageSquareWarning size={15} className="text-primary" /> Frequently asked</div>
              <div className="mt-3 space-y-4">
                {FAQ.map((f) => (
                  <div key={f.q} className="border-b border-border pb-4 last:border-0 last:pb-0">
                    <div className="text-sm font-semibold text-text1">{f.q}</div>
                    <p className="mt-1 max-w-[72ch] text-xs leading-relaxed text-text2">{f.a}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <aside className="space-y-5">
            {c && (
              <Card className="p-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><CalendarDays size={15} className="text-primary" /> This cycle</div>
                <div className="text-sm font-semibold text-text1">{c.name}</div>
                <div className="mt-2 space-y-1.5 text-xs text-text2">
                  <div className="flex justify-between"><span>Deadline</span><b className="nums text-text1">{c.deadline}</b></div>
                  <div className="flex justify-between"><span>Departments received</span><b className="nums text-text1">{cycle?.departments_received} / {cycle?.departments_total}</b></div>
                </div>
                <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => navigate("/entity/calendar")}>View calendar</Button>
              </Card>
            )}

            <Card className="p-5">
              <div className="mb-2 text-sm font-semibold text-text1">Department types</div>
              <p className="mb-3 text-xs text-text3">Your department's type sets its starting drivers.</p>
              <div className="space-y-1.5">
                {(typesets ?? []).map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[t.primary_family] }} />
                    <span className="flex-1 truncate text-text2">{t.name}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><LifeBuoy size={15} className="text-primary" /> Still stuck?</div>
              <p className="mb-3 text-xs leading-relaxed text-text2">
                If a clarification is open on one of your submissions, answer it there, that's the fastest route, because it's attached to the exact figure in question.
              </p>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => navigate("/entity/submissions")}>
                Go to My Submissions
              </Button>
              <p className="mt-3 text-xs leading-relaxed text-text3">Otherwise contact the DGHR Workforce Planning team through your entity's usual DGHR channel.</p>
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
