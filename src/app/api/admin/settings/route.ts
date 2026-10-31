import { db } from "@/db";
import { settings } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
    const [row] = await db.select().from(settings).where(eq(settings.key, "platform")).limit(1);
    return Response.json({ settings: row?.value ?? {} });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await req.json()) as Record<string, unknown>;
    await db
      .insert(settings)
      .values({ key: "platform", value: body })
      .onConflictDoUpdate({ target: settings.key, set: { value: body, updatedAt: new Date() } });
    await logAudit({ adminId: admin.id, targetType: "settings", action: "UPDATE_SETTINGS" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
