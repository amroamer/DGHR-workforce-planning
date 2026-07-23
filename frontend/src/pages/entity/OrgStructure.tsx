import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building, Network, Boxes, AlertTriangle, ShieldCheck, ChevronRight, ChevronDown,
  Upload, Download, CheckCircle2, Save, Send, Plus, Network as TreeIcon, FolderTree,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field";
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { PaginationFooter } from "@/components/shared/DataTable";
import { Modal, Field, TextInput } from "@/components/shared/Modal";
import { SubmitGuardModal } from "@/components/shared/SubmitGuardModal";
import { RowMenu } from "@/components/shared/Dropdown";
import { EyeOff, Trash2 } from "lucide-react";

const DOT: Record<string, string> = { mapped: "rgb(var(--success))", unmapped: "rgb(var(--danger))", partial: "rgb(var(--warning))", not_in_scope: "rgb(var(--text-3))" };
const Dot = ({ s }: { s: string }) => <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DOT[s] ?? "rgb(var(--text-3))" }} />;

export function OrgStructure() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async () => { if (entityId == null) return; await api.submitPackage(entityId, "org_structure"); qc.invalidateQueries(); toast.success("Organization Structure submitted for review."); };
  const saveDraft = async () => { if (entityId == null) return; await api.saveDraft(entityId, "org_structure"); qc.invalidateQueries(); toast.success("Draft saved."); };
  const doImport = async (file: File) => {
    if (entityId == null) return;
    try { const r = await api.importOrg(entityId, file); qc.invalidateQueries(); toast.success(`Imported ${r.imported} sections.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Import failed."); }
  };
  const [addOpen, setAddOpen] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [addForm, setAddForm] = useState({ sector: "", department: "", name: "", employee_count: "" });
  const [addBusy, setAddBusy] = useState(false);
  const closeAdd = () => { setAddOpen(false); setAddForm({ sector: "", department: "", name: "", employee_count: "" }); };
  const [validateOpen, setValidateOpen] = useState(false);
  const [comment, setComment] = useState("");
  const addComment = async () => { if (entityId == null || !comment.trim()) return; await api.addComment(entityId, { package_key: "org_structure", body: comment }); setComment(""); qc.invalidateQueries(); toast.success("Comment added."); };
  const markNotInScope = async (id: number) => { if (entityId == null) return; await api.patchOrgSection(entityId, id, { in_scope: false }); qc.invalidateQueries(); toast.success("Section marked not in scope."); };
  const delSection = async (id: number) => { if (entityId == null || !window.confirm("Delete this section?")) return; await api.deleteOrgSection(entityId, id); qc.invalidateQueries(); toast.success("Section deleted."); };
  const addSection = async () => {
    if (entityId == null) return;
    if (!addForm.name.trim() || !addForm.sector.trim() || !addForm.department.trim())
      return toast.error("Sector, department and section name are required.");
    setAddBusy(true);
    try {
      await api.addOrgSection(entityId, {
        sector: addForm.sector, department: addForm.department, name: addForm.name,
        employee_count: addForm.employee_count ? Number(addForm.employee_count) : undefined,
      });
      qc.invalidateQueries();
      toast.success("Section added.");
      closeAdd();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Add failed.");
    } finally {
      setAddBusy(false);
    }
  };
  const [filters, setFilters] = useState<{ sector?: string; department?: string; status?: string; search?: string; page: number }>({ page: 1 });
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
  const set = (p: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }));

  const { data } = useQuery({
    queryKey: ["org-structure", entityId, filters],
    queryFn: () => api.orgStructure(entityId!, { ...filters, page_size: 8 }),
    enabled: entityId != null,
  });
  const k = data?.kpis;
  const empty = (data?.kpis.sections ?? 0) === 0;

  return (
    <>
      <PageHeader title="Organization Structure Submission" subtitle="Confirm and submit your organization structure down to section level for review." />
      <PageBody>
        <div className="grid grid-cols-6 gap-4">
          {/* Mapping coverage is only measured for SECTIONS (kpis.unmapped / kpis.completeness).
              These two tiles used to assert "100% mapped" from no data at all — beside an
              Unmapped Sections tile that could contradict them. They state their structure instead. */}
          <KpiCard tone="blue" icon={<Building size={20} />} value={k?.sectors} label="Sectors" sublabel="In your structure" />
          <KpiCard tone="green" icon={<Network size={20} />} value={k?.departments} label="Departments" sublabel="Across all sectors" />
          <KpiCard tone="orange" icon={<Boxes size={20} />} value={k?.sections} label="Sections" sublabel={`${k?.completeness ?? 0}% mapped`} />
          <KpiCard tone="red" icon={<AlertTriangle size={20} />} value={k?.unmapped} label="Unmapped Sections" sublabel="View and resolve" />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={`${k?.completeness ?? 0}%`} label="Structure Completeness" sublabel="Target: 100%" />
          <KpiCard tone="blue" ring={k?.completeness ?? 0} label="Structure Ready" sublabel="Almost there! Resolve missing items to submit." />
        </div>

        {empty ? (
          <Card className="mt-4">
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
            <EmptyState
              icon={<FolderTree size={26} />}
              title="No organization structure yet"
              description="Import your structure or add sections to begin. This entity has not started its org-structure submission."
              action={
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Section</Button>
                  <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import Structure</Button>
                  <Button size="sm" variant="secondary" onClick={() => entityId != null && window.open(api.orgTemplateUrl(entityId), "_blank")}><Download size={14} /> Download Template</Button>
                </div>
              }
            />
          </Card>
        ) : (
          <div className="mt-4 grid grid-cols-12 gap-4">
            {/* tree */}
            <Card className="col-span-3 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-text1"><TreeIcon size={16} /> Organization Hierarchy</div>
              <div className="space-y-0.5 text-sm">
                <div className="flex items-center gap-2 py-1 font-semibold text-text1"><Building size={15} className="text-primary" /> {data?.entity.name}</div>
                {(data?.tree ?? []).map((sec) => {
                  const open = openSectors.has(sec.name);
                  return (
                    <div key={sec.name} className="pl-2">
                      <button onClick={() => { setOpenSectors((s) => { const n = new Set(s); n.has(sec.name) ? n.delete(sec.name) : n.add(sec.name); return n; }); set({ sector: sec.name, department: undefined }); }}
                        className="flex w-full items-center gap-1.5 rounded py-1 pl-1 text-left hover:bg-page">
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <Dot s={sec.status} />
                        <span className="flex-1 truncate text-text2">{sec.name}</span>
                      </button>
                      {open && sec.departments.map((d) => (
                        <button key={d.name} onClick={() => set({ sector: sec.name, department: d.name })}
                          className="flex w-full items-center gap-1.5 rounded py-1 pl-7 text-left hover:bg-page">
                          <Dot s={d.status} /><span className="flex-1 truncate text-text3">{d.name}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <div className="mb-1.5 text-[11px] font-semibold uppercase text-text3">Legend</div>
                <div className="grid grid-cols-2 gap-1 text-xs text-text2">
                  <span className="flex items-center gap-1.5"><Dot s="mapped" /> Mapped</span>
                  <span className="flex items-center gap-1.5"><Dot s="unmapped" /> Unmapped</span>
                  <span className="flex items-center gap-1.5"><Dot s="partial" /> Partial</span>
                  <span className="flex items-center gap-1.5"><Dot s="not_in_scope" /> Not in Scope</span>
                </div>
              </div>
            </Card>

            {/* sections table */}
            <Card className="col-span-6">
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
                <h3 className="text-base font-semibold text-text1">Sections ({k?.sections})</h3>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
                  <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import Structure</Button>
                  <Button variant="secondary" size="sm" onClick={() => setAddOpen(true)}><Plus size={14} /> Add Section</Button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-5 py-3">
                <input value={filters.search ?? ""} onChange={(e) => set({ search: e.target.value })} placeholder="Search sections…"
                  className={cn(fieldClass, "flex-1")} />
                <select aria-label="Filter by sector" value={filters.sector ?? ""} onChange={(e) => set({ sector: e.target.value || undefined })} className={cn(fieldClass, "w-auto cursor-pointer select-field")}>
                  <option value="">All Sectors</option>{(data?.sectors ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select aria-label="Filter by status" value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })} className={cn(fieldClass, "w-auto cursor-pointer select-field")}>
                  <option value="">All Statuses</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option><option value="partial">Partial</option><option value="not_in_scope">Not in Scope</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className={cn(THEAD_TR, "border-y")}>
                    <th className={TH}>Sector</th><th className={TH}>Department</th><th className={TH}>Section</th><th className={TH}>Owner</th><th className={TH}>HR Focal</th><th className={TH}>In Scope</th><th className={TH}>Emp.</th><th className={TH}>Status</th><th />
                  </tr></thead>
                  <tbody>
                    {(data?.sections.rows ?? []).map((r) => (
                      <tr key={r.id} className={TROW}>
                        <td className={cn(TD, "text-text3")}>{r.sector.replace(" Sector", "")}</td>
                        <td className={cn(TD, "text-text3")}>{r.department.replace(" Department", "")}</td>
                        <td className={cn(TD, "font-medium")}>{r.name}</td>
                        <td className={TD}>{r.owner_name ? <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[9px] font-bold text-white">{r.owner_initials}</span>{r.owner_name}</span> : <span className="text-danger">-</span>}</td>
                        <td className={cn(TD, "text-text2")}>{r.hr_focal_point ?? <span className="text-danger">-</span>}</td>
                        <td className={cn(TD, "text-text2")}>{r.in_scope ? "Yes" : "No"}</td>
                        <td className={cn(TD, "nums text-text2")}>{r.employee_count ?? "-"}</td>
                        <td className={TD}><StatusBadge value={r.status} /></td>
                        <td className="px-2"><RowMenu label={`Actions for ${r.name}`} items={[
                          { label: "Mark not in scope", icon: <EyeOff size={15} />, onClick: () => markNotInScope(r.id) },
                          { label: "Delete section", icon: <Trash2 size={15} />, tone: "danger", onClick: () => delSection(r.id) },
                        ]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm text-text2">
                <PaginationFooter page={data?.sections.page ?? 1} pageSize={8} total={data?.sections.total ?? 0} onPage={(p) => set({ page: p })} unit="sections" />
              </div>
            </Card>

            {/* right rail */}
            <div className="col-span-3 space-y-4">
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Upload / Import Options</div>
                <div className="rounded-card border border-dashed border-border p-4 text-center text-xs text-text3">
                  <Upload size={20} className="mx-auto mb-1 text-primary" />
                  Drag and drop file here or <span className="text-primary">browse to upload</span>
                  <div className="mt-1">Supported formats: .xlsx, .csv</div>
                </div>
                <Button variant="secondary" size="sm" className="mt-2 w-full" onClick={() => entityId != null && window.open(api.orgTemplateUrl(entityId), "_blank")}><Download size={14} /> Download Template</Button>
              </Card>
              <Card className="p-4">
                <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-text1">Structure Rules</span><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
                <div className="space-y-1.5">{(data?.rules ?? []).map((r) => <div key={r} className="flex items-start gap-1.5 text-xs text-text2"><CheckCircle2 size={13} className="mt-0.5 shrink-0 text-success" /> {r}</div>)}</div>
              </Card>
              <Card className="p-4">
                <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-text1"><AlertTriangle size={14} className="text-warning" /> Missing Hierarchy Alerts</div>
                <div className="space-y-1.5">{(data?.alerts ?? []).map((a) => <div key={a.label} className="flex items-center gap-1.5 text-xs"><AlertTriangle size={13} className="shrink-0 text-warning" /><span className="flex-1 text-text2">{a.label}</span><button onClick={() => set({ status: "unmapped" })} className="font-semibold text-primary hover:underline">View</button></div>)}</div>
              </Card>
              <Card className="p-4">
                <div className="mb-2 text-sm font-semibold text-text1">Reviewer Comments ({data?.comments.length ?? 0})</div>
                <div className="space-y-1.5">
                  {(data?.comments ?? []).map((c, i) => (
                    <div key={i} className="rounded-lg bg-surface2 p-2.5 text-xs"><div className="font-semibold text-text1">{c.author_name} <span className="font-normal text-text3">· {c.author_role}</span></div><div className="mt-1 text-text2">{c.body}</div></div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <input value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addComment()} placeholder="Add a comment…" className="h-8 min-w-0 flex-1 rounded-btn border border-border bg-card px-2 text-xs text-text1 outline-none transition-colors duration-fast focus:border-primary focus:ring-2 focus:ring-primary/20" />
                  <Button size="sm" className="shrink-0" onClick={addComment} disabled={!comment.trim()}>Add</Button>
                </div>
              </Card>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add Section</Button>
          <Button variant="secondary" onClick={saveDraft}><Save size={16} /> Save as Draft</Button>
          <Button variant="secondary" onClick={() => setValidateOpen(true)} className="ml-auto"><ShieldCheck size={16} /> Validate Structure</Button>
          <Button onClick={() => setGuardOpen(true)}><Send size={16} /> Submit for Review</Button>
        </div>
      </PageBody>

      <SubmitGuardModal
        open={guardOpen}
        onClose={() => setGuardOpen(false)}
        packageName="Organization Structure"
        issues={(k?.unmapped ?? 0) > 0 ? [`${k?.unmapped} unmapped section${(k?.unmapped ?? 0) > 1 ? "s" : ""}`] : []}
        onConfirm={submit}
      />

      <Modal
        open={addOpen}
        onClose={closeAdd}
        title="Add Section"
        footer={
          <>
            <Button variant="secondary" onClick={closeAdd} disabled={addBusy}>Cancel</Button>
            <Button onClick={addSection} disabled={addBusy}>{addBusy ? "Adding…" : "Add Section"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sector"><TextInput value={addForm.sector} onChange={(e) => setAddForm((f) => ({ ...f, sector: e.target.value }))} placeholder="e.g. Corporate Services" /></Field>
          <Field label="Department"><TextInput value={addForm.department} onChange={(e) => setAddForm((f) => ({ ...f, department: e.target.value }))} placeholder="e.g. Human Resources" /></Field>
        </div>
        <Field label="Section name"><TextInput value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Talent Acquisition" /></Field>
        <Field label="Employee count" hint="Optional"><TextInput type="number" min={0} value={addForm.employee_count} onChange={(e) => setAddForm((f) => ({ ...f, employee_count: e.target.value }))} /></Field>
      </Modal>

      {/* OS-12 / MD-06 validate-results modal */}
      <Modal
        open={validateOpen}
        onClose={() => setValidateOpen(false)}
        title="Structure Validation Results"
        footer={<Button onClick={() => setValidateOpen(false)}>Done</Button>}
      >
        {(k?.unmapped ?? 0) === 0 && (data?.alerts ?? []).length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text1"><CheckCircle2 size={16} className="text-success" /> All checks passed. Your structure is fully mapped.</div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm font-medium text-warning"><AlertTriangle size={16} /> {(k?.unmapped ?? 0)} unmapped section{(k?.unmapped ?? 0) === 1 ? "" : "s"} · {(data?.alerts ?? []).length} hierarchy alert{(data?.alerts ?? []).length === 1 ? "" : "s"}</div>
            <div className="space-y-1.5">
              {(data?.alerts ?? []).map((a) => (
                <button key={a.label} onClick={() => { set({ status: "unmapped" }); setValidateOpen(false); }} className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm hover:bg-page">
                  <AlertTriangle size={14} className="shrink-0 text-warning" />
                  <span className="flex-1 text-text2">{a.label}</span>
                  <span className="text-xs font-semibold text-primary">View →</span>
                </button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
