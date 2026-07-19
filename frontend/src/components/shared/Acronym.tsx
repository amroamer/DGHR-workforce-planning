// G5 (18072026 change requests): never show a bare acronym with no expansion available.
// <Acronym short="DGHR" /> renders the acronym with a dotted underline + native tooltip carrying
// the full expansion. Expansions follow APPLICATION_CONTEXT vocabulary (the source of truth).
import type { ReactNode } from "react";

// Canonical expansions. Keep additions consistent with APPLICATION_CONTEXT.md.
export const ACRONYMS: Record<string, string> = {
  DGHR: "Dubai Government Human Resources",
  DM: "Dubai Municipality",
  DHA: "Dubai Health Authority",
  CDA: "Community Development Authority",
  GDRFA: "General Directorate of Residency and Foreigners Affairs",
  MHRSD: "Ministry of Human Resources and Social Development",
  FTE: "Full-Time Equivalent",
  HR: "Human Resources",
  KPI: "Key Performance Indicator",
  SLA: "Service Level Agreement",
};

export function expandAcronym(short: string): string | undefined {
  return ACRONYMS[short.toUpperCase()];
}

export function Acronym({ short, full, className }: { short: ReactNode; full?: string; className?: string }) {
  const key = typeof short === "string" ? short : "";
  const expansion = full ?? (key ? ACRONYMS[key.toUpperCase()] : undefined);
  if (!expansion) return <span className={className}>{short}</span>;
  return (
    <abbr
      title={expansion}
      className={`cursor-help border-b border-dotted border-text3/60 no-underline ${className ?? ""}`}
    >
      {short}
    </abbr>
  );
}
