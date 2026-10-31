import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { Providers } from "@/components/providers";
import AdminShell from "./_components/AdminShell";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await ensureBootstrap();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return (
    <Providers>
      <AdminShell user={{ name: user.name, email: user.email, role: user.role }}>
        {children}
      </AdminShell>
    </Providers>
  );
}
