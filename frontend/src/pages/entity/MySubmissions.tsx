import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useAudience } from "@/lib/hooks";
import { relativeTime } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";

export function MySubmissions() {
  const { entityId } = useAudience();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["my-submissions", entityId],
    queryFn: () => api.mySubmissions(entityId!),
    enabled: entityId != null,
    refetchInterval: 4000,
  });

  return (
    <>
      <PageHeader title="My Submissions" subtitle="Your entity's data packages and their status." />
      <PageBody>
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#EEF2F7] text-[11px] uppercase text-text3">
                <th className="px-5 py-3 font-semibold">Package</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Progress</th>
                <th className="px-3 py-3 font-semibold">Last Updated</th>
                <th className="px-3 py-3 font-semibold">Reviewer Comments</th>
                <th className="px-5 py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.key} className="border-b border-[#EEF2F7] hover:bg-[#F8FAFC]">
                  <td className="px-5 py-3.5 font-semibold text-text1">{r.name}</td>
                  <td className="px-3 py-3.5"><StatusBadge value={r.status} label={r.status_label} /></td>
                  <td className="px-3 py-3.5 w-48"><div className="mb-1 text-xs font-semibold text-text2">{r.progress}%</div><ProgressBar value={r.progress} /></td>
                  <td className="px-3 py-3.5 text-text2">{r.updated_at ? relativeTime(r.updated_at) : "—"}</td>
                  <td className="px-3 py-3.5"><span className="inline-flex items-center gap-1.5 text-text2"><MessageSquare size={14} className="text-text3" /> {r.comments}</span></td>
                  <td className="px-5 py-3.5 text-right">
                    <Button size="sm" variant={r.action === "Continue" ? "primary" : "secondary"} onClick={() => navigate(`/entity/${r.route.replace("?tab=evidence", "")}`)}>{r.action}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </PageBody>
    </>
  );
}
