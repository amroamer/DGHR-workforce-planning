// Entity portal screens (rendered inside the Entity shell — chrome correction, SPEC §1).
import { ClarificationsView } from "@/components/shared/ClarificationsView";
import { useAudience } from "@/lib/hooks";

export { Home } from "./Home";
export { MySubmissions } from "./MySubmissions";
export { OrgStructure } from "./OrgStructure";
export { Workforce } from "./Workforce";
export { Workload } from "./Workload";
export { DemandDrivers } from "./DemandDrivers";

export const Clarifications = () => {
  const { entityId } = useAudience();
  return (
    <ClarificationsView
      side="entity"
      entityId={entityId}
      title="Clarifications & Requests from DGHR"
      subtitle="Respond to clarification requests and resubmit returned packages."
    />
  );
};
