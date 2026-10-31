"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, Modal, useToast } from "@/components/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";

type Plan = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  storageMb: number;
  ramMb: number;
  cpuMillis: number;
  maxServers: number;
  maxBackups: number;
  maxDomains: number;
  bandwidthGb: number;
  features: string[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
};

const empty: Plan = {
  id: 0,
  name: "",
  slug: "",
  description: "",
  priceCents: 0,
  storageMb: 500,
  ramMb: 256,
  cpuMillis: 250,
  maxServers: 1,
  maxBackups: 1,
  maxDomains: 1,
  bandwidthGb: 5,
  features: [],
  isActive: true,
  isDefault: false,
  sortOrder: 0,
};

export default function AdminPlans() {
  const [list, setList] = useState<Plan[] | null>(null);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [featuresText, setFeaturesText] = useState("");
  const toast = useToast();

  async function load() {
    const r = await fetch("/api/admin/plans");
    const d = await r.json();
    setList(d.plans ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  function openEdit(p: Plan | null) {
    const e = p ? { ...p } : { ...empty };
    setEdit(e);
    setFeaturesText(e.features.join("\n"));
  }

  async function save() {
    if (!edit) return;
    const body = {
      ...edit,
      features: featuresText.split("\n").map((s) => s.trim()).filter(Boolean),
      id: edit.id || undefined,
    };
    const r = await fetch("/api/admin/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    toast.show("Saved", "success");
    setEdit(null);
    load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this plan?")) return;
    const r = await fetch(`/api/admin/plans?id=${id}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plans</h1>
        <Button onClick={() => openEdit(null)}>
          <Plus size={14} /> New plan
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(list ?? []).map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">
                  {p.name}{" "}
                  {p.isDefault && <Badge variant="info">Default</Badge>}{" "}
                  {!p.isActive && <Badge variant="muted">Inactive</Badge>}
                </div>
                <div className="text-xs text-[color:var(--muted)]">{p.slug}</div>
              </div>
              <div className="flex gap-1">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)}>
                  <Pencil size={14} />
                </button>
                <button className="btn btn-ghost btn-sm text-red-400" onClick={() => remove(p.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <div className="mt-3 text-sm space-y-1">
              <div>${(p.priceCents / 100).toFixed(2)}/mo</div>
              <div className="text-xs text-[color:var(--muted)]">
                {p.maxServers} projects · {p.ramMb}MB RAM · {p.storageMb}MB storage · {p.cpuMillis}m CPU
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={edit?.id ? "Edit plan" : "New plan"} maxWidth="max-w-2xl">
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><Label>Slug</Label><Input value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></div>
            <div className="col-span-2"><Label>Description</Label><Input value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
            <div><Label>Price (cents)</Label><Input type="number" value={edit.priceCents} onChange={(e) => setEdit({ ...edit, priceCents: +e.target.value })} /></div>
            <div><Label>Storage (MB)</Label><Input type="number" value={edit.storageMb} onChange={(e) => setEdit({ ...edit, storageMb: +e.target.value })} /></div>
            <div><Label>RAM (MB)</Label><Input type="number" value={edit.ramMb} onChange={(e) => setEdit({ ...edit, ramMb: +e.target.value })} /></div>
            <div><Label>CPU (millis)</Label><Input type="number" value={edit.cpuMillis} onChange={(e) => setEdit({ ...edit, cpuMillis: +e.target.value })} /></div>
            <div><Label>Max projects</Label><Input type="number" value={edit.maxServers} onChange={(e) => setEdit({ ...edit, maxServers: +e.target.value })} /></div>
            <div><Label>Max backups</Label><Input type="number" value={edit.maxBackups} onChange={(e) => setEdit({ ...edit, maxBackups: +e.target.value })} /></div>
            <div><Label>Max domains</Label><Input type="number" value={edit.maxDomains} onChange={(e) => setEdit({ ...edit, maxDomains: +e.target.value })} /></div>
            <div><Label>Bandwidth (GB)</Label><Input type="number" value={edit.bandwidthGb} onChange={(e) => setEdit({ ...edit, bandwidthGb: +e.target.value })} /></div>
            <div><Label>Sort order</Label><Input type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: +e.target.value })} /></div>
            <div className="col-span-2">
              <Label>Features (one per line)</Label>
              <textarea className="textarea" value={featuresText} onChange={(e) => setFeaturesText(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.isDefault} onChange={(e) => setEdit({ ...edit, isDefault: e.target.checked })} />
              Default plan
            </label>
            <div className="col-span-2 flex justify-end gap-2 mt-2">
              <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
              <Button onClick={save}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      {toast.element}
    </div>
  );
}
