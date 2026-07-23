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
import { THEAD_TR, TH, TROW, TD } from "@/components/ui/table";

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
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className={THEAD_TR}>
                <th className="px-5 py-2.5">Package</th>
                <th className={TH}>Status</th>
                <th className={TH}>Progress</th>
                <th className={TH}>Last Updated</th>
                <th className={TH}>Reviewer Comments</th>
                <th className="px-5 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((r) => (
                <tr key={r.key} className={TROW}>
                  <td className="px-5 py-3.5 text-sm font-semibold text-text1">{r.name}</td>
                  <td className={TD}><StatusBadge value={r.status} label={r.status_label} /></td>
                  <td className="w-48 px-3 py-3.5"><div className="nums mb-1.5 text-xs font-semibold text-text2">{r.progress}%</div><ProgressBar value={r.progress} /></td>
                  <td className="px-3 py-3.5 text-sm text-text2">{r.updated_at ? relativeTime(r.updated_at) : "-"}</td>
                  <td className="px-3 py-3.5 text-sm"><span className="inline-flex items-center gap-1.5 text-text2"><MessageSquare size={14} className="text-text3" /> {r.comments}</span></td>
                  <td className="px-5 py-3.5 text-right">
                    <Button size="sm" variant={r.action === "Continue" ? "primary" : "secondary"} onClick={() => navigate(`/entity/${r.route.replace("?tab=evidence", "")}`)}>{r.action}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
