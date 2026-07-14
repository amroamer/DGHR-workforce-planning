// Entity portal screens (rendered inside the Entity shell — chrome correction, SPEC §1).
// Phase 2 wires screens 06–10 + My Submissions to the backend; Phase 3 fills Clarifications.
import { TodoScreen } from "@/components/shared/TodoScreen";

export { Home } from "./Home";
export { MySubmissions } from "./MySubmissions";
export { OrgStructure } from "./OrgStructure";
export { Workforce } from "./Workforce";
export { Workload } from "./Workload";
export { DemandDrivers } from "./DemandDrivers";

export const Clarifications = () => (
  <TodoScreen
    title="Clarifications & Requests from DGHR"
    subtitle="Respond to clarification requests and resubmit returned packages."
    phase="Phase 3"
  />
);
