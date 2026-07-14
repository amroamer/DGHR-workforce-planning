// DGHR portal screens. Phase 0: thin TodoScreen wrappers with real titles/subtitles so the
// chrome is verifiable. Phase 1/3/5 replace each export with the full implementation.
import { TodoScreen } from "@/components/shared/TodoScreen";

export const CommandCenter = () => (
  <TodoScreen
    title="DGHR Data Collection Command Center"
    subtitle="Track, monitor, and accelerate data collection across Dubai Government entities."
    phase="Phase 1"
  />
);

export const DataCollection = () => (
  <TodoScreen
    title="DGHR Data Request Configuration"
    subtitle="Define what data government entities must submit, how it should be structured, and the rules for submission, review, and approval."
    phase="Phase 1"
  />
);

export const Submissions = () => (
  <TodoScreen
    title="DGHR Entity Submission Tracker"
    subtitle="Track the status and progress of all entity submissions across Dubai Government entities."
    phase="Phase 1"
  />
);

export const DataQuality = () => (
  <TodoScreen
    title="DGHR Data Quality & Validation"
    subtitle="Validate submitted data to ensure accuracy, completeness, and consistency before forecasting."
    phase="Phase 1"
  />
);

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
