import { useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** AI-written executive summary for a report page. Generated on demand, never auto — the reader
 *  asks for the narrative, the numbers are already on the page. Same live-model-or-offline
 *  contract as Smart Assist: the `source` badge always says which one produced the text. */
export function NarrativeCard({ title = "Executive summary", hint, generate }: {
  title?: string;
  hint?: string;
  generate: () => Promise<{ narrative: string; source: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ narrative: string; source: string } | null>(null);

  const run = async () => {
    setBusy(true);
    try {
      const r = await generate();
      if (!r.narrative) { toast.message("Nothing to summarize yet."); setResult(null); return; }
      setResult(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not draft the summary."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-4 border-dashed border-teal/50 bg-teal-bg/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-teal">
          <Sparkles size={13} /> {title}
        </div>
        {result && (
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-semibold text-text3">
            {result.source === "ai" ? "live model" : "offline"}
          </span>
        )}
        <div className="ml-auto">
          <Button variant="secondary" size="sm" onClick={run} disabled={busy}>
            {result ? <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> : <Sparkles size={14} />}
            {busy ? "Drafting…" : result ? "Regenerate" : "Draft the summary"}
          </Button>
        </div>
      </div>
      {result
        ? <p className="mt-2 text-sm leading-relaxed text-text2">{result.narrative}</p>
        : <p className="mt-1.5 text-xs text-text3">{hint ?? "A written read of the figures on this page — coverage, the gap, where it concentrates, and what to do next."}</p>}
    </Card>
  );
}
