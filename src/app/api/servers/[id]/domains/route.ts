import { db } from "@/db";
import { domains, plans, users } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const rows = await db
      .select()
      .from(domains)
      .where(eq(domains.serverId, id))
      .orderBy(desc(domains.isPrimary), desc(domains.createdAt));
    return Response.json({ domains: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  hostname: z
    .string()
    .min(3)
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i),
  isPrimary: z.boolean().optional().default(false),
  sslEnabled: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);

    const [owner] = await db
      .select({ planId: users.planId })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    let maxDomains = 1;
    if (owner?.planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, owner.planId)).limit(1);
      if (plan) maxDomains = plan.maxDomains;
    }
    const existing = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM domains WHERE server_id = ${id}`
    );
    if (Number(existing.rows[0]?.c ?? 0) >= maxDomains)
      return Response.json(
        { error: `Domain limit (${maxDomains}) reached.` },
        { status: 402 }
      );

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid hostname" }, { status: 400 });
    try {
      if (parsed.data.isPrimary) {
        await db
          .update(domains)
          .set({ isPrimary: false })
          .where(eq(domains.serverId, id));
      }
      await db.insert(domains).values({
        serverId: id,
        hostname: parsed.data.hostname.toLowerCase(),
        isPrimary: parsed.data.isPrimary,
        sslEnabled: parsed.data.sslEnabled,
        sslStatus: parsed.data.sslEnabled ? "pending" : "none",
        verified: false,
      });
    } catch {
      return Response.json({ error: "Domain is already in use" }, { status: 409 });
    }
    await logActivity({ userId: u.id, serverId: id, action: "ADD_DOMAIN", detail: parsed.data.hostname });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const url = new URL(req.url);
    const did = url.searchParams.get("domainId");
    if (!did) return Response.json({ error: "domainId required" }, { status: 400 });
    await db.delete(domains).where(and(eq(domains.serverId, id), eq(domains.id, did)));
    await logActivity({ userId: u.id, serverId: id, action: "REMOVE_DOMAIN" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
