import { db } from "@/db";
import { runtimes } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.select().from(runtimes).orderBy(asc(runtimes.type), asc(runtimes.version));
    return Response.json({ runtimes: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  id: z.number().int(),
  isEnabled: z.boolean().optional(),
  isInstalled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const { id, ...rest } = parsed.data;
    await db.update(runtimes).set(rest).where(eq(runtimes.id, id));
    await logAudit({ adminId: admin.id, targetType: "runtime", targetId: String(id), action: "UPDATE_RUNTIME" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
