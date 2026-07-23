import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { api, type PackageInput } from "@/lib/api";
import type { ConfigPackage, ConfigPayload } from "@/lib/types";
import { Modal, Field, TextInput, TextArea, Select, Button } from "@/components/shared/Modal";

const ICON_KEYS = ["file-text", "sitemap", "users", "shuffle", "bar-chart", "target", "id-badge", "coins"];

// Add / edit a data package (DGHR authoring).
export function PackageDialog({
  open,
  onClose,
  pkg,
  allSectionTypes,
}: {
  open: boolean;
  onClose: () => void;
  pkg: ConfigPackage | null; // null = create
  allSectionTypes: string[];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PackageInput>({});
  const [sts, setSts] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: pkg?.name ?? "",
      description: pkg?.description ?? "",
      total_fields: pkg?.total_fields ?? 0,
      mandatory_fields: pkg?.mandatory_fields ?? 0,
      optional_fields: pkg?.optional_fields ?? 0,
      evidence_required: pkg?.evidence_required ?? "optional",
      icon_key: pkg?.icon_key ?? "file-text",
      applicable: true,
    });
    setSts(pkg?.section_types ?? []);
  }, [open, pkg]);

  const set = (p: Partial<PackageInput>) => setForm((f) => ({ ...f, ...p }));
  const toggleSt = (name: string) =>
    setSts((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const save = async () => {
    if (!form.name?.trim()) return toast.error("Package name is required.");
    setBusy(true);
    try {
      const body: PackageInput = { ...form, section_type_names: sts };
      if (pkg) {
        // The edit form has no applicability control — never flip EntityPackage.applicable
        // for all entities as a side effect of editing (e.g.) a description.
        delete body.applicable;
        await api.updatePackage(pkg.id, body);
      } else {
        await api.createPackage(body);
      }
      await qc.invalidateQueries();
      toast.success(pkg ? "Package updated." : "Package created.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pkg) return;
    if (!confirm(`Remove the “${pkg.name}” package for all entities?`)) return;
    setBusy(true);
    try {
      await api.deletePackage(pkg.id);
      await qc.invalidateQueries();
      toast.success("Package removed.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pkg ? `Edit Package: ${pkg.name}` : "Add Data Package"}
      footer={
        <>
          {pkg && (
            <Button variant="danger" onClick={remove} disabled={busy} className="mr-auto">
              <Trash2 size={15} /> Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : pkg ? "Save Changes" : "Create Package"}</Button>
        </>
      }
    >
      <Field label="Package name">
        <TextInput value={form.name ?? ""} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Skills & Competencies" />
      </Field>
      <Field label="Description">
        <TextArea rows={2} value={form.description ?? ""} onChange={(e) => set({ description: e.target.value })} placeholder="What this package collects…" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Total fields">
          <TextInput type="number" min={0} value={form.total_fields ?? 0} onChange={(e) => set({ total_fields: Number(e.target.value) })} />
        </Field>
        <Field label="Mandatory">
          <TextInput type="number" min={0} value={form.mandatory_fields ?? 0} onChange={(e) => set({ mandatory_fields: Number(e.target.value) })} />
        </Field>
        <Field label="Optional">
          <TextInput type="number" min={0} value={form.optional_fields ?? 0} onChange={(e) => set({ optional_fields: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Evidence required">
          <Select value={form.evidence_required} onChange={(e) => set({ evidence_required: e.target.value as "yes" | "optional" })}>
            <option value="optional">Optional</option>
            <option value="yes">Required</option>
          </Select>
        </Field>
        <Field label="Icon">
          <Select value={form.icon_key} onChange={(e) => set({ icon_key: e.target.value })}>
            {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Applies to section types">
        <div className="flex flex-wrap gap-1.5">
          {allSectionTypes.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => toggleSt(name)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${sts.includes(name) ? "border-primary bg-primary/10 text-primary" : "border-border text-text2"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </Field>
      {!pkg && (
        <label className="flex items-center gap-2 text-sm text-text2">
          <input type="checkbox" className="accent-primary" checked={form.applicable ?? true} onChange={(e) => set({ applicable: e.target.checked })} />
          Required from all entities (applicable by default)
        </label>
      )}
    </Modal>
  );
}

// Edit the collection cycle settings (deadline, dates, policies).
export function CycleDialog({
  open,
  onClose,
  cycle,
}: {
  open: boolean;
  onClose: () => void;
  cycle: ConfigPayload["cycle"];
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm({
      name: cycle.name,
      starts_on: cycle.starts_on,
      ends_on: cycle.ends_on,
      deadline: cycle.deadline,
      late_policy: cycle.late_policy,
      reviewer_rule: cycle.reviewer_rule,
      reminders_label: cycle.reminders_label,
      approval_workflow_label: cycle.approval_workflow_label,
    });
  }, [open, cycle]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      await api.patchCycle(cycle.id, form);
      await qc.invalidateQueries();
      toast.success("Cycle configuration saved.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cycle Configuration"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save Configuration"}</Button>
        </>
      }
    >
      <Field label="Cycle name">
        <TextInput value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Starts on"><TextInput type="date" value={form.starts_on ?? ""} onChange={(e) => set("starts_on", e.target.value)} /></Field>
        <Field label="Ends on"><TextInput type="date" value={form.ends_on ?? ""} onChange={(e) => set("ends_on", e.target.value)} /></Field>
        <Field label="Deadline"><TextInput type="date" value={form.deadline ?? ""} onChange={(e) => set("deadline", e.target.value)} /></Field>
      </div>
      <Field label="Late submission policy"><TextInput value={form.late_policy ?? ""} onChange={(e) => set("late_policy", e.target.value)} /></Field>
      <Field label="Reviewer assignment rule"><TextInput value={form.reviewer_rule ?? ""} onChange={(e) => set("reviewer_rule", e.target.value)} /></Field>
      <Field label="Reminders"><TextInput value={form.reminders_label ?? ""} onChange={(e) => set("reminders_label", e.target.value)} /></Field>
      <Field label="Approval workflow"><TextInput value={form.approval_workflow_label ?? ""} onChange={(e) => set("approval_workflow_label", e.target.value)} /></Field>
    </Modal>
  );
}
