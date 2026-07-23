import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, Download, Trash2, FolderClosed, FileText, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { usePersona } from "@/stores/persona";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Select } from "@/components/shared/Modal";
import { THEAD_TR, TH, TH_NUM, TROW } from "@/components/ui/table";
import type { DocumentRow } from "@/lib/planning";

const CATEGORIES = ["General", "Evidence", "Methodology", "Org chart", "Correspondence"];

function fmtSize(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// Documents — real files stored on the backend uploads volume and recorded in the uploads table.
export function PlanningDocuments() {
  const { entityId } = useAudience();
  const { persona } = usePersona();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [busy, setBusy] = useState(false);

  const { data } = useQuery({ queryKey: ["q-docs", entityId], queryFn: () => api.planning.documents(entityId!), enabled: entityId != null, refetchInterval: 4000 });
  const docs = data?.documents ?? [];

  const pick = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || entityId == null) return;
    setBusy(true);
    try {
      await api.planning.uploadDocument(entityId, file, category, persona.userName);
      qc.invalidateQueries({ queryKey: ["q-docs", entityId] });
      toast.success(`${file.name} uploaded.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const del = async (d: DocumentRow) => {
    if (!window.confirm(`Delete "${d.filename}"? This removes the stored file.`)) return;
    try {
      await api.planning.deleteDocument(d.id);
      qc.invalidateQueries({ queryKey: ["q-docs", entityId] });
      toast.success("Document deleted.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  const byCategory = docs.reduce<Record<string, number>>((a, d) => ({ ...a, [d.category]: (a[d.category] ?? 0) + 1 }), {});

  return (
    <>
      <PageHeader title="Documents" subtitle="Upload and keep the supporting files behind your submissions: templates, evidence, methodology notes."
        actions={<>
          <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
          <Button size="sm" onClick={pick} disabled={busy || entityId == null}><Upload size={15} /> {busy ? "Uploading…" : "Upload document"}</Button>
        </>} />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Card className="min-w-0 p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
              <span className="text-sm font-semibold text-text1">Your documents</span>
              <label className="flex items-center gap-2 whitespace-nowrap text-xs text-text3">
                Upload as
                <Select value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-40 text-xs">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </label>
            </div>
            {docs.length === 0 ? (
              <EmptyState icon={<FolderClosed size={26} />} title="No documents yet"
                description="Upload the files that back up your submissions: evidence, org charts, methodology notes. They stay attached to your entity."
                action={<Button size="sm" onClick={pick}><Upload size={14} /> Upload document</Button>} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead><tr className={THEAD_TR}>
                    <th className="min-w-[260px] px-5 py-2.5">File</th><th className={TH}>Category</th>
                    <th className={TH}>Uploaded by</th><th className={TH}>Date</th>
                    <th className={TH_NUM}>Size</th><th className="px-5 py-2.5 text-right">Actions</th>
                  </tr></thead>
                  <tbody>
                    {docs.map((d) => (
                      <tr key={d.id} className={`${TROW} ${d.missing ? "bg-warning-bg/40" : ""}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-start gap-2 text-sm font-semibold text-text1">
                            <FileText size={15} className="mt-0.5 shrink-0 text-text3" />
                            <span className="min-w-0 break-words">{d.filename}</span>
                          </div>
                          {d.missing && <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning"><AlertTriangle size={11} /> stored file missing</span>}
                        </td>
                        <td className="px-3 py-3.5"><span className="rounded-full bg-inset px-2 py-0.5 text-[11px] font-semibold text-text2">{d.category}</span></td>
                        <td className="px-3 py-3.5 text-sm text-text2">{d.uploaded_by || "-"}</td>
                        <td className="px-3 py-3.5 text-sm text-text2">{fmtDate(d.uploaded_at)}</td>
                        <td className="px-3 py-3.5 text-right text-sm tabular-nums text-text2">{fmtSize(d.size_bytes)}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1">
                            <a href={api.planning.documentDownloadUrl(d.id)} target="_blank" rel="noreferrer"
                              aria-label={`Download ${d.filename}`}
                              className={`flex h-8 w-8 items-center justify-center rounded-btn ${d.missing ? "pointer-events-none text-text3 opacity-50" : "text-text2 hover:bg-surface2"}`}>
                              <Download size={15} />
                            </a>
                            <button aria-label={`Delete ${d.filename}`} onClick={() => del(d)}
                              className="flex h-8 w-8 items-center justify-center rounded-btn text-text3 hover:bg-surface2 hover:text-danger">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card>
              <div className="mb-4 text-sm font-semibold text-text1">Library</div>
              <div className="flex items-end justify-between gap-4">
                <div>
                  <div className="nums text-3xl font-bold leading-none text-text1">{data?.total ?? 0}</div>
                  <div className="mt-1.5 text-xs text-text3">Documents</div>
                </div>
                <div className="text-right">
                  <div className="nums text-lg font-semibold leading-none text-text1">{fmtSize(data?.total_bytes ?? 0)}</div>
                  <div className="mt-1.5 text-xs text-text3">Total size</div>
                </div>
              </div>
            </Card>
            {Object.keys(byCategory).length > 0 && (
              <Card>
                <div className="mb-3 text-sm font-semibold text-text1">By category</div>
                <div className="space-y-1.5">
                  {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
                    <div key={c} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 text-text2">{c}</span>
                      <span className="font-semibold tabular-nums text-text1">{n}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card className="text-xs leading-relaxed text-text3">
              <b className="text-text2">Note:</b> documents are stored against your entity and visible to the DGHR team reviewing your submissions. They are not a substitute for the figures in your submission: DGHR sizes from your drivers, not your attachments.
            </Card>
          </aside>
        </div>
      </PageBody>
    </>
  );
}
