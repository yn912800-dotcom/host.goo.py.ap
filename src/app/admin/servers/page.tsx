"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, StatusBadge, useToast } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

type Server = {
  id: string;
  name: string;
  status: string;
  runtime: string;
  runtimeVersion: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  ownerEmail: string | null;
  ownerName: string | null;
};

export default function AdminServers() {
  const [list, setList] = useState<Server[] | null>(null);
  const toast = useToast();
  async function load() {
    const r = await fetch("/api/admin/servers");
    const d = await r.json();
    setList(d.servers ?? []);
  }
  useEffect(() => {
    load();
  }, []);

  async function act(serverId: string, action: string) {
    const r = await fetch("/api/admin/servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ serverId, action }),
    });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    toast.show("Done", "success");
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">All projects</h1>
      <Card padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[color:var(--muted)] uppercase tracking-wider border-b border-[color:var(--border)]">
              <tr>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Runtime</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {!list ? (
                <tr><td colSpan={6} className="p-6 text-center text-[color:var(--muted)]">Loading...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-[color:var(--muted)]">No projects</td></tr>
              ) : (
                list.map((s) => (
                  <tr key={s.id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <Link href={`/dashboard/servers/${s.id}`} className="font-medium hover:text-indigo-300">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>{s.ownerName}</div>
                      <div className="text-xs text-[color:var(--muted)]">{s.ownerEmail}</div>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {s.runtime} {s.runtimeVersion}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-xs text-[color:var(--muted)]">{timeAgo(s.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end flex-wrap">
                        <Button size="sm" variant="secondary" onClick={() => act(s.id, "start")}>Start</Button>
                        <Button size="sm" variant="secondary" onClick={() => act(s.id, "stop")}>Stop</Button>
                        <Button size="sm" variant="secondary" onClick={() => act(s.id, "restart")}>Restart</Button>
                        <Button size="sm" variant="secondary" onClick={() => act(s.id, "suspend")}>Suspend</Button>
                        <Button size="sm" variant="danger" onClick={() => confirm("Delete?") && act(s.id, "delete")}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      {toast.element}
    </div>
  );
}
