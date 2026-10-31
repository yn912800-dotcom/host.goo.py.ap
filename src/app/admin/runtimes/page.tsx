"use client";
import { useEffect, useState } from "react";
import { Badge, Card, useToast } from "@/components/ui";

type Runtime = {
  id: number;
  type: string;
  version: string;
  displayName: string;
  isInstalled: boolean;
  isEnabled: boolean;
  isDefault: boolean;
};

export default function AdminRuntimes() {
  const [list, setList] = useState<Runtime[] | null>(null);
  const toast = useToast();

  async function load() {
    const r = await fetch("/api/admin/runtimes");
    const d = await r.json();
    setList(d.runtimes ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function patch(id: number, body: Partial<Runtime>) {
    const r = await fetch("/api/admin/runtimes", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Runtimes</h1>
      <Card padding="p-0">
        <ul className="divide-y divide-[color:var(--border)]">
          {(list ?? []).map((r) => (
            <li key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-medium">
                  {r.displayName}{" "}
                  {r.isDefault && <Badge variant="info">Default</Badge>}
                  {!r.isInstalled && <Badge variant="warn">Not installed</Badge>}
                </div>
                <div className="text-xs text-[color:var(--muted)] mt-0.5">
                  {r.type} · {r.version}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.isEnabled} onChange={(e) => patch(r.id, { isEnabled: e.target.checked })} />
                  Enabled
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.isInstalled} onChange={(e) => patch(r.id, { isInstalled: e.target.checked })} />
                  Installed
                </label>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {toast.element}
    </div>
  );
}
