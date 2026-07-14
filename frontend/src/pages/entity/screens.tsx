// Entity portal screens (rendered inside the Entity shell — chrome correction, SPEC §1).
// Phase 0: thin TodoScreen wrappers. Phase 2/3 replace each with the full implementation.
import { TodoScreen } from "@/components/shared/TodoScreen";

export const Home = () => (
  <TodoScreen
    title="Entity Data Collection Home"
    subtitle="Submit your entity's workforce planning data as required by DGHR."
    phase="Phase 2"
  />
);

export const MySubmissions = () => (
  <TodoScreen title="My Submissions" subtitle="Your entity's data packages and their status." phase="Phase 2" />
);

export const OrgStructure = () => (
  <TodoScreen
    title="Organization Structure Submission"
    subtitle="Confirm and submit your organization structure down to section level for review."
    phase="Phase 2"
  />
);

export const Workforce = () => (
  <TodoScreen
    title="Current Workforce Data"
    subtitle="Submit your organization's current workforce baseline data."
    phase="Phase 2"
  />
);

export const Workload = () => (
  <TodoScreen
    title="Workload & Service Data"
    subtitle="Capture the business drivers of workforce demand across Dubai Government entities."
    phase="Phase 2"
  />
);

export const DemandDrivers = () => (
  <TodoScreen
    title="Future Demand Drivers & Evidence"
    subtitle="Capture future demand drivers and link supporting evidence to strengthen forecasting assumptions."
    phase="Phase 2"
  />
);

export const Clarifications = () => (
  <TodoScreen
    title="Clarifications & Requests from DGHR"
    subtitle="Respond to clarification requests and resubmit returned packages."
    phase="Phase 3"
  />
);
