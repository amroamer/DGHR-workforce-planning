import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Boxes, ClipboardList, FileText, CalendarDays, Network, Users, ArrowLeftRight,
  BarChart3, Target, Award, Coins, Maximize2, MoreHorizontal, ChevronRight, Eye, Save, Send,
  Headphones, Search, Cpu, Rocket, Database, CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import { usePersona } from "@/stores/persona";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ConfigPackage } from "@/lib/types";

const PKG_ICON: Record<string, React.ReactNode> = {
  sitemap: <Network size={18} />, users: <Users size={18} />, shuffle: <ArrowLeftRight size={18} />,
  "bar-chart": <BarChart3 size={18} />, target: <Target size={18} />, "id-badge": <Award size={18} />,
  coins: <Coins size={18} />, "file-text": <FileText size={18} />,
};
const PKG_TONE = ["#2563EB", "#0D9488", "#EA8A00", "#7C3AED", "#16A34A", "#E11D48", "#0EA5E9", "#64748B"];
const ST_ICON: Record<string, React.ReactNode> = {
  "Customer Service": <Headphones size={16} />, Inspection: <Search size={16} />, HR: <Users size={16} />,
  Finance: <Coins size={16} />, IT: <Cpu size={16} />, Strategy: <Rocket size={16} />, "Data & Digital": <Database size={16} />,
};

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} className="relative h-5 w-9 rounded-full transition-colors" style={{ backgroundColor: on ? "#2563EB" : "#CBD5E1" }}>
      <span className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

export function DataCollection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setPersona } = usePersona();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const { data } = useQuery({ queryKey: ["config"], queryFn: api.config });

  const toggleExpand = (id: number) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const patchToggle = async (p: ConfigPackage) => {
    await api.patchPackage(p.id, !p.mandatory_enabled);
    qc.invalidateQueries({ queryKey: ["config"] });
    toast.success(`${p.name} mandatory fields ${!p.mandatory_enabled ? "enabled" : "disabled"}.`);
  };
  const publish = async () => {
    const r = await api.publishConfig();
    qc.invalidateQueries();
    toast.success(r.message);
  };
  const previewEntity = () => { setPersona("entity-dm"); qc.clear(); navigate("/entity/home"); };

  const c = data?.cycle;
  const k = data?.kpis;

  return (
    <>
      <PageHeader
        title="DGHR Data Request Configuration"
        subtitle="Define what data government entities must submit, how it should be structured, and the rules for submission, review, and approval."
      />
      <PageBody>
        {/* Cycle bar */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-text2">Current Collection Cycle</span>
          <div className="flex items-center gap-2 rounded-btn border border-border bg-white px-3 py-2 text-sm font-semibold text-text1">
            {c?.name ?? "…"} <ChevronRight size={14} className="rotate-90 text-text3" />
          </div>
          <button className="flex h-9 w-9 items-center justify-center rounded-btn border border-border text-text2"><CalendarDays size={16} /></button>
          {c && <StatusBadge value="active" label="● Active" />}
          {c && <span className="text-sm text-text3">{c.starts_on} – {c.ends_on}</span>}
        </div>

        {/* KPIs */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <KpiCard tone="blue" icon={<Boxes size={20} />} value={k?.data_packages} label="Data Packages" sublabel="Configured" />
          <KpiCard tone="green" icon={<ClipboardList size={20} />} value={k?.total_fields} label="Total Fields" sublabel={`${k?.mandatory_fields ?? 0} Mandatory · ${k?.optional_fields ?? 0} Optional`} />
          <KpiCard tone="orange" icon={<FileText size={20} />} value={k?.section_types} label="Section-Type Templates" sublabel="Configured" />
          <KpiCard tone="purple" icon={<CalendarDays size={20} />} value={c?.deadline} label="Submission Deadline" sublabel={`${k?.days_remaining ?? 0} days remaining`} />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* packages table */}
          <Card className="col-span-8">
            <div className="flex items-center justify-between px-5 pt-5">
              <h3 className="text-base font-semibold text-text1">Data Packages <span className="text-text3">(Configuration Overview)</span></h3>
              <Button variant="secondary" size="sm" onClick={() => setExpanded(expanded.size ? new Set() : new Set(data?.packages.map((p) => p.id)))}>
                <Maximize2 size={14} /> Expand All
              </Button>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-[1fr_70px_92px_90px_100px_90px_28px] gap-2 px-2 py-2 text-[11px] font-semibold uppercase text-text3">
                <span>Data Package</span><span>Fields</span><span>Mand / Opt</span><span>Evidence</span><span>Applicability</span><span>Status</span><span />
              </div>
              {(data?.packages ?? []).map((p, i) => (
                <div key={p.id} className="rounded-lg border border-transparent hover:border-border">
                  <div className="grid grid-cols-[1fr_70px_92px_90px_100px_90px_28px] items-center gap-2 px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: PKG_TONE[i % PKG_TONE.length] }}>{PKG_ICON[p.icon_key]}</span>
                      <div><div className="text-sm font-semibold text-text1">{p.position}. {p.name}</div><div className="text-[11px] text-text3 line-clamp-1">{p.description}</div></div>
                    </div>
                    <span className="text-sm text-text2">{p.total_fields} fields</span>
                    <span className="flex items-center gap-1.5 text-sm text-text2">
                      {p.mandatory_fields}/{p.optional_fields}
                      <Toggle on={p.mandatory_enabled} onChange={() => patchToggle(p)} />
                    </span>
                    <span className="text-xs"><StatusBadge value={p.evidence_required === "yes" ? "mapped" : "partial"} label={p.evidence_required === "yes" ? "Yes" : "Optional"} /><div className="mt-0.5 text-[10px] text-text3">{p.evidence_fields_label}</div></span>
                    <span className="text-xs text-text3" title={p.section_types.join(", ")}>{p.section_types.length} types</span>
                    <StatusBadge value="configured" label="Configured" />
                    <button onClick={() => toggleExpand(p.id)} className="text-text3 hover:text-text1"><MoreHorizontal size={16} /></button>
                  </div>
                  {expanded.has(p.id) && (
                    <div className="flex flex-wrap gap-1.5 px-2 pb-3 pl-14">
                      {p.field_groups.map((g) => (
                        <span key={g.name} className="rounded-full bg-page px-2.5 py-1 text-[11px] text-text2">{g.name} · {g.field_count}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* right rail */}
          <div className="col-span-4 space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text1">Section-Type Templates</h3>
                <button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">Manage →</button>
              </div>
              <div className="space-y-1.5">
                {(data?.section_types ?? []).map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-white">{ST_ICON[s.name]}</span>
                    <div className="flex-1"><div className="text-sm font-semibold text-text1">{s.name}</div><div className="text-[11px] text-text3">{s.description}</div></div>
                    <StatusBadge value="active" label="Active" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text1">Configuration Options</h3>
                <button onClick={() => toast.success("Deadline editing available (demo).")} className="text-xs font-semibold text-primary hover:underline">Edit</button>
              </div>
              <div className="space-y-2.5 text-sm">
                {[
                  ["Submission Due Date", c?.deadline], ["Late Submission Policy", c?.late_policy],
                  ["Reviewer Assignment Rule", c?.reviewer_rule], ["Reminders", c?.reminders_label],
                  ["Approval Workflow", c?.approval_workflow_label],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between"><span className="text-text2">{label}</span><span className="font-medium text-text1">{val}</span></div>
                ))}
                <div className="flex items-center justify-between"><span className="text-text2">Version Control</span><span className="flex items-center gap-1.5 font-medium text-text1">{c?.version_label} <StatusBadge value="active" label="Latest" /></span></div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold text-text1">Activity & Audit</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View all</button></div>
              <div className="flex items-center gap-2 text-sm text-text2"><CheckCircle2 size={15} className="text-success" /> {c?.version_label} updated by DGHR Admin · Today, 10:30 AM</div>
            </Card>
          </div>
        </div>

        {/* footer */}
        <div className="mt-4 flex items-center gap-3">
          <Button variant="secondary" onClick={previewEntity}><Eye size={16} /> Preview Entity View</Button>
          <Button variant="secondary" onClick={() => toast.success("Configuration saved.")}><Save size={16} /> Save Configuration</Button>
          <Button className="ml-auto" onClick={publish}><Send size={16} /> Publish Request Package</Button>
        </div>
      </PageBody>
    </>
  );
}
