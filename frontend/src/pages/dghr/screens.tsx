// DGHR portal screens. Phases 1 & 3 wired; Forecasting Readiness lands in Phase 5.
import { TodoScreen } from "@/components/shared/TodoScreen";
import { ClarificationsView } from "@/components/shared/ClarificationsView";

export { CommandCenter } from "./CommandCenter";
export { DataCollection } from "./DataCollection";
export { Submissions } from "./Submissions";
export { DataQuality } from "./DataQuality";

export const Clarifications = () => (
  <ClarificationsView
    side="dghr"
    title="DGHR Clarifications & Resubmissions"
    subtitle="Manage clarification requests, returned items, and resubmissions from entities."
  />
);

export const ForecastingReadiness = () => (
  <TodoScreen
    title="Forecasting Readiness"
    subtitle="Track which entities are ready for forecasting — and preview the planning insights this collection unlocks."
    phase="Phase 5"
  />
);
