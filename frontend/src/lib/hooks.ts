import { useQuery } from "@tanstack/react-query";
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
  const entityId = persona.code ? data?.[persona.code]?.id : undefined;
  return { audience: "entity", entityId };
}
