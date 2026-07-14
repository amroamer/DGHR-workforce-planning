import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Files, HelpCircle, CalendarClock, ShieldCheck, Network, Users, BarChart3,
  TrendingUp, Paperclip, ChevronRight, ShieldQuestion, Megaphone, LifeBuoy, BookOpen, Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";

const PKG_ICON: Record<string, React.ReactNode> = {
  org_structure: <Network size={18} />, current_workforce: <Users size={18} />,
  workload_service: <BarChart3 size={18} />, future_drivers: <TrendingUp size={18} />,
  evidence_documents: <Paperclip size={18} />,
};

export function Home() {
  const { entityId } = useAudience();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["entity-home", entityId],
    queryFn: () => api.home(entityId!),
    enabled: entityId != null,
    refetchInterval: 4000,
  });
  const k = data?.kpis;
  const go = (route: string) => navigate(`/entity/${route.replace("?tab=evidence", "")}`);

  return (
    <>
      <PageHeader title="Entity Data Collection Home" subtitle="Submit your entity's workforce planning data as required by DGHR." />
      <PageBody>
        <div className="grid grid-cols-5 gap-4">
          <KpiCard tone="green" ring={k?.submission_progress ?? 0} label="Submission Progress" sublabel="Overall completion" />
          <KpiCard tone="blue" icon={<Files size={20} />} value={k?.required_packages} label="Required Packages" sublabel="All mandatory" />
          <KpiCard tone="orange" icon={<HelpCircle size={20} />} value={k?.pending_clarifications} label="Pending Clarifications" sublabel="Action required" />
          <KpiCard tone="purple" icon={<CalendarClock size={20} />} value={k?.days_to_deadline} label="Days to Next Deadline" sublabel={k?.deadline_date ?? ""} />
          <KpiCard tone="green" icon={<ShieldCheck size={20} />} value={k?.ready_for_review} label="Ready for Review" sublabel="Package ready" />
        </div>

        <div className="mt-4 grid grid-cols-12 gap-4">
          {/* required submissions */}
          <Card className="col-span-8 p-5">
            <h3 className="text-base font-semibold text-text1">Required Submissions</h3>
            <p className="mb-4 text-sm text-text2">Complete all required packages to submit your entity data.</p>
            <div className="space-y-2.5">
              {(data?.required_submissions ?? []).map((s) => (
                <div key={s.key} className="flex items-center gap-4 rounded-card border border-border p-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-page text-xs font-bold text-text2">{s.position}</span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10 text-success">{PKG_ICON[s.key]}</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-text1">{s.name}</div>
                    <div className="text-xs text-text3">{s.description}</div>
                  </div>
                  <div className="w-24 text-center"><StatusBadge value={s.status} label={s.status_label} /></div>
                  <div className="w-40"><div className="mb-1 text-right text-xs font-semibold text-text2">{s.progress}%</div><ProgressBar value={s.progress} /></div>
                  <Button size="sm" variant={s.action === "Continue" ? "primary" : "secondary"} onClick={() => go(s.route)}>{s.action}</Button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-text3"><ShieldCheck size={14} className="text-success" /> All submissions are secure and confidential.</div>
          </Card>

          {/* right rail */}
          <div className="col-span-4 space-y-4">
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-text1">DGHR Messages & Clarifications</h3><button onClick={() => navigate("/entity/clarifications")} className="text-xs font-semibold text-primary hover:underline">View all →</button></div>
              <div className="space-y-3">
                {(data?.messages ?? []).map((mg) => (
                  <button key={mg.id} onClick={() => navigate("/entity/clarifications")} className="flex w-full gap-2.5 text-left">
                    <span className="mt-0.5 shrink-0" style={{ color: mg.kind === "announcement" ? "#0EA5E9" : "#EA8A00" }}>
                      {mg.kind === "announcement" ? <Megaphone size={16} /> : <ShieldQuestion size={16} />}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5"><span className="text-sm font-semibold text-text1">{mg.title}</span>{!mg.read && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}</div>
                      <div className="text-xs text-text2">{mg.body}</div>
                      <div className="text-[11px] text-text3">{relativeTime(mg.created_at)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-text1">Upcoming Deadlines</h3><button onClick={() => toast.message("Available in the full release")} className="text-xs font-semibold text-primary hover:underline">View calendar →</button></div>
              <div className="space-y-2">
                {(data?.deadlines ?? []).map((dl, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <CalendarClock size={16} className="text-text3" />
                    <div className="flex-1"><div className="text-sm font-medium text-text1">{dl.label}</div><div className="text-[11px] text-text3">{dl.date}</div></div>
                    <span className="text-xs font-semibold text-warning">{dl.days_left} Days left</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* what to do next */}
        <Card className="mt-4 p-5">
          <h3 className="text-base font-semibold text-text1">What to do next</h3>
          <p className="mb-4 text-sm text-text2">Quick actions to help you complete your data collection.</p>
          <div className="grid grid-cols-5 gap-3">
            {[
              { icon: <Files size={18} />, title: "Continue My Progress", sub: "Pick up where you left off", onClick: () => { const s = data?.required_submissions.find((x) => x.status === "in_progress"); go(s?.route ?? "workforce"); } },
              { icon: <ShieldQuestion size={18} />, title: "Respond to Clarifications", sub: "Action required", badge: k?.pending_clarifications, onClick: () => navigate("/entity/clarifications") },
              { icon: <Upload size={18} />, title: "Upload Evidence", sub: "Add supporting documents", onClick: () => navigate("/entity/demand-drivers") },
              { icon: <BookOpen size={18} />, title: "View Guidance", sub: "Access templates and FAQs", onClick: () => toast.message("Available in the full release") },
              { icon: <LifeBuoy size={18} />, title: "Contact DGHR", sub: "Get help and support", onClick: () => toast.message("Available in the full release") },
            ].map((a) => (
              <button key={a.title} onClick={a.onClick} className="relative flex items-center gap-3 rounded-card border border-border p-3 text-left hover:bg-page">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-info-bg text-info">{a.icon}</span>
                <div className="flex-1"><div className="text-sm font-semibold text-text1">{a.title}</div><div className="text-[11px] text-text3">{a.sub}</div></div>
                {a.badge ? <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">{a.badge}</span> : null}
                <ChevronRight size={16} className="text-text3" />
              </button>
            ))}
          </div>
        </Card>
      </PageBody>
    </>
  );
}
