import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, Plus, Pencil, ArrowRight, Layers, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { usePersona, personaForEntity } from "@/stores/persona";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageBody } from "@/components/shared/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/shared/KpiCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { Modal, Field, TextInput, Select } from "@/components/shared/Modal";
import type { TrackerRow } from "@/lib/types";

const WAVES = ["W1", "W2", "W3"];

function EntityDialog({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: TrackerRow | null; // null = create
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [wave, setWave] = useState("W1");
  const [due, setDue] = useState("");

  // seed fields when opening
  useEffect(() => {
    if (!open) return;
    setName(row?.name ?? "");
    setCode(row?.code ?? "");
    setWave(row?.wave ?? "W1");
    setDue(row?.due_date ?? "");
  }, [open, row]);

  const save = async () => {
    if (!name.trim()) return toast.error("Entity name is required.");
    if (!row && !code.trim()) return toast.error("Entity code is required.");
    setBusy(true);
    try {
      if (row) {
        await api.patchEntity(row.id, { name, wave, due_date: due || undefined });
        toast.success("Entity updated.");
      } else {
        await api.createEntity({ name, code: code.trim().toUpperCase(), wave, due_date: due || undefined });
        toast.success(`Entity “${name}” onboarded.`);
      }
      await qc.invalidateQueries();
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
      title={row ? `Edit Entity — ${row.name}` : "Onboard New Entity"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : row ? "Save Changes" : "Onboard Entity"}</Button>
        </>
      }
    >
      <Field label="Entity name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dubai Sports Council" />
      </Field>
      <Field label="Entity code" hint={row ? "Code cannot be changed after onboarding." : "Short unique code, e.g. DSC"}>
        <TextInput value={code} onChange={(e) => setCode(e.target.value)} disabled={!!row} placeholder="DSC" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Wave">
          <Select value={wave} onChange={(e) => setWave(e.target.value)}>
            {WAVES.map((w) => <option key={w} value={w}>{w}</option>)}
          </Select>
        </Field>
        <Field label="Due date">
          <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function Entities() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setPersonaObject } = usePersona();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ open: boolean; row: TrackerRow | null }>({ open: false, row: null });

  const { data } = useQuery({
    queryKey: ["entities-manage", search],
    queryFn: () => api.tracker({ search: search || undefined, page: 1, page_size: 100 }),
  });

  const rows = data?.rows ?? [];
  const k = data?.kpis;

  const openAs = (row: TrackerRow) => {
    setPersonaObject(personaForEntity({ id: row.id, name: row.name, code: row.code, wave: row.wave }));
    qc.clear();
    navigate("/entity/home");
  };

  return (
    <>
      <PageHeader
        title="Entities"
        subtitle="Manage Dubai Government entities, onboard new ones, and open any entity's portal."
        actions={
          <Button onClick={() => setDialog({ open: true, row: null })}>
            <Plus size={16} /> Add Entity
          </Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-4 gap-4">
          <KpiCard tone="blue" icon={<Building2 size={20} />} value={k?.total_entities} label="Total Entities" sublabel="In the current cycle" />
          <KpiCard tone="green" icon={<CheckCircle2 size={20} />} value={k?.submitted_entities.value} label="Submitted" sublabel={`${k?.submitted_entities.pct ?? 0}% of entities`} />
          <KpiCard tone="orange" icon={<Clock size={20} />} value={k?.overdue.value} label="Overdue" sublabel={`${k?.overdue.pct ?? 0}% of entities`} />
          <KpiCard tone="purple" icon={<Layers size={20} />} value={k?.avg_completeness} label="Avg Completeness" sublabel="Across all entities" />
        </div>

        <Card className="mt-4 overflow-hidden">
          <div className="flex items-center gap-2 p-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entities by name or code…"
              className="h-9 w-80 rounded-btn border border-border px-3 text-sm"
            />
            <span className="ml-auto text-sm text-text3">{rows.length} shown</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-y border-border text-[11px] uppercase text-text3">
                  <th className="px-4 py-2.5 font-semibold">Entity</th>
                  <th className="px-3 py-2.5 font-semibold">Code</th>
                  <th className="px-3 py-2.5 font-semibold">Wave</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Completeness</th>
                  <th className="px-3 py-2.5 font-semibold">Reviewer</th>
                  <th className="px-3 py-2.5 font-semibold">Due</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border hover:bg-page">
                    <td className="px-4 py-2.5 font-medium text-text1">{r.name}</td>
                    <td className="px-3 py-2.5 text-text2">{r.code}</td>
                    <td className="px-3 py-2.5 text-text2">{r.wave}</td>
                    <td className="px-3 py-2.5"><StatusBadge value={r.status} label={r.status_label} /></td>
                    <td className="px-3 py-2.5 w-40">
                      <div className="mb-1 text-xs text-text2">{r.completeness}%</div>
                      <ProgressBar value={r.completeness} />
                    </td>
                    <td className="px-3 py-2.5 text-text2">{r.reviewer ?? "—"}</td>
                    <td className="px-3 py-2.5 text-text2">{r.due_date ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setDialog({ open: true, row: r })}>
                          <Pencil size={13} /> Edit
                        </Button>
                        <Button size="sm" onClick={() => openAs(r)}>
                          Open <ArrowRight size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-text3">No entities match your search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </PageBody>

      <EntityDialog open={dialog.open} row={dialog.row} onClose={() => setDialog({ open: false, row: null })} />
    </>
  );
}
