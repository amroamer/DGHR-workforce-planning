// DGHR portal screens — all wired.
import { ClarificationsView } from "@/components/shared/ClarificationsView";

export { CommandCenter } from "./CommandCenter";
export { DataCollection } from "./DataCollection";
export { Entities } from "./Entities";
export { Submissions } from "./Submissions";
export { DataQuality } from "./DataQuality";
export { ForecastingReadiness } from "./ForecastingReadiness";

export const Clarifications = () => (
  <ClarificationsView
    side="dghr"
    title="DGHR Clarifications & Resubmissions"
    subtitle="Manage clarification requests, returned items, and resubmissions from entities."
  />
);
