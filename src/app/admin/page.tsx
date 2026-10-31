"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { Server, Users, Activity, HardDrive } from "lucide-react";
import { formatBytes, timeAgo } from "@/lib/utils";

type Overview = {
  users: number;
  activeUsers: number;
  servers: number;
  running: number;
  stopped: number;
  storageMb: number;
  activity: Array<{ id: number; action: string; detail: string | null; createdAt: string }>;
  audit: Array<{ id: number; action: string; targetType: string; targetId: string | null; createdAt: string }>;
};

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((d) => setData(d));
  }, []);

  if (!data) return <div className="skeleton h-32" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform overview</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Users size={16} />} label="Users" value={data.users} hint={`${data.activeUsers} active`} />
        <Stat icon={<Server size={16} />} label="Projects" value={data.servers} hint={`${data.running} running`} />
        <Stat icon={<Activity size={16} />} label="Stopped" value={data.stopped} />
        <Stat
          icon={<HardDrive size={16} />}
          label="Storage"
          value={formatBytes(data.storageMb * 1024 * 1024)}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card padding="p-0">
          <div className="px-5 py-4 border-b border-[color:var(--border)]">
            <h3 className="font-semibold">User activity</h3>
          </div>
          <ul className="divide-y divide-[color:var(--border)] max-h-96 overflow-y-auto">
            {data.activity.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm flex justify-between gap-4">
                <span>
                  <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                  {a.detail && <span className="text-[color:var(--muted)]"> — {a.detail}</span>}
                </span>
                <span className="text-xs text-[color:var(--muted)] shrink-0">
                  {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card padding="p-0">
          <div className="px-5 py-4 border-b border-[color:var(--border)]">
            <h3 className="font-semibold">Audit log</h3>
          </div>
          <ul className="divide-y divide-[color:var(--border)] max-h-96 overflow-y-auto">
            {data.audit.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm flex justify-between gap-4">
                <span>
                  <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                  <span className="text-[color:var(--muted)]"> · {a.targetType}</span>
                </span>
                <span className="text-xs text-[color:var(--muted)] shrink-0">
                  {timeAgo(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-[color:var(--muted)]">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {hint && <div className="text-xs text-[color:var(--muted)] mt-1">{hint}</div>}
        </div>
        <div className="w-8 h-8 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 flex items-center justify-center">
          {icon}
        </div>
      </div>
    </Card>
  );
}
