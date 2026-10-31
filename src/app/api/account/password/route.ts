import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { SESSION_COOKIE, errorResponse, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";

const schema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const [row] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);
    if (!row?.passwordHash) return Response.json({ error: "No password set" }, { status: 400 });
    const ok = await verifyPassword(parsed.data.oldPassword, row.passwordHash);
    if (!ok) return Response.json({ error: "Current password is incorrect" }, { status: 403 });
    const hash = await hashPassword(parsed.data.newPassword);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(users.id, u.id));
      await tx.delete(sessions).where(eq(sessions.userId, u.id));
    });
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    await logActivity({ userId: u.id, action: "CHANGE_PASSWORD" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
