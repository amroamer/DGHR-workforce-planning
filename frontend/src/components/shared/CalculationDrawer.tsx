import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ChevronRight,
  FileText,
  Pencil,
  Undo2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { api } from "@/lib/api";
import { usePersona } from "@/stores/persona";
import type { CalcTrace, ParamOrigin, TraceKind, TraceParameter } from "@/lib/planning";
import { cn } from "@/lib/utils";

// "View calculation" — the panel that makes a number defensible.
//
// It answers, for ONE figure: what went in and where it came from, the formula (symbolic AND with
// the values substituted), every parameter and whether it was stated/inherited/defaulted, how it was
// rounded, which typeset version it was sized against, when it was calculated, any override, and who
// entered or changed it.
//
// Inputs that are themselves calculated are clickable, so a government total can be walked all the
// way down to the single volume a named person typed. That drill-down is the whole point: a figure
// that can only be explained one level deep isn't traceable, it's just annotated.

const ORIGIN_LABEL: Record<ParamOrigin, string> = {
  entity_stated: "Stated by entity",
  entity_adjusted: "Adjusted by entity",
  typeset_standard: "Typeset standard",
  method_default: "Method default",
  parameter: "Governed parameter",
};

// Origin is the honest part of a parameter: a standard the entity accepted, a value it deliberately
// moved, and a default nobody ever set are three different kinds of evidence.
const ORIGIN_TONE: Record<ParamOrigin, string> = {
  entity_stated: "bg-primary/10 text-primary",
  entity_adjusted: "bg-warning-bg text-warning",
  typeset_standard: "bg-text3/15 text-text2",
  method_default: "bg-text3/15 text-text3",
  parameter: "bg-text3/15 text-text2",
};

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text3">{title}</h3>
      {hint && <p className="mb-2 text-xs text-text3">{hint}</p>}
      {children}
    </section>
  );
}

function Formula({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border border-border px-3 py-2 font-mono text-[13px] leading-relaxed",
        muted ? "bg-page text-text2" : "bg-card text-text1",
      )}
      style={{ overflowX: "auto" }}
    >
      {text}
    </div>
  );
}

function Person({ person, at, verb }: { person?: { name: string; role: string } | null; at?: string | null; verb: string }) {
  if (!person) {
    // Never invent a name. "Not recorded" is the honest answer for data that predates attribution.
    return <div className="text-xs text-text3">{verb}: not recorded</div>;
  }
  return (
    <div className="flex items-start gap-2 text-xs">
      <User size={13} className="mt-0.5 shrink-0 text-text3" />
      <div>
        <span className="font-medium text-text1">{person.name}</span>
        {person.role && <span className="text-text3">, {person.role.replace(/_/g, " ")}</span>}
        <div className="text-text3">
          {verb}
          {at ? ` ${new Date(at).toLocaleString()}` : ""}
        </div>
      </div>
    </div>
  );
}

function ParamRow({ p }: { p: TraceParameter }) {
  // A numeric value sits inline with the label; a prose value (e.g. a rounding rule) gets its own
  // line. Forcing both into one row squeezed the label to nothing and the two texts overlapped.
  const numeric = typeof p.value === "number";
  return (
    <div className="border-b border-border py-2 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 text-[13px] text-text1">{p.label}</div>
        <div className="flex shrink-0 items-center gap-2">
          {numeric && (
            <>
              <span className="font-mono text-[13px] font-semibold text-text1">{p.display}</span>
              {p.unit && <span className="text-[11px] text-text3">{p.unit}</span>}
            </>
          )}
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ORIGIN_TONE[p.origin])}>
            {ORIGIN_LABEL[p.origin]}
          </span>
        </div>
      </div>
      {!numeric && (
        <div className="mt-0.5 font-mono text-[12px] text-text1">{p.display}</div>
      )}
      <div className="text-[11px] text-text3">{p.source}</div>
      {p.origin === "entity_adjusted" && p.standard_value != null && (
        <div className="text-[11px] text-warning">Standard is {p.standard_value}</div>
      )}
    </div>
  );
}

function OverrideForm({ trace, onDone }: { trace: CalcTrace; onDone: () => void }) {
  const { persona } = usePersona();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(trace.result.value));
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api.planning.overrideDriver(trace.ref_id, {
        value: Number(value),
        reason,
        actor_name: persona.userName,
        actor_role: persona.userRole,
      }),
    onSuccess: () => {
      toast.success("Override recorded", { description: `Attributed to ${persona.userName}.` });
      qc.invalidateQueries();
      setOpen(false);
      setReason("");
      onDone();
    },
    onError: (e: Error) => toast.error("Could not record override", { description: e.message }),
  });

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} className="w-full">
        <Pencil size={14} className="mr-1.5" /> Override this value
      </Button>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="number"
          aria-label="Override FTE value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-24 rounded-md border border-border px-2 py-1.5 text-sm"
        />
        <span className="text-xs text-text3">FTE (calculated: {trace.result.display})</span>
      </div>
      <textarea
        aria-label="Reason for override"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Why is the calculated figure being overruled? This is recorded against your name."
        rows={3}
        className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <Button
          onClick={() => save.mutate()}
          disabled={!reason.trim() || save.isPending}
          className="flex-1"
        >
          {save.isPending ? "Recording…" : `Record as ${persona.userName}`}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function CalculationDrawer({
  open,
  onClose,
  kind,
  refId,
  scenario = "base",
}: {
  open: boolean;
  onClose: () => void;
  kind: TraceKind;
  refId: number;
  scenario?: string;
}) {
  // The drill-down stack: each entry is a figure we descended into. Lets the reader walk a
  // government total down to one entered value and climb back out the way they came.
  const [stack, setStack] = useState<{ kind: TraceKind; refId: number; label: string }[]>([]);
  const current = stack.length ? stack[stack.length - 1] : { kind, refId, label: "" };
  const qc = useQueryClient();

  const { data: trace, isLoading } = useQuery({
    queryKey: ["calc-trace", current.kind, current.refId, scenario],
    queryFn: () => api.planning.trace(current.kind, current.refId, scenario),
    enabled: open,
  });

  const close = () => {
    setStack([]);
    onClose();
  };

  const revoke = useMutation({
    mutationFn: (id: number) => api.planning.revokeOverride(id),
    onSuccess: () => {
      toast.success("Override withdrawn", { description: "The value reverted to the calculated figure." });
      qc.invalidateQueries();
    },
  });

  return (
    <Drawer
      open={open}
      onClose={close}
      width={560}
      title={
        <div className="flex items-center gap-2">
          <span>View calculation</span>
          {stack.length > 0 && (
            <button
              onClick={() => setStack((s) => s.slice(0, -1))}
              className="text-xs font-normal text-accent hover:underline"
            >
              ← back
            </button>
          )}
        </div>
      }
    >
      {isLoading && <div className="text-sm text-text3">Loading calculation…</div>}

      {trace?.unavailable && (
        <div className="flex items-start gap-2 rounded-md bg-warning-bg p-3 text-sm text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {trace.unavailable}
        </div>
      )}

      {trace && !trace.unavailable && (
        <>
          {/* result */}
          <div className="mb-5 rounded-card border border-border bg-card p-4">
            <div className="text-xs text-text3">{trace.title}</div>
            {/* The title already names the department, so only add what it doesn't say. */}
            {trace.context?.entity && !trace.title.includes(trace.context.entity) && (
              <div className="text-[11px] text-text3">{trace.context.entity}</div>
            )}
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold text-text1">{trace.result.display}</span>
              <span className="text-sm text-text3">{trace.result.unit}</span>
              {trace.overrides?.some((o) => o.active) && (
                <StatusBadge value="needs_attention" label="Overridden" />
              )}
              {trace.partial && <StatusBadge value="partial" label="Partial" />}
              {trace.official && <StatusBadge value="approved" label="Official" />}
            </div>
          </div>

          {/* Which period, and every period side by side.
              The headline sizes from the reported 12-month volume, so it states THIS cycle — but
              that was implicit, leaving it unclear whether the figure was current demand, next
              cycle's, an approved establishment, or a recommendation. Now it says so, and shows the
              forecast and the movement between them rather than hiding them in a chart. */}
          {trace.measures && trace.measures.length > 0 && (
            <Section title="Which period is this?" hint={trace.measure?.period_note}>
              <div className="overflow-hidden rounded-card border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border bg-page px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text3">
                  <span>Measure</span>
                  <span>Calculation</span>
                </div>
                {trace.measures.map((ms) => {
                  const isHeadline = ms.key === trace.measure?.key;
                  return (
                    <div
                      key={ms.key}
                      className={cn("border-b border-border px-3 py-2 last:border-0", isHeadline && "bg-primary/5")}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] text-text1">
                            {ms.label}
                            {isHeadline && (
                              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                                Shown above
                              </span>
                            )}
                          </div>
                          {ms.period_note && <div className="text-[11px] text-text3">{ms.period_note}</div>}
                          {ms.assumed_flat && (
                            <div className="text-[11px] text-warning">
                              No forecast stated (assumed flat, not a forecast of no change).
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={cn("font-mono text-[13px] font-semibold",
                            ms.derived ? (ms.value > 0 ? "text-danger" : ms.value < 0 ? "text-success" : "text-text3") : "text-text1")}>
                            {ms.display}
                          </div>
                        </div>
                      </div>
                      {ms.calculation && (
                        <div className="mt-1 font-mono text-[11px] text-text2">{ms.calculation}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-text3">
                Planning change is a planning signal, not an approval to recruit.
              </p>
            </Section>
          )}

          {/* the formula, then the same formula with the values in it */}
          <Section title="Formula">
            <Formula text={trace.method.expression} muted />
            <div className="my-1.5 flex justify-center text-text3">
              <ChevronRight size={14} className="rotate-90" />
            </div>
            <Formula text={`${trace.method.substituted} = ${trace.result.display}`} />
            {trace.method.description && (
              <p className="mt-2 text-xs text-text2">{trace.method.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text3">
              {trace.method.source && (
                <span className="inline-flex items-center gap-1">
                  <FileText size={11} /> {trace.method.source}
                </span>
              )}
              {trace.method.ref && <span>Method {trace.method.ref}</span>}
              {trace.typeset && <span>Typeset {trace.typeset.label}</span>}
              {trace.method.owner && <span>Owner: {trace.method.owner}</span>}
            </div>
          </Section>

          {/* steps */}
          <Section title="How the number was reached">
            <ol className="space-y-2">
              {trace.steps.map((s, i) => (
                <li key={i} className="rounded-md border border-border bg-card p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-text3">
                      {s.label}
                    </span>
                    <span className="font-mono text-[13px] text-text1">{s.detail}</span>
                  </div>
                  {s.note && <p className="mt-1 text-[11px] text-text3">{s.note}</p>}
                </li>
              ))}
            </ol>
          </Section>

          {/* inputs — each one traceable in its own right */}
          <Section
            title="Inputs"
            hint={
              trace.inputs.some((i) => i.traceable)
                ? "Each input is itself calculated. Open it to trace further down."
                : undefined
            }
          >
            <div className="rounded-card border border-border bg-card px-3">
              {trace.inputs.map((inp, i) => {
                const drillable = Boolean(inp.traceable && inp.source_ref?.id);
                const Row = (
                  <>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[13px] text-text1">
                        {inp.label}
                        {inp.overridden && <StatusBadge value="needs_attention" label="Overridden" />}
                        {inp.estimated && <StatusBadge value="partial" label="Estimated" />}
                      </div>
                      <div className="truncate text-[11px] text-text3">{inp.source}</div>
                      {inp.entered_by && (
                        <div className="text-[11px] text-text3">
                          Entered by {inp.entered_by.name}
                          {inp.entered_at ? `, ${new Date(inp.entered_at).toLocaleDateString()}` : ""}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="font-mono text-[13px] font-semibold text-text1">{inp.display}</span>
                      {inp.unit && inp.unit !== "FTE" && (
                        <span className="text-[11px] text-text3">{inp.unit}</span>
                      )}
                      {drillable && <ChevronRight size={14} className="text-text3" />}
                    </div>
                  </>
                );
                return drillable ? (
                  <button
                    key={i}
                    onClick={() =>
                      setStack((s) => [
                        ...s,
                        { kind: inp.source_ref!.kind, refId: inp.source_ref!.id!, label: inp.label },
                      ])
                    }
                    className="flex w-full items-start justify-between gap-3 border-b border-border py-2 text-left last:border-0 hover:bg-page"
                  >
                    {Row}
                  </button>
                ) : (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 border-b border-border py-2 last:border-0"
                  >
                    {Row}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* what was left out — a sum is only honest if it says what it excluded */}
          {trace.excluded && trace.excluded.length > 0 && (
            <Section title="Excluded from this total">
              <div className="rounded-card border border-warning/40 bg-warning-bg px-3 py-2">
                {trace.excluded.map((x, i) => (
                  <div key={i} className="flex justify-between py-1 text-xs text-warning">
                    <span>{x.label}</span>
                    <span className="capitalize">{x.reason}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {trace.parameters && trace.parameters.length > 0 && (
            <Section title="Parameters" hint="Where each standard came from, and whether anyone set it.">
              <div className="rounded-card border border-border bg-card px-3">
                {trace.parameters.map((p) => (
                  <ParamRow key={p.key} p={p} />
                ))}
              </div>
            </Section>
          )}

          {trace.rounding && (
            <Section title="Rounding">
              <div className="rounded-card border border-border bg-card p-3">
                <div className="flex items-center gap-2 font-mono text-[13px]">
                  <span className="text-text3">{trace.rounding.raw_display}</span>
                  <ArrowRight size={13} className="text-text3" />
                  <span className="font-semibold text-text1">{trace.rounding.rounded}</span>
                </div>
                <div className="mt-1 text-xs text-text1">{trace.rounding.label}</div>
                {trace.rounding.note && (
                  <p className="mt-1 text-[11px] text-text3">{trace.rounding.note}</p>
                )}
              </div>
            </Section>
          )}

          {/* overrides — the calculated value is always kept beside the human's */}
          <Section title="Overrides">
            {trace.overrides && trace.overrides.length > 0 ? (
              <div className="space-y-2">
                {trace.overrides.map((o) => (
                  <div
                    key={o.id}
                    className={cn(
                      "rounded-card border p-3",
                      o.active ? "border-warning/50 bg-warning-bg" : "border-border bg-page opacity-75",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-mono text-[13px]">
                        <span className="text-text3 line-through">{o.calculated_value}</span>
                        <ArrowRight size={13} className="text-text3" />
                        <span className="font-semibold text-text1">{o.override_value}</span>
                        <span className="text-[11px] text-text3">
                          ({o.delta > 0 ? "+" : ""}
                          {o.delta})
                        </span>
                      </div>
                      {!o.active && <StatusBadge value="not_in_scope" label="Withdrawn" />}
                    </div>
                    <p className="mt-1.5 text-xs text-text1">{o.reason}</p>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <Person person={o.actor} at={o.created_at} verb="Changed by" />
                      {o.active && (
                        <button
                          onClick={() => revoke.mutate(o.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                        >
                          <Undo2 size={11} /> Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-text3">
                No overrides. This figure is the engine&apos;s own, unmodified.
              </p>
            )}
            {trace.kind === "driver" && (
              <div className="mt-2">
                <OverrideForm trace={trace} onDone={() => undefined} />
              </div>
            )}
          </Section>

          {/* attribution + dates */}
          <Section title="Provenance">
            <div className="space-y-2 rounded-card border border-border bg-card p-3">
              {trace.provenance?.entered_by !== undefined && (
                <Person
                  person={trace.provenance?.entered_by}
                  at={trace.provenance?.entered_at}
                  verb="Entered by"
                />
              )}
              <Person
                person={trace.provenance?.submitted_by}
                at={trace.provenance?.submitted_at}
                verb="Submitted by"
              />
              {trace.provenance?.decided_by && (
                <Person
                  person={trace.provenance.decided_by}
                  at={trace.provenance.decided_at}
                  verb="Approved by"
                />
              )}
              <div className="flex items-start gap-2 border-t border-border pt-2 text-xs text-text3">
                <CalendarClock size={13} className="mt-0.5 shrink-0" />
                <div>
                  Calculated {new Date(trace.calculated_at).toLocaleString()}
                  <div className="text-[11px]">
                    Computed on demand from the inputs above. Never stored, so it cannot go stale.
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {trace.flags && trace.flags.length > 0 && (
            <Section title="Flags">
              <div className="flex flex-wrap gap-1.5">
                {trace.flags.map((f) => (
                  <StatusBadge key={f} value="needs_attention" label={f} />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </Drawer>
  );
}
