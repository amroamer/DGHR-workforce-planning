import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/shared/AppShell";
import { usePersona } from "@/stores/persona";
import { PlanningDepartments } from "@/pages/planning/Departments";
import { PlanningStepper } from "@/pages/planning/Stepper";
import { PlanningSubmissions } from "@/pages/planning/Submissions";
import { PlanningGovernment } from "@/pages/planning/Government";
import { PlanningMethod } from "@/pages/planning/Method";
import { PlanningAdmin } from "@/pages/planning/Admin";
import { PlanningCyclesHistory } from "@/pages/planning/CyclesHistory";
import { PlanningDghrEntity } from "@/pages/planning/DghrEntity";
import { PlanningDghrSubmission } from "@/pages/planning/DghrSubmission";
import { PlanningEntityReports } from "@/pages/planning/EntityReports";
import { PlanningDocuments } from "@/pages/planning/Documents";
import { PlanningCalendar } from "@/pages/planning/Calendar";
import { PlanningHelp } from "@/pages/planning/Help";
import { PlanningGovReports } from "@/pages/planning/GovReports";
import { PlanningKnowledge } from "@/pages/planning/Knowledge";
import { PlanningAlerts } from "@/pages/planning/Alerts";
import { HumanCapitalOverview } from "@/pages/dghr/analytics/HumanCapital";
import { DemandAnalysis } from "@/pages/dghr/analytics/DemandAnalysis";
import { SupplyAnalysis } from "@/pages/dghr/analytics/SupplyAnalysis";
import { EntityComparison } from "@/pages/dghr/analytics/EntityComparison";

// Every nav destination is a real screen now — no placeholder routes remain.
function IndexRedirect() {
  const { persona } = usePersona();
  return <Navigate to={persona.type === "dghr" ? "/dghr/government" : "/entity/departments"} replace />;
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <IndexRedirect /> },

      // ── DGHR portal ──
      // Retired package-model screens → redirect to their department-model replacements,
      // so no dead/stale page is reachable by URL, bookmark or command palette.
      { path: "/dghr/command-center", element: <Navigate to="/dghr/government" replace /> },
      { path: "/dghr/data-collection", element: <Navigate to="/dghr/method" replace /> },
      { path: "/dghr/submissions", element: <Navigate to="/dghr/government" replace /> },
      { path: "/dghr/data-quality", element: <Navigate to="/dghr/government" replace /> },
      { path: "/dghr/forecasting-readiness", element: <Navigate to="/dghr/government" replace /> },
      { path: "/dghr/clarifications", element: <Navigate to="/dghr/government" replace /> },
      { path: "/dghr/entities", element: <Navigate to="/dghr/government" replace /> },
      // ── Executive analytics dashboards (DGHR-only) ──
      { path: "/dghr/hc-overview", element: <HumanCapitalOverview /> },
      { path: "/dghr/demand-analysis", element: <DemandAnalysis /> },
      { path: "/dghr/supply-analysis", element: <SupplyAnalysis /> },
      { path: "/dghr/entity-comparison", element: <EntityComparison /> },
      // ── Planning (department + sizing) ──
      { path: "/dghr/government", element: <PlanningGovernment /> },
      { path: "/dghr/gov-entity/:entityId", element: <PlanningDghrEntity /> },
      { path: "/dghr/gov-submission/:subId", element: <PlanningDghrSubmission /> },
      { path: "/dghr/method", element: <PlanningMethod /> },
      { path: "/dghr/alerts", element: <PlanningAlerts /> },
      { path: "/dghr/reports", element: <PlanningGovReports /> },
      { path: "/dghr/admin", element: <PlanningAdmin /> },
      { path: "/dghr/cycles", element: <PlanningCyclesHistory /> },
      { path: "/dghr/knowledge", element: <PlanningKnowledge /> },

      // ── Entity portal (department + sizing model) ──
      { path: "/entity/departments", element: <PlanningDepartments /> },
      { path: "/entity/departments/:deptId", element: <PlanningStepper /> },
      { path: "/entity/submissions", element: <PlanningSubmissions /> },
      // Retired package-model screens → redirect to their replacements.
      { path: "/entity/home", element: <Navigate to="/entity/departments" replace /> },
      { path: "/entity/my-submissions", element: <Navigate to="/entity/submissions" replace /> },
      { path: "/entity/org-structure", element: <Navigate to="/entity/departments" replace /> },
      { path: "/entity/workforce", element: <Navigate to="/entity/departments" replace /> },
      { path: "/entity/workload", element: <Navigate to="/entity/departments" replace /> },
      { path: "/entity/demand-drivers", element: <Navigate to="/entity/departments" replace /> },
      { path: "/entity/clarifications", element: <Navigate to="/entity/submissions" replace /> },
      { path: "/entity/reports", element: <PlanningEntityReports /> },
      { path: "/entity/documents", element: <PlanningDocuments /> },
      { path: "/entity/calendar", element: <PlanningCalendar /> },
      { path: "/entity/help", element: <PlanningHelp /> },

      { path: "*", element: <IndexRedirect /> },
    ],
  },
]);
