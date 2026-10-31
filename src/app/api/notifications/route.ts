import { db } from "@/db";
import { notifications } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { and, desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    const u = await requireUser();
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, u.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return Response.json({ notifications: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser();
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (id === "all") {
      await db
        .update(notifications)
        .set({ read: true })
        .where(eq(notifications.userId, u.id));
      return Response.json({ ok: true });
    }
    if (id) {
      await db
        .update(notifications)
        .set({ read: true })
        .where(and(eq(notifications.userId, u.id), eq(notifications.id, id)));
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
