import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Modal, Button } from "@/components/shared/Modal";

// MD-07 / G-11 — submit guard: lists real open issues, never hard-blocks ("Submit anyway").
export function SubmitGuardModal({
  open, onClose, packageName, issues, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  packageName: string;
  issues: string[];
  onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(); onClose(); } finally { setBusy(false); }
  };
  const hasIssues = issues.length > 0;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Submit ${packageName}?`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} disabled={busy}>{busy ? "Submitting…" : hasIssues ? "Submit anyway" : "Submit for Review"}</Button>
      </>}
    >
      {hasIssues ? (
        <>
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <AlertTriangle size={16} /> {issues.length} open item{issues.length > 1 ? "s" : ""} before submission
          </div>
          <p className="text-sm text-text2">You can still submit — DGHR will review these during validation.</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-text1">
            {issues.map((i, idx) => <li key={idx}>{i}</li>)}
          </ul>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text1"><CheckCircle2 size={16} className="text-success" /> All checks passed. This package is ready to submit to DGHR.</div>
      )}
    </Modal>
  );
}
