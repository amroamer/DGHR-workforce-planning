import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BasisKey } from "@/lib/planning";
import { Segmented, Select } from "@/components/shared/dashcharts";
import { Alert } from "@/components/ui/alert";

// Shared filter state + bar for the three executive dashboards. Scope (all vs one entity), basis and
// scenario are query params → live refetch, so panels always reconcile with the Government Position.
export function useAnalyticsControls() {
  const [entityId, setEntityId] = useState<number | undefined>(undefined); // undefined = government-wide
  const [basis, setBasis] = useState<BasisKey>("received");
  const [scenario, setScenario] = useState("base");
  const { data: entities } = useQuery({ queryKey: ["entities-list"], queryFn: () => api.entitiesList() });
  return {
    entityId, setEntityId, basis, setBasis, scenario, setScenario, entities: entities ?? [],
    /** identity of the current filter selection — charts re-animate when it changes */
    animKey: `${basis}|${scenario}|${entityId ?? "all"}`,
  };
}

export function ControlsBar({ ctrl, bases, scenarios, showScenario = true, showBasis = true }: {
  ctrl: ReturnType<typeof useAnalyticsControls>;
  bases?: { key: BasisKey; label: string }[];
  scenarios?: { key: string; label: string }[];
  showScenario?: boolean; showBasis?: boolean;
}) {
  const scopeOptions = [{ value: "", label: "Government-wide (all entities)" },
    ...ctrl.entities.map((e) => ({ value: String(e.id), label: e.name }))];
  return (
    // Sticky + frosted: the current Scope/Basis/Scenario stays pinned as you scroll the
    // page, so an exec always sees what they're looking at. Bleeds edge-to-edge of the
    // PageBody gutter so the blur strip spans the full width.
    <div className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-end gap-3 border-b border-border/70 bg-page/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-7 lg:px-7">
      <Select label="Scope" value={ctrl.entityId != null ? String(ctrl.entityId) : ""}
        options={scopeOptions}
        onChange={(v) => ctrl.setEntityId(v ? Number(v) : undefined)} />
      {showBasis && ctrl.entityId == null && (
        <Select label="Basis" value={ctrl.basis}
          options={(bases ?? [{ key: "received" as BasisKey, label: "All received submissions" }]).map((b) => ({ value: b.key, label: b.label }))}
          onChange={(v) => ctrl.setBasis(v as BasisKey)} />
      )}
      {showScenario && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-text3">Scenarios</span>
          <Segmented value={ctrl.scenario}
            options={(scenarios ?? [{ key: "base", label: "Baseline" }]).map((s) => ({ value: s.key, label: s.label }))}
            onChange={ctrl.setScenario} />
        </div>
      )}
      {/* Live is the page-wide default, stated once here — cards only flag the exception
          ("Illustrative reference"), so the chips stay meaningful. */}
      <span className="ml-auto hidden items-center gap-1.5 self-end pb-2 text-[11px] font-medium text-text3 sm:inline-flex">
        <span className="h-2 w-2 rounded-full bg-success motion-safe:animate-pulse" />
        Live, computed from submissions
      </span>
    </div>
  );
}

/** "Illustrative reference" banner shown atop hybrid tabs so the boundary is explicit. */
export function IllustrativeNote({ children }: { children?: React.ReactNode }) {
  return (
    <Alert tone="purple" className="mb-4 text-xs">
      {children ?? "Panels below marked “Illustrative reference” are labour-market intelligence, not collected from entity submissions."}
    </Alert>
  );
}
