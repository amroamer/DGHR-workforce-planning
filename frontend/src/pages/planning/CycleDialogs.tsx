import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, CalendarPlus } from "lucide-react";
import { Modal, Field, TextInput, Select, Button } from "@/components/shared/Modal";
import { api } from "@/lib/api";
import type { CycleExtensionRow } from "@/lib/planning";

type ScopeMode = "all" | "selected";

// Shared scope picker: "All entities" or a chosen subset. When 'selected', shows every entity as a
// toggle chip. Used both when creating a cycle and when editing an existing cycle's scope.
function ScopePicker({
  mode,
  ids,
  onMode,
  onToggle,
}: {
  mode: ScopeMode;
  ids: number[];
  onMode: (m: ScopeMode) => void;
  onToggle: (id: number) => void;
}) {
  const { data: entities } = useQuery({ queryKey: ["q-entities-list"], queryFn: api.entitiesList });
  return (
    <Field label="Who submits this cycle">
      <div className="mb-2 inline-flex rounded-lg border border-border p-0.5">
        {(["all", "selected"] as const).map((m) => (
          <button key={m} type="button" onClick={() => onMode(m)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${mode === m ? "bg-primary text-white" : "text-text2 hover:bg-page"}`}>
            {m === "all" ? "All entities" : "Selected entities"}
          </button>
        ))}
      </div>
      {mode === "selected" && (
        <div className="flex flex-wrap gap-1.5">
          {(entities ?? []).map((e) => (
            <button key={e.id} type="button" onClick={() => onToggle(e.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${ids.includes(e.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-text2 hover:bg-page"}`}>
              {e.code}
            </button>
          ))}
          <span className="w-full pt-1 text-[11px] text-text3">{ids.length} selected. Only these entities will see the cycle.</span>
        </div>
      )}
    </Field>
  );
}

// Create the next collection cycle. It starts as a DRAFT — configured but invisible to entities —
// so the "New cycle" action is never itself the thing that opens a window to everyone. Opening is a
// separate, deliberate step on the Admin screen.
export function NewCycleDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", starts_on: "", ends_on: "", deadline: "", auto_close: true });
  const [mode, setMode] = useState<ScopeMode>("all");
  const [ids, setIds] = useState<number[]>([]);
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const toggle = (id: number) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  useEffect(() => {
    if (open) { setForm({ name: "", starts_on: "", ends_on: "", deadline: "", auto_close: true }); setMode("all"); setIds([]); }
  }, [open]);

  const save = async () => {
    if (!form.name.trim()) return toast.error("Give the cycle a name.");
    if (!form.starts_on || !form.ends_on || !form.deadline) return toast.error("Set the open, close and deadline dates.");
    if (form.ends_on < form.starts_on) return toast.error("The close date can't fall before the open date.");
    if (mode === "selected" && ids.length === 0) return toast.error("Pick at least one entity, or choose “All entities”.");
    setBusy(true);
    try {
      const c = await api.planning.createCycle({ ...form, scope_mode: mode, scope_entity_ids: mode === "selected" ? ids : [] });
      await qc.invalidateQueries();
      toast.success(`Draft cycle “${c.name}” created. Open it when you're ready.`);
      onCreated?.(c.id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the cycle.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New collection cycle"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Creating…" : "Create draft"}</Button>
        </>
      }
    >
      <Field label="Cycle name">
        <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. FY2028 Planning Cycle" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Opens"><TextInput type="date" value={form.starts_on} onChange={(e) => set({ starts_on: e.target.value })} /></Field>
        <Field label="Closes"><TextInput type="date" value={form.ends_on} onChange={(e) => set({ ends_on: e.target.value })} /></Field>
        <Field label="Deadline"><TextInput type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} /></Field>
      </div>
      <ScopePicker mode={mode} ids={ids} onMode={setMode} onToggle={toggle} />
      <label className="flex items-start gap-2 text-sm text-text2">
        <input type="checkbox" className="mt-0.5 accent-primary" checked={form.auto_close} onChange={(e) => set({ auto_close: e.target.checked })} />
        <span>Automatically close on the deadline. You can also close it early by hand at any time.</span>
      </label>
      <p className="text-xs text-text3">The cycle is created as a draft. Entities see it only once you open it.</p>
    </Modal>
  );
}

// Change which entities an existing cycle targets — works on a draft or an open cycle.
export function ScopeDialog({
  open,
  onClose,
  cycle,
}: {
  open: boolean;
  onClose: () => void;
  cycle: { id: number; name: string; scope_mode: "all" | "selected"; scope_entity_ids: number[] | null } | null;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<ScopeMode>("all");
  const [ids, setIds] = useState<number[]>([]);
  const toggle = (id: number) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  useEffect(() => {
    if (open && cycle) { setMode(cycle.scope_mode); setIds(cycle.scope_entity_ids ?? []); }
  }, [open, cycle]);

  const save = async () => {
    if (!cycle) return;
    if (mode === "selected" && ids.length === 0) return toast.error("Pick at least one entity, or choose “All entities”.");
    setBusy(true);
    try {
      await api.planning.setCycleScope(cycle.id, { scope_mode: mode, scope_entity_ids: mode === "selected" ? ids : [] });
      await qc.invalidateQueries();
      toast.success("Cycle scope updated.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the scope.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cycle ? `Scope: ${cycle.name}` : "Scope"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save scope"}</Button>
        </>
      }
    >
      <ScopePicker mode={mode} ids={ids} onMode={setMode} onToggle={toggle} />
    </Modal>
  );
}

// Grant or revoke per-entity deadline extensions for a cycle. An extension gives that entity a later
// deadline and defers the cycle's auto-close until it expires — the "some entities always ask" case.
export function ExtensionsDialog({
  open,
  onClose,
  cycle,
}: {
  open: boolean;
  onClose: () => void;
  cycle: { id: number; name: string; deadline: string | null; extensions?: CycleExtensionRow[] } | null;
}) {
  const qc = useQueryClient();
  const { data: entities } = useQuery({ queryKey: ["q-entities-list"], queryFn: api.entitiesList });
  const [busy, setBusy] = useState(false);
  const [entityId, setEntityId] = useState(0);
  const [dl, setDl] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) { setEntityId(0); setDl(""); setReason(""); }
  }, [open]);

  const rows = cycle?.extensions ?? [];
  const grant = async () => {
    if (!cycle) return;
    if (!entityId) return toast.error("Pick an entity.");
    if (!dl) return toast.error("Set the extended deadline.");
    if (cycle.deadline && dl <= cycle.deadline) return toast.error("The extension must be later than the cycle deadline.");
    setBusy(true);
    try {
      await api.planning.grantExtension(cycle.id, { entity_id: entityId, extended_deadline: dl, reason });
      await qc.invalidateQueries();
      toast.success("Extension granted.");
      setEntityId(0); setDl(""); setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't grant the extension.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (ext: CycleExtensionRow) => {
    if (!cycle) return;
    try {
      await api.planning.revokeExtension(cycle.id, ext.id);
      await qc.invalidateQueries();
      toast.success(`Extension revoked for ${ext.code}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't revoke.");
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cycle ? `Deadline extensions: ${cycle.name}` : "Deadline extensions"}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      <div className="mb-3 text-xs text-text3">Cycle deadline: <b className="text-text2">{cycle?.deadline ?? "—"}</b>. An extension applies to one entity and keeps the window open for it past the deadline.</div>
      {rows.length > 0 && (
        <div className="mb-4 divide-y divide-border rounded-lg border border-border">
          {rows.map((x) => (
            <div key={x.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text1">{x.entity} <span className="text-text3">| {x.extended_deadline}</span></div>
                {x.reason && <div className="truncate text-[11px] text-text3">{x.reason}</div>}
              </div>
              <button onClick={() => revoke(x)} className="text-text3 hover:text-danger" aria-label={`Revoke extension for ${x.code}`}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Entity">
          <Select value={entityId} onChange={(e) => setEntityId(Number(e.target.value))}>
            <option value={0}>Select entity…</option>
            {(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Extended deadline"><TextInput type="date" min={cycle?.deadline ?? undefined} value={dl} onChange={(e) => setDl(e.target.value)} /></Field>
      </div>
      <Field label="Reason (optional)"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. HR system migration overran" /></Field>
      <Button onClick={grant} disabled={busy}><CalendarPlus size={15} /> {busy ? "Granting…" : "Grant extension"}</Button>
    </Modal>
  );
}
