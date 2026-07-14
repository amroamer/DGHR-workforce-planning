import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell, PageBody } from "@/components/shared/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { PlaceholderPage } from "@/components/shared/PlaceholderPage";
import { usePersona } from "@/stores/persona";
import * as Dghr from "@/pages/dghr/screens";
import * as Entity from "@/pages/entity/screens";

// §9.8 placeholder route: real PageHeader + centered EmptyState.
function Placeholder({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageBody>
        <PlaceholderPage title={title} />
      </PageBody>
    </>
  );
}

function IndexRedirect() {
  const { persona } = usePersona();
  return <Navigate to={persona.type === "dghr" ? "/dghr/command-center" : "/entity/home"} replace />;
}

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <IndexRedirect /> },

      // ── DGHR portal ──
      { path: "/dghr/command-center", element: <Dghr.CommandCenter /> },
      { path: "/dghr/data-collection", element: <Dghr.DataCollection /> },
      { path: "/dghr/submissions", element: <Dghr.Submissions /> },
      { path: "/dghr/data-quality", element: <Dghr.DataQuality /> },
      { path: "/dghr/forecasting-readiness", element: <Dghr.ForecastingReadiness /> },
      { path: "/dghr/clarifications", element: <Dghr.Clarifications /> },
      // roadmap placeholders (no dead links)
      { path: "/dghr/entities", element: <Placeholder title="Entities" subtitle="Manage Dubai Government entities, sectors, and coverage." /> },
      { path: "/dghr/alerts", element: <Placeholder title="Alerts & AI Flags" subtitle="Review AI-detected anomalies, risks, and exceptions across the exercise." /> },
      { path: "/dghr/reports", element: <Placeholder title="Reports" subtitle="Generate section, entity, and government-wide workforce reports." /> },
      { path: "/dghr/admin", element: <Placeholder title="Admin" subtitle="Configure cycles, users, roles, and platform settings." /> },
      { path: "/dghr/knowledge", element: <Placeholder title="Knowledge Center" subtitle="Methodology guides, templates, and frequently asked questions." /> },

      // ── Entity portal ──
      { path: "/entity/home", element: <Entity.Home /> },
      { path: "/entity/my-submissions", element: <Entity.MySubmissions /> },
      { path: "/entity/org-structure", element: <Entity.OrgStructure /> },
      { path: "/entity/workforce", element: <Entity.Workforce /> },
      { path: "/entity/workload", element: <Entity.Workload /> },
      { path: "/entity/demand-drivers", element: <Entity.DemandDrivers /> },
      { path: "/entity/clarifications", element: <Entity.Clarifications /> },
      // roadmap placeholders
      { path: "/entity/reports", element: <Placeholder title="Reports" subtitle="View reports shared by DGHR for your entity." /> },
      { path: "/entity/documents", element: <Placeholder title="Documents" subtitle="Access templates, guidance, and your submitted evidence." /> },
      { path: "/entity/calendar", element: <Placeholder title="Calendar" subtitle="Upcoming deadlines and scheduled workshops." /> },
      { path: "/entity/help", element: <Placeholder title="Help & Support" subtitle="Get help and contact the DGHR project team." /> },

      { path: "*", element: <IndexRedirect /> },
    ],
  },
]);
