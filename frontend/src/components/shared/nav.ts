import {
  LayoutGrid,
  Building2,
  ClipboardList,
  Send,
  ShieldCheck,
  TrendingUp,
  Bell,
  BarChart3,
  Settings,
  BookOpen,
  Home,
  FileStack,
  FolderClosed,
  Calendar,
  LifeBuoy,
  MessageSquareWarning,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  badgeKey?: "open_cases"; // dynamic badge
  activeAlso?: string[]; // extra paths that keep this item highlighted
}

// DGHR nav (fixed order — SPEC §4.2). Submissions stays highlighted on /dghr/clarifications.
export const DGHR_NAV: NavItem[] = [
  { label: "Command Center", to: "/dghr/command-center", icon: LayoutGrid },
  { label: "Entities", to: "/dghr/entities", icon: Building2 },
  { label: "Data Collection", to: "/dghr/data-collection", icon: ClipboardList },
  { label: "Submissions", to: "/dghr/submissions", icon: Send, activeAlso: ["/dghr/clarifications"] },
  { label: "Data Quality", to: "/dghr/data-quality", icon: ShieldCheck },
  { label: "Forecasting Readiness", to: "/dghr/forecasting-readiness", icon: TrendingUp },
  { label: "Alerts & AI Flags", to: "/dghr/alerts", icon: Bell },
  { label: "Reports", to: "/dghr/reports", icon: BarChart3 },
  { label: "Admin", to: "/dghr/admin", icon: Settings },
  { label: "Knowledge Center", to: "/dghr/knowledge", icon: BookOpen },
];

// Entity nav (fixed order — SPEC §4.2). Clarifications badge = open cases.
export const ENTITY_NAV: NavItem[] = [
  { label: "Home", to: "/entity/home", icon: Home },
  { label: "My Submissions", to: "/entity/my-submissions", icon: FileStack },
  { label: "Data Collection", to: "/entity/org-structure", icon: ClipboardList, activeAlso: ["/entity/workforce", "/entity/workload", "/entity/demand-drivers"] },
  { label: "Clarifications", to: "/entity/clarifications", icon: MessageSquareWarning, badgeKey: "open_cases" },
  { label: "Reports", to: "/entity/reports", icon: BarChart3 },
  { label: "Documents", to: "/entity/documents", icon: FolderClosed },
  { label: "Calendar", to: "/entity/calendar", icon: Calendar },
  { label: "Help & Support", to: "/entity/help", icon: LifeBuoy },
];
