import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { relativeTime } from "@/lib/utils";

// NotificationBell (SPEC §4.2): red count badge, dropdown, "mark all read".
export function NotificationBell() {
  const { audience, entityId } = useAudience();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["notifications", audience, entityId],
    queryFn: () => api.notifications(audience, entityId),
    refetchInterval: 4000,
    enabled: audience === "dghr" || entityId != null,
  });

  const unread = data?.unread ?? 0;

  const markAll = async () => {
    await api.markNotificationsRead({ audience, entity_id: entityId ?? null });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-text2 hover:bg-page"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-card border border-border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-semibold text-text1">Notifications</span>
              <button onClick={markAll} className="text-xs font-semibold text-primary hover:underline">
                Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(data?.items ?? []).length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text3">No notifications</div>
              ) : (
                (data?.items ?? []).map((n) => (
                  <div
                    key={n.id}
                    className="flex gap-2 border-b border-[#EEF2F7] px-4 py-3 last:border-0"
                  >
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className={n.read ? "opacity-70" : ""}>
                      <div className="text-sm font-semibold text-text1">{n.title}</div>
                      <div className="text-xs text-text2">{n.body}</div>
                      <div className="mt-0.5 text-[11px] text-text3">{relativeTime(n.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
