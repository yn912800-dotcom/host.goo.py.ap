"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  Shield,
  Users,
  Server,
  Package,
  Zap,
  Settings,
  Activity,
  LogOut,
  Menu,
  X,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/admin", label: "Overview", icon: Shield },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/servers", label: "Servers", icon: Server },
  { href: "/admin/plans", label: "Plans", icon: Package },
  { href: "/admin/runtimes", label: "Runtimes", icon: Zap },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex">
      <aside
        className={cn(
          "fixed md:static inset-y-0 start-0 z-40 w-64 border-e border-[color:var(--border)] bg-[color:var(--card)] transition-transform",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-[color:var(--border)]">
          <Link href="/admin" className="flex items-center gap-2 font-bold">
            <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white text-xs">
              <Shield size={14} />
            </span>
            Admin
          </Link>
          <button
            className="md:hidden btn btn-ghost btn-sm"
            onClick={() => setOpen(false)}
          >
            <X size={16} />
          </button>
        </div>
        <nav className="p-3 space-y-1">
          {nav.map((n) => {
            const active =
              pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                  active
                    ? "bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
                    : "text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-white/5"
                )}
              >
                <n.icon size={16} />
                {n.label}
              </Link>
            );
          })}
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[color:var(--muted)] hover:text-[color:var(--fg)] hover:bg-white/5 mt-4"
          >
            <Home size={16} /> Back to dashboard
          </Link>
        </nav>
        <div className="absolute bottom-0 inset-x-0 p-3 border-t border-[color:var(--border)]">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-9 h-9 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-300 text-sm font-semibold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-[color:var(--muted)] truncate">{user.role}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full btn btn-ghost btn-sm justify-start mt-1"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 border-b border-[color:var(--border)] bg-[color:var(--bg)]/80 backdrop-blur-md flex items-center justify-between px-4 md:px-6">
          <button
            className="md:hidden btn btn-ghost btn-sm"
            onClick={() => setOpen(true)}
          >
            <Menu size={16} />
          </button>
          <div className="text-xs text-[color:var(--muted)]">Administrator</div>
        </header>
        <main className="flex-1 p-4 md:p-6 scrollbar">{children}</main>
      </div>
    </div>
  );
}
