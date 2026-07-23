import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2, FileCheck2, CornerUpLeft, Clock, ShieldCheck,
  Send, ListChecks, Download, Filter, AlertCircle, Flag, TrendingDown, UserX,
  FileWarning, ClipboardX, Boxes, Eye, MessageSquareWarning, CornerDownLeft, CheckCircle2,
} from "lucide-react";
import { api, type TrackerFilters } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { PctChip } from "@/components/shared/PctChip";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { PaginationFooter } from "@/components/shared/DataTable";
import { EntityDrawer } from "@/components/shared/EntityDrawer";
import { RowMenu } from "@/components/shared/Dropdown";
import { OpenClarificationModal, ReturnSubmissionModal } from "@/components/shared/CaseModals";
import { THEAD_TR, TROW } from "@/components/ui/table";
import { useTone } from "@/lib/tone";
import type { TrackerRow } from "@/lib/types";

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase text-text3">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="select-field h-9 rounded-btn border border-border bg-card px-2 text-sm text-text1"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

const BLOCK_ICONS: Record<string, React.ReactNode> = {
  missing_evidence: <FileWarning size={16} />, incomplete_workload: <ClipboardX size={16} />,
  future_drivers: <TrendingDown size={16} />, org_issues: <Boxes size={16} />, other: <AlertCircle size={16} />,
};

export function Submissions() {
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const [clarifyFor, setClarifyFor] = useState<TrackerRow | null>(null);
  const [returnFor, setReturnFor] = useState<TrackerRow | null>(null);
  // Read initial filters + focused entity from the URL (CC-07/CC-09/FR-03 deep-links; TRK-02).
  const [filters, setFilters] = useState<TrackerFilters>(() => ({
    page: 1,
    page_size: 10,
    status: sp.get("status") || undefined,
    wave: sp.get("wave") || undefined,
    reviewer: sp.get("reviewer") || undefined,
    package: sp.get("package") || undefined,
    due: sp.get("due") || undefined,
    search: sp.get("search") || undefined,
  }));
  const [drawerId, setDrawerId] = useState<number | null>(sp.get("entity") ? Number(sp.get("entity")) : null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const set = (patch: Partial<TrackerFilters>) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  // TRK-02 / G-03: keep filters in the URL so they're shareable + reload-stable.
  useEffect(() => {
    const q = new URLSearchParams();
    (["wave", "status", "reviewer", "package", "due", "search", "completeness", "sort", "direction"] as const)
      .forEach((k) => { const v = filters[k]; if (v) q.set(k, String(v)); });
    setSp(q, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const targetIds = () => (selected.size ? [...selected] : (data?.rows.filter((r) => r.overdue).map((r) => r.id) ?? []));
  const sendReminder = async () => { const ids = targetIds(); await api.remind(ids); qc.invalidateQueries(); toast.success(`Reminder sent to ${ids.length} entities.`); };
  const bulkReview = async () => {
    const ids = [...selected];
    if (!ids.length) return toast.message("Select entities to review.");
    if (!window.confirm(`Move ${ids.length} selected ${ids.length === 1 ? "entity" : "entities"} to review?`)) return; // MD-13
    const r = await api.bulkReview(ids);
    qc.invalidateQueries(); setSelected(new Set());
    toast.success(`${r.reviewed} moved to review${r.skipped ? `, ${r.skipped} skipped (nothing submitted)` : ""}.`); // TRK-08
  };
  const remindOne = async (r: TrackerRow) => { await api.remind([r.id]); qc.invalidateQueries(); toast.success(`Reminder sent to ${r.name}.`); };
  const approveOne = async (r: TrackerRow) => { await api.approve({ entity_ids: [r.id] }); qc.invalidateQueries(); toast.success(`${r.name} approved.`); };

  const { data } = useQuery({
    queryKey: ["tracker", filters],
    queryFn: () => api.tracker(filters),
    refetchInterval: 4000,
  });
  const { data: blocked } = useQuery({ queryKey: ["tracker-blocked"], queryFn: api.trackerBlocked });
  const { data: followups } = useQuery({ queryKey: ["tracker-followups"], queryFn: api.trackerFollowups, refetchInterval: 4000 });

  const k = data?.kpis;
  const cols = data?.columns ?? [];
  const tone = useTone();
  const toggleSort = (key: string) =>
    set({ sort: key, direction: filters.sort === key && filters.direction === "asc" ? "desc" : "asc" });

  return (
    <>
      <PageHeader
        title="DGHR Entity Submission Tracker"
        subtitle="Track the status and progress of all entity submissions across Dubai Government entities."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={sendReminder}>
              <Send size={15} /> Send Reminder
            </Button>
            <Button size="sm" onClick={bulkReview}>
              <ListChecks size={15} /> Bulk Review
            </Button>
            <a href={api.trackerCsvUrl(filters)} download>
              <Button variant="secondary" size="sm"><Download size={15} /> Export Tracker</Button>
            </a>
          </>
        }
      />
      <PageBody>
        {/* KPIs */}
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="blue" icon={<Building2 size={20} />} value={k?.total_entities} label="Total Entities" sublabel="Across Dubai Government" />
          <KpiCard tone="green" icon={<FileCheck2 size={20} />} value={k?.submitted_entities.value} label="Submitted Entities" sublabel={`${k?.submitted_entities.pct ?? 0}% of total entities`} />
          <KpiCard tone="orange" icon={<CornerUpLeft size={20} />} value={k?.returned_entities.value} label="Returned Entities" sublabel={`${k?.returned_entities.pct ?? 0}% of total entities`} />
          <KpiCard tone="red" icon={<Clock size={20} />} value={k?.overdue.value} label="Overdue Submissions" sublabel={`${k?.overdue.pct ?? 0}% of total entities`} />
          <KpiCard tone="teal" icon={<ShieldCheck size={20} />} value={k?.avg_completeness} label="Avg. Completeness Score" sublabel="Across all submissions" />
        </div>

        {/* Filters */}
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <Select label="Wave" value={filters.wave ?? ""} onChange={(v) => set({ wave: v || undefined })}
              options={[{ value: "", label: "All Waves" }, { value: "W1", label: "Wave 1" }, { value: "W2", label: "Wave 2" }, { value: "W3", label: "Wave 3" }]} />
            <Select label="Status" value={filters.status ?? ""} onChange={(v) => set({ status: v || undefined })}
              options={[{ value: "", label: "All Statuses" }, { value: "not_started", label: "Not Started" }, { value: "in_progress", label: "In Progress" }, { value: "submitted", label: "Submitted" }, { value: "under_review", label: "Under Review" }, { value: "returned", label: "Returned" }, { value: "approved", label: "Approved" }]} />
            <Select label="Reviewer" value={filters.reviewer ?? ""} onChange={(v) => set({ reviewer: v || undefined })}
              options={[{ value: "", label: "All Reviewers" }, ...(data?.reviewers ?? []).map((r) => ({ value: r, label: r }))]} />
            <Select label="Due Date" value={filters.due ?? ""} onChange={(v) => set({ due: v || undefined })}
              options={[{ value: "", label: "All Dates" }, { value: "week", label: "This week" }, { value: "overdue", label: "Overdue" }]} />
            <Select label="Data Package" value={filters.package ?? ""} onChange={(v) => set({ package: v || undefined })}
              options={[{ value: "", label: "All Packages" }, { value: "org_structure", label: "Org Structure" }, { value: "current_workforce", label: "Workforce Data" }, { value: "workload_service", label: "Workload Data" }, { value: "future_drivers", label: "Future Drivers" }, { value: "evidence_documents", label: "Evidence" }]} />
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setFilters({ page: 1, page_size: 10 })} className="text-sm font-semibold text-primary hover:underline">Clear Filters</button>
              <Button variant="secondary" size="sm" onClick={() => toast.message("Available in the full release")}><Filter size={14} /> More Filters</Button>
            </div>
          </div>
        </Card>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* table */}
          <Card className="col-span-9 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className={THEAD_TR}>
                    <th className="w-10 px-4 py-3"><input type="checkbox" aria-label="Select all entities" className="accent-primary"
                      checked={!!data?.rows.length && data.rows.every((r) => selected.has(r.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(data?.rows.map((r) => r.id)) : new Set())} /></th>
                    <th className="px-3 py-3"><button onClick={() => toggleSort("name")} className="font-semibold hover:text-text1">Entity Name</button></th>
                    <th className="px-3 py-3 font-semibold">Wave</th>
                    {cols.map((c) => <th key={c} className="px-2 py-3 text-center font-semibold">{c}</th>)}
                    <th className="px-3 py-3"><button onClick={() => toggleSort("completeness")} className="font-semibold hover:text-text1">Overall Completeness</button></th>
                    <th className="px-3 py-3 font-semibold">Reviewer</th>
                    <th className="px-3 py-3 font-semibold">Due Date</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((r) => (
                    <tr key={r.id} onClick={() => setDrawerId(r.id)} className={`${TROW} cursor-pointer`}>
                      <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Select ${r.name}`} className="accent-primary" checked={selected.has(r.id)}
                        onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                      <td className="px-3 py-3.5"><div className="font-semibold text-text1">{r.name}</div><div className="text-xs text-text3">{r.code}</div></td>
                      <td className="px-3 py-3.5 text-text2">{r.wave}</td>
                      {cols.map((c) => <td key={c} className="px-2 py-3.5 text-center"><PctChip value={r.packages[c] ?? null} /></td>)}
                      <td className="px-3 py-3.5">
                        <div className="nums font-bold text-text1">{r.completeness}%</div>
                        <ProgressBar value={r.completeness} className="mt-1 w-24" />
                      </td>
                      <td className="px-3 py-3.5">
                        {r.reviewer ? (
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-[10px] font-bold text-white">{r.reviewer_initials}</span>
                            <span className="text-text2">{r.reviewer}</span>
                          </span>
                        ) : <span className="text-text3">Unassigned</span>}
                      </td>
                      <td className={`px-3 py-3.5 ${r.overdue ? "font-semibold text-danger" : "text-text2"}`}>{r.due_date ?? "-"}</td>
                      <td className="px-3 py-3.5"><StatusBadge value={r.overdue && r.status !== "submitted" ? "overdue" : r.status} label={r.overdue && r.status !== "submitted" ? "Overdue" : r.status_label} /></td>
                      <td className="px-2">
                        <RowMenu label={`Actions for ${r.name}`} items={[
                          { label: "View Details", icon: <Eye size={15} />, onClick: () => setDrawerId(r.id) },
                          { label: "Send Reminder", icon: <Send size={15} />, onClick: () => remindOne(r) },
                          { label: "Open Clarification", icon: <MessageSquareWarning size={15} />, onClick: () => setClarifyFor(r) },
                          { label: "Return Submission", icon: <CornerDownLeft size={15} />, onClick: () => setReturnFor(r) },
                          // TRK-15 legal-only: approve only when there is something submitted/under review
                          { label: "Approve", icon: <CheckCircle2 size={15} />, disabled: !["submitted", "under_review"].includes(r.status), onClick: () => approveOne(r) },
                        ]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-sm text-text2">
              <label className="flex items-center gap-2">Rows per page
                <select aria-label="Rows per page" value={filters.page_size} onChange={(e) => set({ page_size: Number(e.target.value) })} className="select-field h-8 rounded-btn border border-border bg-card px-2">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <PaginationFooter page={data?.page ?? 1} pageSize={data?.page_size ?? 10} total={data?.total ?? 0} onPage={(p) => set({ page: p })} />
            </div>
          </Card>

          {/* rails */}
          <div className="col-span-3 space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text1">Where Submissions Are Blocked</h3>
                <button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View report →</button>
              </div>
              <div className="space-y-2.5">
                {(blocked?.items ?? []).map((b) => (
                  <div key={b.key} className="flex items-center gap-2 text-sm">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-inset text-text2">{BLOCK_ICONS[b.key]}</span>
                    <span className="flex-1 text-text2">{b.label}</span>
                    <span className="nums font-semibold text-text1">{b.count}</span>
                    <span className="nums w-9 text-right text-xs text-text3">{b.pct}%</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-2 text-sm font-semibold text-text1">
                  <span>Total</span><span className="nums">{blocked?.total ?? 0}</span><span className="nums text-text3">100%</span>
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text1">Entities Requiring Follow-Up</h3>
                <button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all →</button>
              </div>
              <div className="space-y-2">
                {[
                  { icon: <Clock size={15} />, tone: "#E11D48", label: "Overdue Submissions", sub: "Past due date", value: followups?.overdue, f: { due: "overdue" } },
                  { icon: <Flag size={15} />, tone: "#EA8A00", label: "Returned by Reviewer", sub: "Awaiting action", value: followups?.returned, f: { status: "returned" } },
                  { icon: <TrendingDown size={15} />, tone: "#0EA5E9", label: "Low Completeness (<60%)", sub: "Needs attention", value: followups?.low_completeness, f: { completeness: "low" } },
                  { icon: <UserX size={15} />, tone: "#7C3AED", label: "Unassigned Reviewer", sub: "Requires assignment", value: followups?.unassigned, f: { reviewer: "Unassigned" } },
                ].map((r) => (
                  <button key={r.label} onClick={() => set(r.f)} className="flex w-full items-center gap-2.5 rounded-btn border border-border p-2.5 text-left transition-colors duration-fast hover:bg-surface2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ color: tone.fg(r.tone), backgroundColor: tone.chip(r.tone) }}>{r.icon}</span>
                    <div className="flex-1"><div className="text-sm font-medium text-text1">{r.label}</div><div className="text-[11px] text-text3">{r.sub}</div></div>
                    <span className="nums text-lg font-bold text-text1">{r.value ?? 0}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </PageBody>

      <EntityDrawer entityId={drawerId} onClose={() => setDrawerId(null)} />
      <OpenClarificationModal open={clarifyFor != null} entityId={clarifyFor?.id ?? null} entityName={clarifyFor?.name} onClose={() => setClarifyFor(null)} />
      <ReturnSubmissionModal open={returnFor != null} entityId={returnFor?.id ?? null} entityName={returnFor?.name} onClose={() => setReturnFor(null)} />
    </>
  );
}
