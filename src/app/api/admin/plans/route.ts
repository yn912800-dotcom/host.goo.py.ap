import { db } from "@/db";
import { plans } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import { asc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db.select().from(plans).orderBy(asc(plans.sortOrder));
    return Response.json({ plans: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const planSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(64),
  slug: z.string().min(1).max(64),
  description: z.string().max(500).optional(),
  priceCents: z.number().int().nonnegative(),
  storageMb: z.number().int().positive(),
  ramMb: z.number().int().positive(),
  cpuMillis: z.number().int().positive(),
  maxServers: z.number().int().positive(),
  maxBackups: z.number().int().nonnegative(),
  maxDomains: z.number().int().nonnegative(),
  bandwidthGb: z.number().int().nonnegative(),
  features: z.array(z.string().max(100)).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = planSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const { id, ...data } = parsed.data;
    if (data.isDefault) {
      await db.update(plans).set({ isDefault: false });
    }
    if (id) {
      await db.update(plans).set(data).where(eq(plans.id, id));
      await logAudit({ adminId: admin.id, targetType: "plan", targetId: String(id), action: "UPDATE_PLAN" });
    } else {
      await db.insert(plans).values(data);
      await logAudit({ adminId: admin.id, targetType: "plan", action: "CREATE_PLAN" });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await db.delete(plans).where(eq(plans.id, id));
    await logAudit({ adminId: admin.id, targetType: "plan", targetId: String(id), action: "DELETE_PLAN" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
