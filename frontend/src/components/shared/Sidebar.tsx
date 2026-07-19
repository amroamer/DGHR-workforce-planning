import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePersona } from "@/stores/persona";
import { useSidebar } from "@/stores/sidebar";
import { useAudience } from "@/lib/hooks";
import { api } from "@/lib/api";
import { DGHR_NAV, ENTITY_NAV, type NavItem } from "./nav";
import { Crest } from "./Brand";

function NavRow({ item, badge, collapsed }: { item: NavItem; badge?: number; collapsed: boolean }) {
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const active = pathname.startsWith(item.to) || (item.activeAlso ?? []).some((p) => pathname.startsWith(p));
  const Icon = item.icon;
  // Shared-layout pill/marker slide smoothly between items on navigation (§16); the
  // transition collapses to 0 under prefers-reduced-motion.
  const slide = { duration: reduce ? 0 : 0.24, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={cn(
        // §6.1: smooth (sliding) active pill + thin side marker; long labels WRAP rather
        // than truncate (min-height grows), so every nav label stays fully visible.
        "group relative mx-3 flex min-h-10 items-center gap-2.5 rounded-lg py-1.5 text-[13px] font-medium transition-colors duration-fast ease-standard",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "text-white" : "text-white/75 hover:translate-x-0.5 hover:bg-white/10 hover:text-white",
      )}
    >
      {/* Sliding active pill (§16) — one shared element that animates between items. */}
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          transition={slide}
          className="absolute inset-0 z-0 rounded-lg bg-primary shadow-card"
        />
      )}
      {/* Side marker rides with the pill (hidden on the icon rail). */}
      {active && !collapsed && (
        <motion.span
          layoutId="nav-active-marker"
          transition={slide}
          className="absolute -left-3 top-1/2 z-[1] h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
        />
      )}
      <Icon size={18} strokeWidth={active ? 2.25 : 2} className="relative z-[1] shrink-0" />
      {!collapsed && <span className="relative z-[1] flex-1 whitespace-normal leading-tight">{item.label}</span>}
      {badge != null && badge > 0 && (
        collapsed ? (
          <span className="absolute right-2 top-1 z-[1] h-2 w-2 rounded-full bg-danger" />
        ) : (
          <span className="relative z-[1] flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
            {badge}
          </span>
        )
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { persona } = usePersona();
  const { entityId } = useAudience();
  const { pathname } = useLocation();
  const { collapsed, toggle: toggleCollapsed } = useSidebar();
  const isDghr = persona.type === "dghr";
  const nav = isDghr ? DGHR_NAV : ENTITY_NAV;
  // Below lg (iPad portrait / narrow) the sidebar is an off-canvas drawer toggled from the header;
  // at lg+ (iPad landscape and up) it sits inline and can collapse to an icon rail. Closes itself on
  // navigation. The drawer always shows full labels regardless of the lg+ collapsed choice.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = () => setOpen((o) => !o);
    window.addEventListener("toggle-sidebar", t);
    return () => window.removeEventListener("toggle-sidebar", t);
  }, []);
  useEffect(() => { setOpen(false); }, [pathname]);

  const { data: badges } = useQuery({
    queryKey: ["entity-badges", entityId],
    queryFn: () => api.entityBadges(entityId!),
    enabled: !isDghr && entityId != null,
    refetchInterval: 4000,
  });

  // Only the lg+ inline rail is narrowed; the mobile drawer stays full width.
  const railCollapsed = collapsed;
  let lastGroup: string | undefined;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />
      )}
      <aside
        className={cn(
          // Slightly wider so full nav labels no longer truncate (§6.1); `bg-sidebar`
          // sits a shade above the darkest page navy so the rail separates in dark mode.
          "fixed inset-y-0 left-0 z-50 flex w-[256px] shrink-0 flex-col border-r border-white/5 bg-sidebar shadow-xl transition-[transform,width] duration-nav ease-standard lg:static lg:z-auto lg:h-full lg:shadow-none",
          railCollapsed ? "lg:w-[72px]" : "lg:w-[256px]",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Crest + wordmark */}
        <div className={cn("flex items-center gap-2.5 pb-4 pt-5", railCollapsed ? "justify-center px-0 lg:px-0" : "px-5")}>
          <Crest size={34} />
          {!railCollapsed && (
            <div className="leading-tight">
              <div className="text-[11px] font-semibold tracking-wide text-white/70">حكومة دبي</div>
              <div className="text-[11px] font-bold tracking-wide text-white">DUBAI GOVERNMENT</div>
            </div>
          )}
        </div>

        {/* Portal label block — hidden when collapsed */}
        {!railCollapsed && (
          <div className="mx-5 mb-3 border-t border-white/10 pt-3">
            <div className="text-sm font-bold text-white">{persona.portalTitle}</div>
            <div className="text-xs text-white/60">{persona.portalSubtitle}</div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto py-2">
          {nav.map((item) => {
            const showGroup = item.group && item.group !== lastGroup;
            lastGroup = item.group ?? lastGroup;
            return (
              <div key={item.to}>
                {showGroup && (railCollapsed
                  ? <div className="mx-3 my-2 border-t border-white/10" />
                  : <div className="mb-1 mt-3 px-6 text-[10px] font-semibold uppercase tracking-wider text-white/40">{item.group}</div>
                )}
                <NavRow
                  item={item}
                  collapsed={railCollapsed}
                  badge={item.badgeKey === "open_cases" ? badges?.open_cases : undefined}
                />
              </div>
            );
          })}
        </nav>

        {/* Collapse toggle — lg+ only (mobile uses the drawer) */}
        <button
          onClick={toggleCollapsed}
          className={cn(
            "mx-3 mb-1 hidden h-9 items-center gap-2 rounded-lg text-xs font-medium text-white/55 transition-colors duration-fast hover:bg-white/10 hover:text-white/90 lg:flex",
            railCollapsed ? "justify-center px-0" : "px-3",
          )}
          title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {railCollapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> <span>Collapse</span></>}
        </button>

        {/* Bottom user card — quieter surface (§6.1: reduce profile visual weight). */}
        <div className={cn("m-3 flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/5 py-2", railCollapsed ? "justify-center px-0" : "px-2.5")}>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success text-[11px] font-bold text-white">
            {persona.userName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </span>
          {!railCollapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-xs font-semibold text-white/90">{persona.userName}</div>
              <div className="truncate text-[11px] text-white/55">{persona.userRole}</div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
