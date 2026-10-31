"use client";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Select, useToast } from "@/components/ui";
import { timeAgo } from "@/lib/utils";
import { Search } from "lucide-react";

type User = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  status: "ACTIVE" | "SUSPENDED" | "BANNED";
  planId: number | null;
  createdAt: string;
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState("");
  const toast = useToast();

  async function load() {
    const r = await fetch(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    const d = await r.json();
    setUsers(d.users ?? []);
  }
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line

  async function patch(userId: string, body: Partial<User>) {
    const r = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, ...body }),
    });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    load();
  }

  async function remove(userId: string) {
    if (!confirm("Delete this user and all their data?")) return;
    const r = await fetch(`/api/admin/users?userId=${userId}`, { method: "DELETE" });
    const d = await r.json();
    if (!r.ok) return toast.show(d.error || "Failed", "error");
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Users</h1>
      <div className="relative max-w-xs">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
        />
        <Input
          placeholder="Search by name or email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
      <Card padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[color:var(--muted)] uppercase tracking-wider border-b border-[color:var(--border)]">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {!users ? (
                <tr><td colSpan={5} className="p-6 text-center text-[color:var(--muted)]">Loading...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="p-6 text-center text-[color:var(--muted)]">No users</td></tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-[color:var(--muted)]">{u.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={u.role}
                        onChange={(e) => patch(u.id, { role: e.target.value as User["role"] })}
                        className="!py-1 !text-xs max-w-[140px]"
                      >
                        <option value="USER">USER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {u.status === "ACTIVE" && <Badge variant="success">Active</Badge>}
                      {u.status === "SUSPENDED" && <Badge variant="warn">Suspended</Badge>}
                      {u.status === "BANNED" && <Badge variant="error">Banned</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-[color:var(--muted)]">
                      {timeAgo(u.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        {u.status === "ACTIVE" ? (
                          <Button size="sm" variant="secondary" onClick={() => patch(u.id, { status: "SUSPENDED" })}>
                            Suspend
                          </Button>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => patch(u.id, { status: "ACTIVE" })}>
                            Activate
                          </Button>
                        )}
                        <Button size="sm" variant="danger" onClick={() => remove(u.id)}>
                          Delete
                        </Button>
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
