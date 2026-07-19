import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import { usePersona } from "@/stores/persona";

/** Resolve current persona → { audience, entityId } for scoped queries. */
export function useAudience(): { audience: "dghr" | "entity"; entityId?: number } {
  const { persona } = usePersona();
  const { data } = useQuery({
    queryKey: ["persona-entities"],
    queryFn: api.personaEntities,
    staleTime: Infinity,
  });
  if (persona.type === "dghr") return { audience: "dghr" };
  // Dynamically-picked entities carry their id directly; DM/DHA presets resolve via the map.
  const entityId = persona.entityId ?? (persona.code ? data?.[persona.code]?.id : undefined);
  return { audience: "entity", entityId };
}

/**
 * Live cross-portal sync (SPEC §11). Polls /notifications/poll every 4s, diffs new
 * notifications since the last cursor → sonner toasts + invalidates all queries so KPIs,
 * tracker, donut, badges and threads update within ≤5s. Mounted once in AppShell.
 */
export function useLiveNotifications() {
  const { audience, entityId } = useAudience();
  const qc = useQueryClient();
  const sinceRef = useRef<string | null>(null);
  const scopeRef = useRef<string>("");

  const scope = `${audience}:${entityId ?? ""}`;
  // reset baseline when persona/scope changes so we don't replay the other side's history
  if (scopeRef.current !== scope) {
    scopeRef.current = scope;
    sinceRef.current = null;
  }

  const { data } = useQuery({
    queryKey: ["notif-poll", scope],
    queryFn: () => api.pollNotifications(audience, entityId, sinceRef.current ?? undefined),
    refetchInterval: 4000,
    enabled: audience === "dghr" || entityId != null,
  });

  useEffect(() => {
    if (!data) return;
    const first = sinceRef.current === null;
    sinceRef.current = data.server_time; // advance cursor first (prevents duplicate toasts)
    if (first || data.new.length === 0) return;

    for (const n of data.new) {
      const opts = { description: n.body } as const;
      if (n.title.toLowerCase().includes("approved")) toast.success(n.title, opts);
      else if (n.kind === "clarification") toast.warning(n.title, opts);
      else toast.info(n.title, opts);
    }
    qc.invalidateQueries();
  }, [data, qc]);
}
