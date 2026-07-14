// DGHR portal screens. Phase 1 wires screens 01–04 to the backend; Phase 3/5 fill the rest.
import { TodoScreen } from "@/components/shared/TodoScreen";

export { CommandCenter } from "./CommandCenter";
export { DataCollection } from "./DataCollection";
export { Submissions } from "./Submissions";
export { DataQuality } from "./DataQuality";

export const Clarifications = () => (
  <TodoScreen
    title="DGHR Clarifications & Resubmissions"
    subtitle="Manage clarification requests, returned items, and resubmissions from entities."
    phase="Phase 3"
  />
);

export const ForecastingReadiness = () => (
  <TodoScreen
    title="Forecasting Readiness"
    subtitle="Track which entities are ready for forecasting — and preview the planning insights this collection unlocks."
    phase="Phase 5"
  />
);
