import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database, FileCheck2, AlertTriangle, UserMinus, ShieldCheck, UploadCloud, Link2,
  FileSpreadsheet, MoreHorizontal, Save, Download, Send, CheckCircle2,
} from "lucide-react";
import { api, type WorkforceFilters } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { fmt, relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PaginationFooter } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { MappingDrawer } from "@/components/shared/MappingDrawer";

const MAP_TONE: Record<string, string> = { mapped: "#16A34A", partial: "#EA8A00", unmapped: "#E11D48" };

export function Workforce() {
  const { entityId } = useAudience();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<WorkforceFilters>({ page: 1, page_size: 25 });
  const [stage, setStage] = useState<string | null>(null);
  const [showMapping, setShowMapping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<WorkforceFilters>) => setFilters((f) => ({ ...f, ...p, page: p.page ?? 1 }));

  const doImport = async (file: File) => {
    if (entityId == null) return;
    try {
      setStage("Parsing file…");
      await new Promise((r) => setTimeout(r, 700));
      setStage("Mapping job titles…");
      const result = await api.importWorkforce(entityId, file);
      setStage("Running validations…");
      await new Promise((r) => setTimeout(r, 600));
      qc.invalidateQueries();
      toast.success(`Imported ${fmt(result.imported)} records — ${result.mapped.pct}% auto-mapped.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setStage(null);
    }
  };
  const runValidation = async () => {
    if (entityId == null) return;
    await api.workforceValidate(entityId);
    qc.invalidateQueries();
    toast.success("Validation complete.");
  };
  const submit = async () => {
    if (entityId == null) return;
    await api.submitPackage(entityId, "current_workforce");
    qc.invalidateQueries();
    toast.success("Current Workforce Data submitted to DGHR.");
  };
  const { data } = useQuery({
    queryKey: ["workforce", entityId, filters],
    queryFn: () => api.workforce(entityId!, filters),
    enabled: entityId != null,
  });
  const k = data?.kpis;
  const empty = (data?.kpis.imported_records ?? 0) === 0;

  return (
    <>
      <PageHeader title="Current Workforce Data" subtitle="Submit your organization's current workforce baseline data." />
      <PageBody>
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="blue" icon={<Database size={20} />} value={k?.imported_records} label="Imported Records" sublabel="From HR Extract" />
          <KpiCard tone="green" icon={<FileCheck2 size={20} />} value={k?.mapped_titles.count} label="Mapped Job Titles" sublabel={`${k?.mapped_titles.pct ?? 0}% of total`} />
          <KpiCard tone="orange" icon={<AlertTriangle size={20} />} value={k?.open_issues} label="Open Validation Issues" sublabel="Requires attention" />
          <KpiCard tone="teal" icon={<UserMinus size={20} />} value={k?.vacancies.count} label="Vacancies" sublabel={`${k?.vacancies.pct ?? 0}% of total positions`} />
          <KpiCard tone="blue" ring={k?.completeness ?? 0} label="Completeness Score" sublabel="Excellent" />
        </div>

        {empty ? (
          <Card className="mt-4"><EmptyState icon={<UploadCloud size={26} />} title="No workforce data imported yet" description="Upload your HR extract to populate the workforce baseline. This entity has not started its Current Workforce submission." /></Card>
        ) : (
        <>
        {/* row 2 */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="mb-1 text-sm font-semibold text-text1">Import Workforce Data</div>
            <p className="mb-3 text-xs text-text3">Upload your HR extract or Excel file to populate the workforce table.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} />
            <div
              className="rounded-card border border-dashed border-border p-4 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) doImport(f); }}
            >
              {stage ? (
                <div className="py-2 text-teal">
                  <UploadCloud size={22} className="mx-auto mb-2 animate-pulse" />
                  <div className="text-sm font-semibold">{stage}</div>
                </div>
              ) : (
                <>
                  <UploadCloud size={22} className="mx-auto mb-2 text-primary" />
                  <Button size="sm" onClick={() => fileRef.current?.click()}><UploadCloud size={14} /> Upload File</Button>
                  <div className="mt-2 text-[11px] text-text3">Drag &amp; drop or browse · .xlsx, .xls, .csv · Max 25MB</div>
                </>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
              <FileSpreadsheet size={16} className="text-success" />
              <div className="flex-1"><div className="font-semibold text-text1">{data?.upload.filename}</div><div className="text-text3">Uploaded {data?.upload.uploaded_at ? relativeTime(data.upload.uploaded_at) : "Today, 10:15 AM"} by {data?.upload.uploaded_by}</div></div>
              <StatusBadge value="mapped" label="Imported" />
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-1 text-sm font-semibold text-text1">Mapping Summary</div>
            <p className="mb-3 text-xs text-text3">Standardized mapping to DGHR job families and titles.</p>
            <div className="space-y-2">
              {(data?.mapping_summary ?? []).map((mp) => (
                <div key={mp.key} className="flex items-center justify-between text-sm">
                  <span className="text-text2">{mp.label}</span>
                  <span className="font-semibold" style={{ color: MAP_TONE[mp.key] }}>{fmt(mp.count)} ({mp.pct}%)</span>
                </div>
              ))}
            </div>
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setShowMapping(true)}><Link2 size={14} /> Map Fields</Button>
          </Card>

          <Card className="p-5">
            <div className="mb-1 text-sm font-semibold text-text1">Validation Summary</div>
            <p className="mb-3 text-xs text-text3">Resolve issues to improve data quality.</p>
            <div className="space-y-2">
              {(data?.validation_summary ?? []).map((v) => (
                <div key={v.label} className="flex items-center justify-between text-sm"><span className="text-text2">{v.label}</span><span className="font-semibold text-danger">{v.count}</span></div>
              ))}
            </div>
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={runValidation}><ShieldCheck size={14} /> Run Validation</Button>
          </Card>
        </div>

        {/* table */}
        <Card className="mt-4">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <input value={filters.search ?? ""} onChange={(e) => set({ search: e.target.value })} placeholder="Search job title, family, or grade…"
              className="h-9 w-72 rounded-btn border border-border px-3 text-sm" />
            <select value={filters.section ?? ""} onChange={(e) => set({ section: e.target.value || undefined })} className="h-9 rounded-btn border border-border px-2 text-sm">
              <option value="">All Sections</option>{(data?.sections ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filters.employment_type ?? ""} onChange={(e) => set({ employment_type: e.target.value || undefined })} className="h-9 rounded-btn border border-border px-2 text-sm">
              <option value="">All Employment Types</option><option>Permanent</option><option>Contract</option><option>Part-time</option>
            </select>
            <select value={filters.status ?? ""} onChange={(e) => set({ status: e.target.value || undefined })} className="h-9 rounded-btn border border-border px-2 text-sm">
              <option value="">All Statuses</option><option value="mapped">Mapped</option><option value="partial">Partial</option><option value="unmapped">Unmapped</option>
            </select>
            <div className="ml-auto flex items-center gap-2 text-sm text-text2">
              Rows per page
              <select value={filters.page_size} onChange={(e) => set({ page_size: Number(e.target.value) })} className="h-9 rounded-btn border border-border px-2">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-y border-[#EEF2F7] text-[11px] uppercase text-text3">
                <th className="w-10 px-4 py-2.5"><input type="checkbox" className="accent-primary" /></th>
                <th className="px-3 py-2.5 font-semibold">Section</th><th className="px-3 py-2.5 font-semibold">Job Title</th><th className="px-3 py-2.5 font-semibold">Job Family</th><th className="px-3 py-2.5 font-semibold">Grade</th><th className="px-3 py-2.5 text-right font-semibold">Current FTE</th><th className="px-3 py-2.5 text-right font-semibold">Vacancies</th><th className="px-3 py-2.5 font-semibold">Employment Type</th><th className="px-3 py-2.5 text-center font-semibold">Critical</th><th className="px-3 py-2.5 font-semibold">Status</th><th />
              </tr></thead>
              <tbody>
                {(data?.records.rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-[#EEF2F7] hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5"><input type="checkbox" className="accent-primary" /></td>
                    <td className="px-3 py-2.5 text-text2">{r.section}</td>
                    <td className="px-3 py-2.5 font-medium text-text1">{r.job_title}</td>
                    <td className="px-3 py-2.5"><span className="rounded-md border border-border px-2 py-0.5 text-xs text-text2">{r.job_family ?? "—"}</span></td>
                    <td className="px-3 py-2.5 text-text2">{r.grade ?? <span className="text-danger">—</span>}</td>
                    <td className="px-3 py-2.5 text-right text-text2">{r.current_fte.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right text-text2">{r.vacancies.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-text2">{r.employment_type ?? <span className="text-danger">—</span>}</td>
                    <td className="px-3 py-2.5 text-center"><input type="checkbox" checked={r.critical_role} readOnly className="accent-primary" /></td>
                    <td className="px-3 py-2.5"><StatusBadge value={r.map_status} label={r.map_status === "mapped" ? "Mapped" : r.map_status === "partial" ? "Partial" : "Unmapped"} /></td>
                    <td className="px-2"><button className="text-text3 hover:text-text1"><MoreHorizontal size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-text2">
            <PaginationFooter page={data?.records.page ?? 1} pageSize={filters.page_size ?? 25} total={data?.records.total ?? 0} onPage={(p) => set({ page: p })} unit="records" />
          </div>
        </Card>

        {/* footer */}
        <div className="mt-4 flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-text3"><CheckCircle2 size={14} className="text-success" /> Draft saved</span>
          <Button variant="secondary" className="ml-auto" onClick={() => toast.success("Draft saved.")}><Save size={16} /> Save Draft</Button>
          <Button variant="secondary" onClick={() => toast.success("Workforce data exported.")}><Download size={16} /> Export Data</Button>
          <Button onClick={submit}><Send size={16} /> Submit Workforce Data</Button>
        </div>
        </>
        )}
      </PageBody>
      {entityId != null && <MappingDrawer entityId={entityId} open={showMapping} onClose={() => setShowMapping(false)} />}
    </>
  );
}
