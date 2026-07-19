import {
  Globe,
  BarChart3,
  Settings,
  BookOpen,
  Network,
  FileStack,
  FolderClosed,
  Calendar,
  LifeBuoy,
  Layers,
  TriangleAlert,
  LayoutDashboard,
  TrendingUp,
  GraduationCap,
  History,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badgeKey?: "open_cases"; // dynamic badge
  activeAlso?: string[]; // extra paths that keep this item highlighted
  group?: string; // optional section label rendered above the first item of a group
}

// DGHR nav — the department + sizing model. The three executive dashboards sit ON TOP (DGHR-only),
// then everything flows from Government Position.
export const DGHR_NAV: NavItem[] = [
  { label: "Human Capital Overview", to: "/dghr/hc-overview", icon: LayoutDashboard, group: "Executive Dashboards" },
  { label: "Demand Analysis", to: "/dghr/demand-analysis", icon: TrendingUp },
  { label: "Supply Analysis", to: "/dghr/supply-analysis", icon: GraduationCap },
  { label: "Government-Wide Position", to: "/dghr/government", icon: Globe, group: "Workforce Planning", activeAlso: ["/dghr/gov-entity", "/dghr/gov-submission"] },
  { label: "Method & Typesets", to: "/dghr/method", icon: Layers },
  { label: "Alerts & Smart Flags", to: "/dghr/alerts", icon: TriangleAlert },
  { label: "Reports", to: "/dghr/reports", icon: BarChart3 },
  { label: "Admin", to: "/dghr/admin", icon: Settings },
  { label: "Cycle History", to: "/dghr/cycles", icon: History },
  { label: "Knowledge Center", to: "/dghr/knowledge", icon: BookOpen },
];

// Entity nav — departments replace the old packages.
export const ENTITY_NAV: NavItem[] = [
  { label: "Departments", to: "/entity/departments", icon: Network, activeAlso: ["/entity/departments/"] },
  { label: "My Submissions", to: "/entity/submissions", icon: FileStack },
  { label: "Reports", to: "/entity/reports", icon: BarChart3 },
  { label: "Documents", to: "/entity/documents", icon: FolderClosed },
  { label: "Programme & Wave Management", to: "/entity/calendar", icon: Calendar },
  { label: "Help & Support", to: "/entity/help", icon: LifeBuoy },
];
