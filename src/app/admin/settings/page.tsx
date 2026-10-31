"use client";
import { useEffect, useState } from "react";
import { Button, Card, Input, Label, useToast } from "@/components/ui";

type Settings = {
  platformName?: string;
  description?: string;
  registrationEnabled?: boolean;
  googleLoginEnabled?: boolean;
  maintenanceMode?: boolean;
  defaultPlanSlug?: string;
  logRetentionDays?: number;
  metricsRetentionDays?: number;
  maxUploadMb?: number;
};

export default function AdminSettings() {
  const [s, setS] = useState<Settings | null>(null);
  const toast = useToast();

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setS(d.settings ?? {}));
  }, []);

  async function save() {
    const r = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s ?? {}),
    });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    toast.show("Saved", "success");
  }

  if (!s) return <div className="skeleton h-32" />;

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-2xl font-bold">System settings</h1>
      <Card>
        <div className="space-y-4">
          <div>
            <Label>Platform name</Label>
            <Input value={s.platformName ?? ""} onChange={(e) => setS({ ...s, platformName: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Input value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} />
          </div>
          <div>
            <Label>Default plan slug</Label>
            <Input value={s.defaultPlanSlug ?? ""} onChange={(e) => setS({ ...s, defaultPlanSlug: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Log retention (days)</Label>
              <Input type="number" value={s.logRetentionDays ?? 14} onChange={(e) => setS({ ...s, logRetentionDays: +e.target.value })} />
            </div>
            <div>
              <Label>Metrics retention (days)</Label>
              <Input type="number" value={s.metricsRetentionDays ?? 7} onChange={(e) => setS({ ...s, metricsRetentionDays: +e.target.value })} />
            </div>
            <div>
              <Label>Max upload (MB)</Label>
              <Input type="number" value={s.maxUploadMb ?? 50} onChange={(e) => setS({ ...s, maxUploadMb: +e.target.value })} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!s.registrationEnabled} onChange={(e) => setS({ ...s, registrationEnabled: e.target.checked })} />
            Enable new registrations
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!s.googleLoginEnabled} onChange={(e) => setS({ ...s, googleLoginEnabled: e.target.checked })} />
            Enable Google login (requires OAuth config in .env)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!s.maintenanceMode} onChange={(e) => setS({ ...s, maintenanceMode: e.target.checked })} />
            Maintenance mode (non-admin users will see a maintenance page)
          </label>
          <Button onClick={save}>Save</Button>
        </div>
      </Card>
      {toast.element}
    </div>
  );
}
