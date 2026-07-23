import { useState } from "react";
import { createPortal } from "react-dom";
import { Calculator } from "lucide-react";
import { CalculationDrawer } from "./CalculationDrawer";
import type { TraceKind } from "@/lib/planning";
import { cn } from "@/lib/utils";

// Wraps any calculated figure with a "View calculation" affordance.
//
// The rule this encodes: if a number was calculated, the reader can always get to how. It is the
// same component on a driver row, a department total, an entity roll-up and the government headline,
// so "can I see the working?" has one answer everywhere rather than depending on which screen you
// happen to be standing on.
//
// The trigger is a real <button> with an aria-label naming the figure, so the affordance is reachable
// by keyboard and announced properly — a visual-only hover hint would put the audit trail out of
// reach of anyone not using a mouse.

export function TraceableValue({
  kind,
  refId,
  children,
  label,
  scenario = "base",
  className,
  iconOnly = false,
}: {
  kind: TraceKind;
  refId: number;
  children: React.ReactNode;
  /** Names the figure in the button's accessible label, e.g. "Required FTE for Permits". */
  label: string;
  scenario?: string;
  className?: string;
  /** Render just the icon (for dense table cells where the value is already a link). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation(); // never trigger the row/card the figure sits inside
          setOpen(true);
        }}
        aria-label={`View calculation for ${label}`}
        title={`View calculation: ${label}`}
        className={cn(
          "group inline-flex items-center gap-1 rounded outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          className,
        )}
      >
        {!iconOnly && children}
        <Calculator
          size={13}
          className="shrink-0 text-text3 opacity-60 transition-opacity group-hover:opacity-100"
        />
      </button>
      {/* Portalled to <body> on purpose. This component lives inside whatever cell holds the figure —
          typically `<td class="text-right tabular-nums font-semibold">`. Because `position: fixed`
          does not stop CSS INHERITANCE, an inline drawer inherited text-align from that cell and
          rendered the entire panel right-aligned. Escaping the DOM subtree fixes that whole class of
          bug (alignment, font, colour) rather than patching this one instance. */}
      {open &&
        createPortal(
          <CalculationDrawer
            open={open}
            onClose={() => setOpen(false)}
            kind={kind}
            refId={refId}
            scenario={scenario}
          />,
          document.body,
        )}
    </>
  );
}
