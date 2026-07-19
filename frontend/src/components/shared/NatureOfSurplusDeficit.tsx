// S6/S16: the nature-of-surplus and nature-of-deficit analysis — the general types of roles in the
// excess and in the deficit, and how each is expected to be filled. This is REFERENCE material
// (framework shared from MHRSD); it is clearly labelled Illustrative until the entity's own analysis
// is loaded, so no operational figure is implied. Swap the arrays for the supplied MHRSD content.
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VisionBadge } from "@/components/shared/VisionBadge";

interface RoleNature { type: string; approach: string }

const DEFICIT: RoleNature[] = [
  { type: "Digital & data specialists", approach: "Targeted external hiring plus internal upskilling programmes." },
  { type: "Regulatory & inspection", approach: "Graduate pipeline and accredited certification programmes." },
  { type: "Front-line customer service", approach: "Internal redeployment from back-office functions." },
];

const SURPLUS: RoleNature[] = [
  { type: "Clerical & administrative", approach: "Reskill toward digital service delivery roles." },
  { type: "Legacy back-office processing", approach: "Automation-led redeployment to higher-value work." },
  { type: "Duplicated corporate functions", approach: "Consolidate into government shared services." },
];

function NatureColumn({ title, tone, icon, rows, fillLabel }: {
  title: string; tone: string; icon: React.ReactNode; rows: RoleNature[]; fillLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: tone }}>{icon} {title}</div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.type} className="rounded-lg border border-border bg-page/50 p-3">
            <div className="text-sm font-semibold text-text1">{r.type}</div>
            <div className="mt-0.5 text-xs text-text2"><span className="text-text3">{fillLabel}:</span> {r.approach}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NatureOfSurplusDeficit() {
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-text1">Nature of surplus &amp; deficit</div>
        <VisionBadge />
      </div>
      <p className="mb-4 text-xs text-text3">
        The general types of roles in the excess and in the deficit, and how each is expected to be filled.
        Reference framework shared from MHRSD, illustrative until the entity&apos;s own workforce analysis is loaded.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        <NatureColumn title="Nature of deficit (shortage)" tone="rgb(var(--danger))"
          icon={<TrendingDown size={16} />} rows={DEFICIT} fillLabel="How it will be filled" />
        <NatureColumn title="Nature of surplus (excess)" tone="rgb(var(--success))"
          icon={<TrendingUp size={16} />} rows={SURPLUS} fillLabel="How it will be redeployed" />
      </div>
    </Card>
  );
}
