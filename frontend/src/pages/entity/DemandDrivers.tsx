import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Rocket, Cog, FileText, FolderOpen, AlertTriangle, ShieldCheck, Save, Send,
  Plus, UploadCloud, Sparkles, Pencil, Link2, Zap, Target, ArrowUpRight, Scale, TrendingUp, Users2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Modal, Field, TextArea, Select } from "@/components/shared/Modal";
import { SubmitGuardModal } from "@/components/shared/SubmitGuardModal";
import { RowMenu } from "@/components/shared/Dropdown";
import { CheckCircle2, Trash2 } from "lucide-react";

const CAT_ICON: Record<string, React.ReactNode> = {
  "New Services": <Zap size={16} />, "Strategic Initiatives": <Target size={16} />,
  "Digital Transformation": <ArrowUpRight size={16} />, "AI & Automation": <Cog size={16} />,
  "Regulatory Changes": <Scale size={16} />, "Population / Demand Growth": <Users2 size={16} />,
  "Productivity Improvements": <TrendingUp size={16} />,
};
const HORIZONS = ["0–2 Years", "1–3 Years", "1–5 Years"];
const IMPACTS = ["High", "Medium", "Low"];
const FORECAST_SECTIONS = ["Workforce Baseline", "Organizational Structure", "Workload & Capacity", "Future Demand", "Budget & Cost"];
type Driver = { id: number; category: string; description: string; impact: string; horizon: string; status: string; linked_sections: string[] };

export function DemandDrivers() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const submit = async () => { if (entityId == null) return; await api.submitPackage(entityId, "future_drivers"); qc.invalidateQueries(); toast.success("Future Demand Drivers package submitted to DGHR."); };
  const saveDraft = async () => { if (entityId == null) return; await api.saveDraft(entityId, "future_drivers"); qc.invalidateQueries(); toast.success("Draft saved."); };
  const [leftTab, setLeftTab] = useState<"drivers" | "map">("drivers");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);   // DD-04: edit an existing driver
  const [guardOpen, setGuardOpen] = useState(false);
  const [addForm, setAddForm] = useState({ category: "Strategic Initiatives", description: "", impact: "Medium", horizon: "1–3 Years" });
  const [addBusy, setAddBusy] = useState(false);
  const closeAdd = () => { setAddOpen(false); setEditId(null); setAddForm({ category: "Strategic Initiatives", description: "", impact: "Medium", horizon: "1–3 Years" }); };
  const openEdit = (d: Driver) => { setEditId(d.id); setAddForm({ category: d.category, description: d.description, impact: d.impact, horizon: d.horizon }); setAddOpen(true); };
  // DD-07: link a driver to the forecast sections it affects (persisted on the driver)
  const [linkDriver, setLinkDriver] = useState<Driver | null>(null);
  const [linkSel, setLinkSel] = useState<string[]>([]);
  const openLink = (d: Driver) => { setLinkDriver(d); setLinkSel(d.linked_sections ?? []); };
  const saveLink = async () => {
    if (entityId == null || !linkDriver) return;
    await api.patchDriver(entityId, linkDriver.id, { linked_sections: linkSel });
    setLinkDriver(null); qc.invalidateQueries(); toast.success("Forecast sections linked.");
  };
  // DD-05: relink / delete evidence
  const [relinkEv, setRelinkEv] = useState<{ id: number; linked_label: string; quality: string } | null>(null);
  const [relinkForm, setRelinkForm] = useState({ linked_label: "", quality: "Medium" });
  const openRelink = (ev: { id: number; linked_label: string; quality: string }) => { setRelinkEv(ev); setRelinkForm({ linked_label: ev.linked_label || FORECAST_SECTIONS[0], quality: ev.quality }); };
  const saveRelink = async () => {
    if (entityId == null || !relinkEv) return;
    await api.patchEvidence(entityId, relinkEv.id, relinkForm);
    setRelinkEv(null); qc.invalidateQueries(); toast.success("Evidence relinked.");
  };
  const delEvidence = async (id: number) => { if (entityId == null || !window.confirm("Delete this evidence document?")) return; await api.deleteEvidence(entityId, id); qc.invalidateQueries(); toast.success("Evidence deleted."); };
  const [reply, setReply] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const addReply = async () => { if (entityId == null || !reply.trim()) return; await api.addComment(entityId, { package_key: "future_drivers", body: reply, related_label: replyTo ?? undefined }); setReply(""); setReplyTo(null); qc.invalidateQueries(); toast.success("Reply posted."); };
  const markCaptured = async (id: number) => { if (entityId == null) return; await api.patchDriver(entityId, id, { status: "captured" }); qc.invalidateQueries(); toast.success("Driver marked captured."); };
  const delDriver = async (id: number) => { if (entityId == null || !window.confirm("Delete this driver?")) return; await api.deleteDriver(entityId, id); qc.invalidateQueries(); toast.success("Driver deleted."); };
  const addDriver = async () => {
    if (entityId == null) return;
    if (!addForm.description.trim()) return toast.error("Driver description is required.");
    setAddBusy(true);
    try {
      if (editId != null) {
        await api.patchDriver(entityId, editId, addForm);
        toast.success("Driver updated.");
      } else {
        await api.addDriver(entityId, addForm);
        toast.success("Driver added.");
      }
      qc.invalidateQueries();
      closeAdd();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setAddBusy(false);
    }
  };
  const [rightTab, setRightTab] = useState<"evidence" | "ai" | "linked">("evidence");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const evRef = useRef<HTMLInputElement>(null);

  const runAiSummary = async () => {
    if (entityId == null) return;
    setRightTab("ai"); setAiLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    try { const res = await api.aiDriverSummary(entityId); setAiSummary(res.summary); }
    finally { setAiLoading(false); }
  };
  const uploadEvidence = async (file: File) => {
    if (entityId == null) return;
    await api.uploadEvidence(entityId, file, "Strategic Initiatives", "High");
    qc.invalidateQueries();
    toast.success(`Uploaded ${file.name}.`);
  };
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
            <Button variant="secondary" size="sm" onClick={saveDraft}><Save size={15} /> Save Draft</Button>
            <Button size="sm" onClick={() => setGuardOpen(true)}><Send size={15} /> Submit Package</Button>
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
          <Card className="mt-4">
            <EmptyState
              icon={<Target size={26} />}
              title="No demand drivers yet"
              description="Add future demand drivers and link evidence to begin. This entity has not started its Future Demand Drivers submission."
              action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Driver</Button>}
            />
          </Card>
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
                  <div className="flex items-center justify-between px-2 pb-2"><span className="text-sm font-semibold text-text1">Future Drivers Workspace</span><Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}><Plus size={13} /> Add Driver</Button></div>
                  <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead><tr className={THEAD_TR}><th className={TH}>Category</th><th className={TH}>Description</th><th className={TH}>Impact</th><th className={TH}>Horizon</th><th className={TH}>Status</th><th /></tr></thead>
                    <tbody>
                      {(data?.drivers ?? []).map((d) => (
                        <tr key={d.id} className={TROW}>
                          <td className={TD}><span className="flex items-center gap-1.5 font-medium text-text1">{CAT_ICON[d.category] ?? <Target size={14} />} {d.category}</span></td>
                          <td className={cn(TD, "text-xs text-text2")}>{d.description}</td>
                          <td className={TD}><StatusBadge value={d.impact.toLowerCase()} label={d.impact} /></td>
                          <td className={cn(TD, "text-text2")}>{d.horizon}</td>
                          <td className={TD}><StatusBadge value={d.status === "captured" ? "complete" : "in_progress"} label={d.status === "captured" ? "Captured" : "In Progress"} /></td>
                          <td className="px-1"><RowMenu label={`Actions for ${d.category}`} items={[
                            { label: "Edit driver", icon: <Pencil size={15} />, onClick: () => openEdit(d) },
                            { label: "Link to sections", icon: <Link2 size={15} />, onClick: () => openLink(d) },
                            { label: "Mark captured", icon: <CheckCircle2 size={15} />, onClick: () => markCaptured(d.id) },
                            { label: "Delete driver", icon: <Trash2 size={15} />, tone: "danger", onClick: () => delDriver(d.id) },
                          ]} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <div className="nums px-2 pt-2 text-xs text-text3">Showing 1 to {data?.drivers.length} of {data?.drivers.length} drivers</div>
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-[70px_1fr_1fr_1fr] gap-2 text-xs">
                    <div /><div className="text-center font-semibold text-text3">0–2 Years</div><div className="text-center font-semibold text-text3">1–3 Years</div><div className="text-center font-semibold text-text3">1–5 Years</div>
                    {IMPACTS.map((imp) => (
                      <>
                        <div key={imp} className="flex items-center font-semibold text-text3">{imp}</div>
                        {HORIZONS.map((h) => (
                          <div key={imp + h} className="min-h-[64px] rounded-lg border border-border bg-surface2/30 p-2">
                            {mapCell(imp, h).map((d) => (
                              <button key={d.id} onClick={() => openEdit(d)} title={`Edit ${d.category}`} className="mb-1 block w-full truncate rounded bg-primary/10 px-1.5 py-1 text-left text-[10px] font-semibold text-primary transition-colors duration-fast hover:bg-primary/20">{d.category}</button>
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
                  <input ref={evRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(f); e.target.value = ""; }} />
                  <div className="mb-3 flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => evRef.current?.click()}><UploadCloud size={13} /> Upload Evidence</Button>
                    <Button variant="secondary" size="sm" onClick={runAiSummary}><Sparkles size={13} /> Run AI Summary</Button>
                  </div>
                  <div className="space-y-2">
                    {(data?.evidence ?? []).map((ev) => (
                      <div key={ev.id} className="flex items-center gap-2 rounded-lg bg-surface2/50 p-2.5 text-xs transition-colors duration-fast hover:bg-surface2">
                        <FileText size={16} className="shrink-0 text-danger" />
                        <div className="flex-1 min-w-0"><div className="truncate font-semibold text-text1">{ev.filename}</div><div className="text-text3">{ev.source_org} · {ev.linked_label}</div></div>
                        <StatusBadge value={ev.quality.toLowerCase()} label={ev.quality} />
                        <RowMenu label={`Actions for ${ev.filename}`} items={[
                          { label: "Relink / edit", icon: <Link2 size={15} />, onClick: () => openRelink(ev) },
                          { label: "Delete evidence", icon: <Trash2 size={15} />, tone: "danger", onClick: () => delEvidence(ev.id) },
                        ]} />
                      </div>
                    ))}
                  </div>
                  <button onClick={() => toast.message("Available in the full release")} className="mt-2 text-xs font-semibold text-primary hover:underline">View all evidence ({data?.evidence_total}) →</button>
                </div>
              )}
              {rightTab === "ai" && (
                <div className="p-5">
                  {aiLoading ? (
                    <div className="flex flex-col items-center py-8 text-teal"><Sparkles size={26} className="mb-2 animate-pulse" /><div className="text-sm font-semibold">✨ Analyzing drivers &amp; evidence…</div></div>
                  ) : aiSummary ? (
                    <div className="rounded-card border border-teal/30 bg-teal-bg/40 p-4 text-sm leading-relaxed text-text1">
                      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-teal"><Sparkles size={13} /> AI Summary</div>
                      {aiSummary}
                      <div className="mt-2 text-[11px] text-text3">Generated by AI · review before submission</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Sparkles size={28} className="mx-auto mb-2 text-teal" />
                      <p className="mb-3 text-sm text-text2">Generate a structured narrative from your drivers and evidence.</p>
                      <Button variant="secondary" size="sm" onClick={runAiSummary}><Sparkles size={14} /> Run AI Summary</Button>
                    </div>
                  )}
                </div>
              )}
              {rightTab === "linked" && (
                <div className="p-5 text-sm text-text2">
                  <p className="mb-3">Map each driver to the forecast sections it affects. Click a driver to link.</p>
                  {(data?.drivers ?? []).map((d) => (
                    <button key={d.id} onClick={() => openLink(d)} className="flex w-full items-center justify-between gap-2 border-b border-border py-2 text-left hover:bg-page/60">
                      <div className="min-w-0">
                        <span className="block truncate text-text1">{d.category}</span>
                        {d.linked_sections.length > 0
                          ? <span className="mt-0.5 flex flex-wrap gap-1">{d.linked_sections.map((s) => <span key={s} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{s}</span>)}</span>
                          : <span className="text-[11px] text-text3">No sections linked</span>}
                      </div>
                      <Link2 size={14} className="shrink-0 text-text3" />
                    </button>
                  ))}
                  {(data?.drivers.length ?? 0) === 0 && <p className="text-text3">Add drivers first, then link them to forecast sections.</p>}
                </div>
              )}
            </Card>

            {/* reviewer comments */}
            <Card className="col-span-3 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-text1">Reviewer Comments</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
              <div className="space-y-3">
                {(data?.comments ?? []).map((c, i) => (
                  <div key={i} className="rounded-lg bg-surface2 p-2.5 text-xs">
                    <div className="font-semibold text-text1">{c.author_name}</div>
                    <div className="text-text3">{c.author_role}</div>
                    <div className="mt-1 text-text2">{c.body}</div>
                    {c.related_label && <div className="mt-1.5 inline-block rounded-full bg-inset px-2 py-0.5 text-[10px] text-text2">Related to: {c.related_label}</div>}
                    <button onClick={() => setReplyTo(c.related_label ?? c.author_name)} className="mt-1.5 block text-[11px] font-semibold text-primary hover:underline">Reply</button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReply()} placeholder={replyTo ? `Reply to ${replyTo}…` : "Add a reply…"} className="h-8 min-w-0 flex-1 rounded-btn border border-border bg-card px-2 text-xs text-text1 outline-none transition-colors duration-fast focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <Button size="sm" className="shrink-0" onClick={addReply} disabled={!reply.trim()}>Reply</Button>
              </div>
            </Card>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3 rounded-card border border-info/30 bg-info-bg/40 p-3 text-sm text-text2">
          <ShieldCheck size={16} className="text-info" />
          Ensure all high-impact drivers have supporting evidence and are linked to relevant forecast sections before submission.
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => { setRightTab("linked"); if (!empty) toast.message("Pick a driver in the Linked Sections panel to map it."); }}><Link2 size={14} /> Link to Sections</Button>
          <Button size="sm" onClick={() => setGuardOpen(true)}><Send size={14} /> Submit Package</Button>
        </div>
      </PageBody>

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title={editId != null ? "Edit Demand Driver" : "Add Demand Driver"}
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd} disabled={addBusy}>Cancel</Button>
            <Button onClick={addDriver} disabled={addBusy}>{addBusy ? "Saving…" : editId != null ? "Save Changes" : "Add Driver"}</Button>
          </>
        }
      >
        <Field label="Category">
          <Select value={addForm.category} onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}>
            {Object.keys(CAT_ICON).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Description">
          <TextArea rows={2} value={addForm.description} onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))} placeholder="Describe the future demand driver…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Impact">
            <Select value={addForm.impact} onChange={(e) => setAddForm((f) => ({ ...f, impact: e.target.value }))}>
              {IMPACTS.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </Field>
          <Field label="Horizon">
            <Select value={addForm.horizon} onChange={(e) => setAddForm((f) => ({ ...f, horizon: e.target.value }))}>
              {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
            </Select>
          </Field>
        </div>
      </Modal>

      {/* DD-07: link a driver to forecast sections */}
      <Modal
        open={linkDriver != null}
        onClose={() => setLinkDriver(null)}
        title="Link to Forecast Sections"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLinkDriver(null)}>Cancel</Button>
            <Button onClick={saveLink}>Save Links</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-text2">Select the forecast sections that <span className="font-semibold text-text1">{linkDriver?.category}</span> affects.</p>
        <div className="space-y-1.5">
          {FORECAST_SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 rounded-btn border border-border px-3 py-2 text-sm text-text1">
              <input type="checkbox" aria-label={s} checked={linkSel.includes(s)}
                onChange={(e) => setLinkSel((cur) => e.target.checked ? [...cur, s] : cur.filter((x) => x !== s))} />
              {s}
            </label>
          ))}
        </div>
      </Modal>

      {/* DD-05: relink / edit evidence */}
      <Modal
        open={relinkEv != null}
        onClose={() => setRelinkEv(null)}
        title="Relink Evidence"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRelinkEv(null)}>Cancel</Button>
            <Button onClick={saveRelink}>Save</Button>
          </>
        }
      >
        <Field label="Linked forecast section">
          <Select value={relinkForm.linked_label} onChange={(e) => setRelinkForm((f) => ({ ...f, linked_label: e.target.value }))}>
            {FORECAST_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Quality">
          <Select value={relinkForm.quality} onChange={(e) => setRelinkForm((f) => ({ ...f, quality: e.target.value }))}>
            {IMPACTS.map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
        </Field>
      </Modal>

      <SubmitGuardModal
        open={guardOpen}
        onClose={() => setGuardOpen(false)}
        packageName="Future Demand Drivers"
        issues={(k?.outstanding_gaps ?? 0) > 0 ? [`${k?.outstanding_gaps} outstanding evidence gap${(k?.outstanding_gaps ?? 0) > 1 ? "s" : ""}`] : []}
        onConfirm={submit}
      />
    </>
  );
}
