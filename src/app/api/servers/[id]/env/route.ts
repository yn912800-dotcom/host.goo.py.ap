import { db } from "@/db";
import { environmentVariables } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const rows = await db
      .select()
      .from(environmentVariables)
      .where(eq(environmentVariables.serverId, id));
    return Response.json({ env: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const schema = z.object({
  key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/i),
  value: z.string().max(10000),
  isSecret: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid key or value" }, { status: 400 });
    // upsert
    const [existing] = await db
      .select()
      .from(environmentVariables)
      .where(
        and(
          eq(environmentVariables.serverId, id),
          eq(environmentVariables.key, parsed.data.key)
        )
      )
      .limit(1);
    if (existing) {
      await db
        .update(environmentVariables)
        .set({
          value: parsed.data.value,
          isSecret: parsed.data.isSecret,
          updatedAt: new Date(),
        })
        .where(eq(environmentVariables.id, existing.id));
    } else {
      await db.insert(environmentVariables).values({
        serverId: id,
        key: parsed.data.key,
        value: parsed.data.value,
        isSecret: parsed.data.isSecret,
      });
    }
    await logActivity({ userId: u.id, serverId: id, action: "UPDATE_ENV", detail: parsed.data.key });
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
    const key = url.searchParams.get("key");
    if (!key) return Response.json({ error: "Key required" }, { status: 400 });
    await db
      .delete(environmentVariables)
      .where(and(eq(environmentVariables.serverId, id), eq(environmentVariables.key, key)));
    await logActivity({ userId: u.id, serverId: id, action: "DELETE_ENV", detail: key });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
