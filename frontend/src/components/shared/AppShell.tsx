import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { DemoPanel } from "./DemoPanel";
import { useLiveNotifications } from "@/lib/hooks";

// One AppShell, two variants driven by persona (SPEC §4.2). Sidebar swaps via persona store.
export function AppShell() {
  useLiveNotifications(); // live cross-portal sync (§11)
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-page">
        <Outlet />
      </main>
      <DemoPanel />
    </div>
  );
}

/** Standard page content wrapper (gutter + max width) used below the PageHeader. */
export function PageBody({ children }: { children: React.ReactNode }) {
  return <div className="animate-page px-7 py-6">{children}</div>;
}
