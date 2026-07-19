import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { useTone } from "@/lib/tone";
import { familyHint, FAMILY_COLOR, FAMILY_LABEL, type Family } from "@/lib/planning";

const FAMILIES: Family[] = ["demand", "ratio", "coverage", "mandate", "project"];
const FAM_DESC: Record<Family, string> = {
  demand: "Work arrives in countable units: applications, inspections, tickets.",
  ratio: "Capacity serves a population: employees, sites, systems.",
  coverage: "A post must be manned regardless of volume: shifts, geography.",
  mandate: "A law, licence or safety rule fixes the minimum. Non-negotiable.",
  project: "Work comes as a portfolio of finite endeavours.",
};

export function PlanningMethod() {
  const tone = useTone();
  const { data: typesets } = useQuery({ queryKey: ["q-typesets"], queryFn: api.planning.typesets });
  // Formulas come from the published method registry — never retyped into the UI.
  const { data: registry } = useQuery({ queryKey: ["method-registry"], queryFn: api.planning.methodRegistry, staleTime: 5 * 60_000 });

  // Categorical family colour used only as a soft tint + accent (not a saturated fill).
  const familyTint = (f: Family) => `color-mix(in srgb, ${FAMILY_COLOR[f]} 10%, transparent)`;

  return (
    <>
      <PageHeader title="Method & Typeset Library" subtitle="The sizing method the whole platform runs on: five driver families and ten department typesets." />
      <PageBody>
        <Card className="mb-4">
          <div className="mb-1 text-sm font-semibold text-text1">The five driver families</div>
          <p className="mb-4 text-xs text-text3">Every department sizes through one of these logics, usually a blend. The engine resolves them with <b className="text-text2">required = max(workload build-up, statutory floor)</b>.</p>
          <div className="grid gap-3 md:grid-cols-5">
            {FAMILIES.map((f) => (
              <div key={f} className="flex h-full flex-col overflow-hidden rounded-card border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3"
                  style={{ background: familyTint(f), borderLeft: `3px solid ${FAMILY_COLOR[f]}` }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: FAMILY_COLOR[f] }} />
                  <span className="text-sm font-bold tracking-tight" style={{ color: tone.fg(FAMILY_COLOR[f]) }}>{FAMILY_LABEL[f]}</span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="mb-3 text-xs leading-relaxed text-text2">{FAM_DESC[f]}</p>
                  <div className="mt-auto rounded-btn border border-border bg-inset px-2.5 py-2 font-mono text-[11px] leading-relaxed text-text2">
                    <span className="text-text3">ƒ</span> {familyHint(registry, f)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="min-w-0 p-0">
          <div className="border-b border-border px-5 py-3.5 text-sm font-semibold text-text1">The ten typesets</div>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className={THEAD_TR}><th className="px-5 py-2.5">Typeset</th><th className={TH}>Primary family</th><th className={TH}>Default drivers</th></tr></thead>
            <tbody>
              {(typesets ?? []).map((t) => (
                <tr key={t.id} className={TROW}>
                  <td className="px-5 py-3.5 text-sm font-semibold text-text1">{t.name}</td>
                  <td className={TD}>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: familyTint(t.primary_family), color: tone.fg(FAMILY_COLOR[t.primary_family]) }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: FAMILY_COLOR[t.primary_family] }} />
                      {FAMILY_LABEL[t.primary_family]}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-sm leading-relaxed text-text2">{t.default_drivers.map((d) => d.name).join(", ")}</td>
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
