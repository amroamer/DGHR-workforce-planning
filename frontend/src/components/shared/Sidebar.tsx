import { NavLink, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { usePersona } from "@/stores/persona";
import { useAudience } from "@/lib/hooks";
import { api } from "@/lib/api";
import { DGHR_NAV, ENTITY_NAV, type NavItem } from "./nav";
import { Crest } from "./Brand";

function NavRow({ item, badge }: { item: NavItem; badge?: number }) {
  const { pathname } = useLocation();
  const active = pathname.startsWith(item.to) || (item.activeAlso ?? []).some((p) => pathname.startsWith(p));
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={cn(
        "mx-3 flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-primary text-white" : "text-white/80 hover:bg-navy-800",
      )}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

export function Sidebar() {
  const { persona } = usePersona();
  const { entityId } = useAudience();
  const isDghr = persona.type === "dghr";
  const nav = isDghr ? DGHR_NAV : ENTITY_NAV;

  const { data: badges } = useQuery({
    queryKey: ["entity-badges", entityId],
    queryFn: () => api.entityBadges(entityId!),
    enabled: !isDghr && entityId != null,
    refetchInterval: 4000,
  });

  return (
    <aside className="flex h-full w-[232px] shrink-0 flex-col bg-navy-900">
      {/* Crest + wordmark */}
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <Crest size={34} />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold tracking-wide text-white/70">حكومة دبي</div>
          <div className="text-[11px] font-bold tracking-wide text-white">DUBAI GOVERNMENT</div>
        </div>
      </div>

      {/* Portal label block */}
      <div className="mx-5 mb-3 border-t border-white/10 pt-3">
        <div className="text-sm font-bold text-white">{persona.portalTitle}</div>
        <div className="text-xs text-white/60">{persona.portalSubtitle}</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto py-2">
        {nav.map((item) => (
          <NavRow
            key={item.to}
            item={item}
            badge={item.badgeKey === "open_cases" ? badges?.open_cases : undefined}
          />
        ))}
      </nav>

      {/* Bottom user card */}
      <div className="m-3 flex items-center gap-2.5 rounded-lg bg-navy-800 px-3 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success text-[11px] font-bold text-white">
          {persona.userName.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-xs font-semibold text-white">{persona.userName}</div>
          <div className="truncate text-[11px] text-white/60">{persona.userRole}</div>
        </div>
      </div>
    </aside>
  );
}
