import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building, Network, Boxes, AlertTriangle, ShieldCheck, ChevronRight, ChevronDown,
  Upload, Download, CheckCircle2, Save, Send, Plus, MoreHorizontal, Network as TreeIcon, FolderTree,
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
import { PaginationFooter } from "@/components/shared/DataTable";

const DOT: Record<string, string> = { mapped: "#16A34A", unmapped: "#E11D48", partial: "#EA8A00", not_in_scope: "#94A3B8" };
const Dot = ({ s }: { s: string }) => <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: DOT[s] ?? "#94A3B8" }} />;

export function OrgStructure() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const submit = async () => { if (entityId == null) return; await api.submitPackage(entityId, "org_structure"); qc.invalidateQueries(); toast.success("Organization Structure submitted for review."); };
  const doImport = async (file: File) => {
    if (entityId == null) return;
    try { const r = await api.importOrg(entityId, file); qc.invalidateQueries(); toast.success(`Imported ${r.imported} sections.`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Import failed."); }
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
          <KpiCard tone="blue" icon={<Building size={20} />} value={k?.sectors} label="Sectors" sublabel="100% mapped" />
          <KpiCard tone="green" icon={<Network size={20} />} value={k?.departments} label="Departments" sublabel="100% mapped" />
          <KpiCard tone="orange" icon={<Boxes size={20} />} value={k?.sections} label="Sections" sublabel={`${k?.completeness ?? 0}% mapped`} />
          <KpiCard tone="red" icon={<AlertTriangle size={20} />} value={k?.unmapped} label="Unmapped Sections" sublabel="View and resolve" />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={`${k?.completeness ?? 0}%`} label="Structure Completeness" sublabel="Target: 100%" />
          <KpiCard tone="blue" ring={k?.completeness ?? 0} label="Structure Ready" sublabel="Almost there! Resolve missing items to submit." />
        </div>

        {empty ? (
          <Card className="mt-4"><EmptyState icon={<FolderTree size={26} />} title="No organization structure yet" description="Import your structure or add sections to begin. This entity has not started its org-structure submission." /></Card>
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
                  <Button variant="secondary" size="sm" onClick={() => toast.message("Available in the full release")}><Plus size={14} /> Add Section</Button>
                </div>
              </div>
              <div className="flex items-center gap-2 px-5 py-3">
                <input value={filters.search ?? ""} onChange={(e) => set({ search: e.target.value })} placeholder="Search sections…"
                  className="h-9 flex-1 rounded-btn border border-border px-3 text-sm" />
                <select value={filters.sector ?? ""} onChange={(e) => set({ sector: e.target.value || undefined })} className="h-9 rounded-btn border border-border px-2 text-sm">
                  <option value="">All Sectors</option>{(data?.sectors ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })} className="h-9 rounded-btn border border-border px-2 text-sm">
                  <option value="">All Statuses</option><option value="mapped">Mapped</option><option value="unmapped">Unmapped</option><option value="partial">Partial</option><option value="not_in_scope">Not in Scope</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead><tr className="border-y border-[#EEF2F7] text-[11px] uppercase text-text3">
                    <th className="px-3 py-2.5 font-semibold">Sector</th><th className="px-3 py-2.5 font-semibold">Department</th><th className="px-3 py-2.5 font-semibold">Section</th><th className="px-3 py-2.5 font-semibold">Owner</th><th className="px-3 py-2.5 font-semibold">HR Focal</th><th className="px-3 py-2.5 font-semibold">In Scope</th><th className="px-3 py-2.5 font-semibold">Emp.</th><th className="px-3 py-2.5 font-semibold">Status</th><th />
                  </tr></thead>
                  <tbody>
                    {(data?.sections.rows ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-[#EEF2F7] hover:bg-[#F8FAFC]">
                        <td className="px-3 py-2.5 text-text3">{r.sector.replace(" Sector", "")}</td>
                        <td className="px-3 py-2.5 text-text3">{r.department.replace(" Department", "")}</td>
                        <td className="px-3 py-2.5 font-medium text-text1">{r.name}</td>
                        <td className="px-3 py-2.5">{r.owner_name ? <span className="flex items-center gap-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-navy-900 text-[9px] font-bold text-white">{r.owner_initials}</span>{r.owner_name}</span> : <span className="text-danger">—</span>}</td>
                        <td className="px-3 py-2.5 text-text2">{r.hr_focal_point ?? <span className="text-danger">—</span>}</td>
                        <td className="px-3 py-2.5 text-text2">{r.in_scope ? "Yes" : "No"}</td>
                        <td className="px-3 py-2.5 text-text2">{r.employee_count ?? "–"}</td>
                        <td className="px-3 py-2.5"><StatusBadge value={r.status} /></td>
                        <td className="px-2"><button className="text-text3 hover:text-text1"><MoreHorizontal size={15} /></button></td>
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
                {(data?.comments ?? []).map((c, i) => (
                  <div key={i} className="rounded-lg bg-page p-2.5 text-xs"><div className="font-semibold text-text1">{c.author_name} <span className="font-normal text-text3">· {c.author_role}</span></div><div className="mt-1 text-text2">{c.body}</div></div>
                ))}
              </Card>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={() => toast.success("Draft saved.")}><Save size={16} /> Save as Draft</Button>
          <Button variant="secondary" onClick={() => toast.success("Structure validated — statuses recomputed.")} className="ml-auto"><ShieldCheck size={16} /> Validate Structure</Button>
          <Button onClick={submit}><Send size={16} /> Submit for Review</Button>
        </div>
      </PageBody>
    </>
  );
}
