import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Modal, Field, TextArea, Select, Button } from "@/components/shared/Modal";

const PACKAGES = [
  { key: "org_structure", label: "Organization Structure" },
  { key: "current_workforce", label: "Current Workforce Data" },
  { key: "workload_service", label: "Workload & Service Data" },
  { key: "future_drivers", label: "Future Demand Drivers" },
  { key: "evidence_documents", label: "Evidence & Documents" },
];

// MD-01 — Open Clarification (DGHR side): editable summary/corrections, priority, category.
export function OpenClarificationModal({
  open, onClose, entityId, entityName, prefill,
}: {
  open: boolean; onClose: () => void; entityId: number | null; entityName?: string;
  prefill?: { summary?: string; package_label?: string };
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pkg, setPkg] = useState(PACKAGES[1].label);
  const [priority, setPriority] = useState("Medium");
  const [category, setCategory] = useState("Data Quality");
  const [summary, setSummary] = useState("");
  const [corrections, setCorrections] = useState("");

  useEffect(() => {
    if (!open) return;
    setPkg(prefill?.package_label ?? PACKAGES[1].label);
    setPriority("Medium");
    setCategory("Data Quality");
    setSummary(prefill?.summary ?? "");
    setCorrections("");
  }, [open, prefill]);

  const submit = async () => {
    if (entityId == null || !summary.trim()) return toast.error("Please describe the clarification.");
    setBusy(true);
    try {
      const r = await api.createCase({
        entity_id: entityId, issue_summary: summary, package_label: pkg, priority, category,
        corrections: corrections.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      await qc.invalidateQueries();
      toast.warning(`Clarification ${r.ref} sent${entityName ? ` to ${entityName}` : ""}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to open clarification.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Open Clarification${entityName ? ` — ${entityName}` : ""}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !summary.trim()}>{busy ? "Sending…" : "Send Clarification"}</Button>
      </>}>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Data package"><Select value={pkg} onChange={(e) => setPkg(e.target.value)}>{PACKAGES.map((p) => <option key={p.key}>{p.label}</option>)}</Select></Field>
        <Field label="Priority"><Select value={priority} onChange={(e) => setPriority(e.target.value)}>{["High", "Medium", "Low"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <Field label="Category"><Select value={category} onChange={(e) => setCategory(e.target.value)}>{["Data Quality", "Completeness", "Consistency", "Evidence"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <Field label="Issue summary"><TextArea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What needs clarifying…" /></Field>
      <Field label="Requested corrections" hint="One per line (optional)"><TextArea rows={2} value={corrections} onChange={(e) => setCorrections(e.target.value)} /></Field>
    </Modal>
  );
}

// MD-02 — Return Submission (DGHR side): package + required reason.
export function ReturnSubmissionModal({
  open, onClose, entityId, entityName,
}: {
  open: boolean; onClose: () => void; entityId: number | null; entityName?: string;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [pkg, setPkg] = useState(PACKAGES[1].key);
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) { setPkg(PACKAGES[1].key); setReason(""); } }, [open]);

  const submit = async () => {
    if (entityId == null || !reason.trim()) return toast.error("A reason is required to return a submission.");
    setBusy(true);
    try {
      const r = await api.returnSubmission({ entity_id: entityId, package_key: pkg, reason });
      await qc.invalidateQueries();
      toast.warning(`${r.ref} — submission returned${entityName ? ` to ${entityName}` : ""}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to return submission.");
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Return Submission${entityName ? ` — ${entityName}` : ""}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={submit} disabled={busy || !reason.trim()}>{busy ? "Returning…" : "Return for Correction"}</Button>
      </>}>
      <Field label="Data package"><Select value={pkg} onChange={(e) => setPkg(e.target.value)}>{PACKAGES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</Select></Field>
      <Field label="Reason (required)"><TextArea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain what must be corrected before resubmission…" /></Field>
    </Modal>
  );
}
