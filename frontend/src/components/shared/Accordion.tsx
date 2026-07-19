// S4/S8: the preferred layout for the supplied Method & Typeset Library and Knowledge Center
// content — an accordion / knowledge-sheet. Reusable and content-agnostic: drop the supplied
// sections in as { title, body } and it renders a clean expand/collapse knowledge post.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";

export interface AccordionSection { title: string; body: React.ReactNode; defaultOpen?: boolean }

export function Accordion({ sections }: { sections: AccordionSection[] }) {
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(sections.map((s, i) => (s.defaultOpen ? i : -1)).filter((i) => i >= 0)),
  );
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  return (
    <Card className="min-w-0 p-0">
      {sections.map((s, i) => {
        const isOpen = open.has(i);
        return (
          <div key={i} className="border-b border-border last:border-0">
            <button
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-page/60"
            >
              <span className="text-sm font-semibold text-text1">{s.title}</span>
              <ChevronDown size={16} className={`shrink-0 text-text3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && <div className="px-5 pb-4 text-sm leading-relaxed text-text2">{s.body}</div>}
          </div>
        );
      })}
    </Card>
  );
}
