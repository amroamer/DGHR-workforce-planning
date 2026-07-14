import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Rocket, Cog, FileText, FolderOpen, AlertTriangle, ShieldCheck, Download, Save, Send,
  Plus, UploadCloud, Sparkles, MoreHorizontal, Link2, Zap, Target, ArrowUpRight, Scale, TrendingUp, Users2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";

const CAT_ICON: Record<string, React.ReactNode> = {
  "New Services": <Zap size={16} />, "Strategic Initiatives": <Target size={16} />,
  "Digital Transformation": <ArrowUpRight size={16} />, "AI & Automation": <Cog size={16} />,
  "Regulatory Changes": <Scale size={16} />, "Population / Demand Growth": <Users2 size={16} />,
  "Productivity Improvements": <TrendingUp size={16} />,
};
const HORIZONS = ["0–2 Years", "1–3 Years", "1–5 Years"];
const IMPACTS = ["High", "Medium", "Low"];

export function DemandDrivers() {
  const { entityId } = useAudience();
  const [leftTab, setLeftTab] = useState<"drivers" | "map">("drivers");
  const [rightTab, setRightTab] = useState<"evidence" | "ai" | "linked">("evidence");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const { data } = useQuery({ queryKey: ["drivers", entityId], queryFn: () => api.drivers(entityId!), enabled: entityId != null });
  const k = data?.kpis;
  const empty = (data?.drivers.length ?? 0) === 0;

  const mapCell = (impact: string, horizon: string) =>
    (data?.drivers ?? []).filter((d) => d.impact === impact && HORIZONS.some((h) => d.horizon.includes(h.split("–")[0]) && h === horizon));

  return (
    <>
      <PageHeader title="Future Demand Drivers & Evidence" subtitle="Capture future demand drivers and link supporting evidence to strengthen forecasting assumptions."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => toast.success("Exported.")}><Download size={15} /> Export</Button>
            <Button variant="secondary" size="sm" onClick={() => toast.success("Draft saved.")}><Save size={15} /> Save Draft</Button>
            <Button size="sm" onClick={() => toast.message("Submit is wired in Phase 3.")}><Send size={15} /> Submit Package</Button>
          </>
        } />
      <PageBody>
        <div className="mb-3 text-xs text-text3">Entities › {data?.entity.name} › Future Demand Drivers &amp; Evidence</div>
        <div className="grid grid-cols-6 gap-4">
          <KpiCard tone="blue" icon={<Rocket size={20} />} value={k?.strategic_initiatives} label="Strategic Initiatives" sublabel="Submitted" />
          <KpiCard tone="green" icon={<Cog size={20} />} value={k?.automation_impacts} label="Automation Impacts" sublabel="Captured" />
          <KpiCard tone="orange" icon={<FileText size={20} />} value={k?.policy_changes} label="Policy Changes" sublabel="Logged" />
          <KpiCard tone="purple" icon={<FolderOpen size={20} />} value={k?.evidence_documents} label="Evidence Documents" sublabel="Uploaded" />
          <KpiCard tone="red" icon={<AlertTriangle size={20} />} value={k?.outstanding_gaps} label="Outstanding Evidence Gaps" sublabel="Require attention" />
          <KpiCard tone="blue" ring={k?.evidence_coverage ?? 0} label="Evidence Coverage" sublabel="Good" />
        </div>

        {empty ? (
          <Card className="mt-4"><EmptyState icon={<Target size={26} />} title="No demand drivers yet" description="Add future demand drivers and link evidence to begin. This entity has not started its Future Demand Drivers submission." /></Card>
        ) : (
          <div className="mt-4 grid grid-cols-12 gap-4">
            {/* left: drivers / map */}
            <Card className="col-span-5">
              <div className="flex gap-4 border-b border-border px-5 pt-4">
                {(["drivers", "map"] as const).map((t) => (
                  <button key={t} onClick={() => setLeftTab(t)} className={`pb-2.5 text-sm font-semibold ${leftTab === t ? "border-b-2 border-primary text-primary" : "text-text3"}`}>
                    {t === "drivers" ? "Future Demand Drivers" : "Driver Map (Impact View)"}
                  </button>
                ))}
              </div>
              {leftTab === "drivers" ? (
                <div className="p-3">
                  <div className="flex items-center justify-between px-2 pb-2"><span className="text-sm font-semibold text-text1">Future Drivers Workspace</span><Button variant="secondary" size="sm" onClick={() => toast.message("Available in the full release")}><Plus size={13} /> Add Driver</Button></div>
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-[#EEF2F7] text-[11px] uppercase text-text3"><th className="px-2 py-2 font-semibold">Category</th><th className="px-2 py-2 font-semibold">Description</th><th className="px-2 py-2 font-semibold">Impact</th><th className="px-2 py-2 font-semibold">Horizon</th><th className="px-2 py-2 font-semibold">Status</th></tr></thead>
                    <tbody>
                      {(data?.drivers ?? []).map((d) => (
                        <tr key={d.id} className="border-b border-[#EEF2F7]">
                          <td className="px-2 py-2.5"><span className="flex items-center gap-1.5 font-medium text-text1">{CAT_ICON[d.category] ?? <Target size={14} />} {d.category}</span></td>
                          <td className="px-2 py-2.5 text-xs text-text2">{d.description}</td>
                          <td className="px-2 py-2.5"><StatusBadge value={d.impact.toLowerCase()} label={d.impact} /></td>
                          <td className="px-2 py-2.5 text-text2">{d.horizon}</td>
                          <td className="px-2 py-2.5"><StatusBadge value={d.status === "captured" ? "complete" : "in_progress"} label={d.status === "captured" ? "Captured" : "In Progress"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-2 pt-2 text-xs text-text3">Showing 1 to {data?.drivers.length} of {data?.drivers.length} drivers</div>
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 text-xs">
                    <div /><div className="text-center font-semibold text-text3">0–2 Years</div><div className="text-center font-semibold text-text3">1–3 Years</div><div className="text-center font-semibold text-text3">1–5 Years</div>
                    {IMPACTS.map((imp) => (
                      <>
                        <div key={imp} className="flex items-center font-semibold text-text3">{imp}</div>
                        {HORIZONS.map((h) => (
                          <div key={imp + h} className="min-h-[60px] rounded-lg border border-border p-1.5">
                            {mapCell(imp, h).map((d) => (
                              <div key={d.id} className="mb-1 rounded bg-primary/10 px-1.5 py-1 text-[10px] font-semibold text-primary">{d.category}</div>
                            ))}
                          </div>
                        ))}
                      </>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* right: evidence / ai / linked */}
            <Card className="col-span-4">
              <div className="flex gap-4 border-b border-border px-5 pt-4">
                {(["evidence", "ai", "linked"] as const).map((t) => (
                  <button key={t} onClick={() => setRightTab(t)} className={`pb-2.5 text-sm font-semibold ${rightTab === t ? "border-b-2 border-primary text-primary" : "text-text3"}`}>
                    {t === "evidence" ? "Evidence" : t === "ai" ? "AI Summary" : "Linked Sections"}
                  </button>
                ))}
              </div>
              {rightTab === "evidence" && (
                <div className="p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => toast.message("Upload is wired in Phase 4.")}><UploadCloud size={13} /> Upload Evidence</Button>
                    <Button variant="secondary" size="sm" onClick={() => { setRightTab("ai"); }}><Sparkles size={13} /> Run AI Summary</Button>
                  </div>
                  <div className="space-y-1.5">
                    {(data?.evidence ?? []).map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                        <FileText size={16} className="shrink-0 text-danger" />
                        <div className="flex-1 min-w-0"><div className="truncate font-semibold text-text1">{ev.filename}</div><div className="text-text3">{ev.source_org} · {ev.linked_label}</div></div>
                        <StatusBadge value={ev.quality.toLowerCase()} label={ev.quality} />
                        <button className="text-text3 hover:text-text1"><MoreHorizontal size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => toast.message("Available in the full release")} className="mt-2 text-xs font-semibold text-primary hover:underline">View all evidence ({data?.evidence_total}) →</button>
                </div>
              )}
              {rightTab === "ai" && (
                <div className="p-5">
                  {aiSummary ? (
                    <div className="rounded-card border border-teal/30 bg-teal-bg/40 p-4 text-sm text-text1">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-teal"><Sparkles size={13} /> AI Summary</div>
                      {aiSummary}
                      <div className="mt-2 text-[11px] text-text3">Generated by AI · review before submission</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Sparkles size={28} className="mx-auto mb-2 text-teal" />
                      <p className="mb-3 text-sm text-text2">Generate a structured narrative from your drivers and evidence.</p>
                      <Button variant="secondary" size="sm" onClick={() => setAiSummary("AI driver-summary generation is wired in Phase 4 — it will produce a 150–200 word demand outlook, top impact themes, evidence coverage gaps, and suggested next steps.")}><Sparkles size={14} /> Run AI Summary</Button>
                    </div>
                  )}
                </div>
              )}
              {rightTab === "linked" && (
                <div className="p-5 text-sm text-text2">
                  <p className="mb-3">Map each driver to the forecast sections it affects.</p>
                  {(data?.drivers ?? []).slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center justify-between border-b border-[#EEF2F7] py-2"><span className="text-text1">{d.category}</span><Link2 size={14} className="text-text3" /></div>
                  ))}
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => toast.message("Available in the full release")}><Link2 size={14} /> Link to Sections</Button>
                </div>
              )}
            </Card>

            {/* reviewer comments */}
            <Card className="col-span-3 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-text1">Reviewer Comments</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
              <div className="space-y-3">
                {(data?.comments ?? []).map((c, i) => (
                  <div key={i} className="rounded-lg bg-page p-2.5 text-xs">
                    <div className="font-semibold text-text1">{c.author_name}</div>
                    <div className="text-text3">{c.author_role}</div>
                    <div className="mt-1 text-text2">{c.body}</div>
                    {c.related_label && <div className="mt-1.5 inline-block rounded-full bg-white px-2 py-0.5 text-[10px] text-text2">Related to: {c.related_label}</div>}
                    <button onClick={() => toast.message("Reply wired in Phase 3.")} className="mt-1.5 block text-[11px] font-semibold text-primary hover:underline">Reply</button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-card border border-info/30 bg-info-bg/40 p-3 text-sm text-text2">
          <ShieldCheck size={16} className="text-info" />
          Ensure all high-impact drivers have supporting evidence and are linked to relevant forecast sections before submission.
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => toast.message("Available in the full release")}><Link2 size={14} /> Link to Sections</Button>
          <Button size="sm" onClick={() => toast.message("Submit is wired in Phase 3.")}><Send size={14} /> Submit Package</Button>
        </div>
      </PageBody>
    </>
  );
}
