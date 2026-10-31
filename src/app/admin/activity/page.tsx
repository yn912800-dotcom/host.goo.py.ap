"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

type Overview = {
  activity: Array<{ id: number; action: string; detail: string | null; createdAt: string }>;
  audit: Array<{ id: number; action: string; targetType: string; targetId: string | null; createdAt: string }>;
};

export default function AdminActivity() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then((d) => setData(d));
  }, []);
  if (!data) return <div className="skeleton h-32" />;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Activity</h1>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card padding="p-0">
          <div className="px-5 py-4 border-b border-[color:var(--border)]">
            <h3 className="font-semibold">User activity</h3>
          </div>
          <ul className="divide-y divide-[color:var(--border)] max-h-[600px] overflow-y-auto">
            {data.activity.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm flex justify-between gap-4">
                <span>
                  <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                  {a.detail && <span className="text-[color:var(--muted)]"> — {a.detail}</span>}
                </span>
                <span className="text-xs text-[color:var(--muted)] shrink-0">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card padding="p-0">
          <div className="px-5 py-4 border-b border-[color:var(--border)]">
            <h3 className="font-semibold">Audit log</h3>
          </div>
          <ul className="divide-y divide-[color:var(--border)] max-h-[600px] overflow-y-auto">
            {data.audit.map((a) => (
              <li key={a.id} className="px-5 py-3 text-sm flex justify-between gap-4">
                <span>
                  <span className="font-medium">{a.action.replace(/_/g, " ")}</span>
                  <span className="text-[color:var(--muted)]"> · {a.targetType}</span>
                </span>
                <span className="text-xs text-[color:var(--muted)] shrink-0">{timeAgo(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
