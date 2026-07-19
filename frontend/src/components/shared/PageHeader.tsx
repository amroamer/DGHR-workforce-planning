import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, RefreshCw, Calendar, Menu } from "lucide-react";
import { api } from "@/lib/api";
import { NotificationBell } from "./NotificationBell";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { SkylineWatermark } from "./Brand";

function formatUpdated(iso?: string): string {
  if (!iso) return "Today, 10:30 AM";
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `Today, ${time}`;
}

// Page header band (SPEC §4.2): title + subtitle, skyline watermark, search,
// NotificationBell, PersonaSwitcher, "Last updated" + refresh.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["last-updated"],
    queryFn: api.lastUpdated,
    refetchInterval: 4000,
  });

  const refresh = () => {
    qc.invalidateQueries();
  };

  return (
    <div
      className="relative z-30 border-b border-border px-4 pb-4 pt-4 sm:px-7 sm:pb-5 sm:pt-6"
      style={{ background: "var(--header-bg)" }}
    >
      {/* Skyline is clipped only on its own wrapper, so header pop-overs are NOT cut off.
          z-30 on the header keeps the persona/bell dropdowns above the page body. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[46%] overflow-hidden">
        <SkylineWatermark className="h-full w-full" />
      </div>
      <div className="mx-auto max-w-[1440px]">
      <div className="relative flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex min-w-0 items-start gap-2">
          <button
            onClick={() => window.dispatchEvent(new Event("toggle-sidebar"))}
            className="-ml-1 mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text2 hover:bg-black/5 dark:hover:bg-white/10 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight text-text1 sm:text-[28px]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-text2">{subtitle}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={() => window.dispatchEvent(new Event("open-command-palette"))} className="flex h-9 w-9 items-center justify-center rounded-full text-text2 hover:bg-black/5 dark:hover:bg-white/10" aria-label="Search">
              <Search size={18} />
            </button>
            <NotificationBell />
            <PersonaSwitcher />
          </div>
          <div className="flex items-center gap-2 text-xs text-text3">
            <Calendar size={14} />
            <span>Last updated: {formatUpdated(data?.last_updated)}</span>
            <button
              onClick={refresh}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text2 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
              aria-label="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>
      </div>
      {actions && <div className="relative mt-4 flex items-center justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}
