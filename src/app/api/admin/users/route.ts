import { db } from "@/db";
import { servers, users } from "@/db/schema";
import { destroyServer } from "@/lib/deploy";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import { desc, ilike, or, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    const rows = q
      ? await db
          .select()
          .from(users)
          .where(or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)))
          .orderBy(desc(users.createdAt))
          .limit(100)
      : await db.select().from(users).orderBy(desc(users.createdAt)).limit(100);
    return Response.json({
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        status: r.status,
        planId: r.planId,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]).optional(),
  role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]).optional(),
  planId: z.number().int().nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const { userId, ...rest } = parsed.data;
    if (admin.role !== "SUPER_ADMIN" && rest.role)
      return Response.json({ error: "Only super admins can change roles" }, { status: 403 });
    await db
      .update(users)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(users.id, userId));
    await logAudit({
      adminId: admin.id,
      targetType: "user",
      targetId: userId,
      action: "UPDATE_USER",
      detail: rest as Record<string, unknown>,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    if (!userId) return Response.json({ error: "userId required" }, { status: 400 });
    if (userId === admin.id)
      return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
    // Stop processes & remove workspaces of all the user's servers before the cascade delete.
    const owned = await db.select({ id: servers.id }).from(servers).where(eq(servers.userId, userId));
    for (const s of owned) await destroyServer(s.id);
    await db.delete(users).where(eq(users.id, userId));
    await logAudit({
      adminId: admin.id,
      targetType: "user",
      targetId: userId,
      action: "DELETE_USER",
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
