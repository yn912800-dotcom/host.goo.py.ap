import { db } from "@/db";
import { files as filesTbl } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { normalizePath } from "@/lib/utils";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  from: z.string().min(1).max(500),
  to: z.string().min(1).max(500),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const from = normalizePath(parsed.data.from);
    const to = normalizePath(parsed.data.to);
    if (!from || !to) return Response.json({ error: "Invalid paths" }, { status: 400 });
    if (from === to) return Response.json({ ok: true });

    // Check destination not taken
    const [exists] = await db
      .select()
      .from(filesTbl)
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, to)))
      .limit(1);
    if (exists)
      return Response.json({ error: "Destination already exists" }, { status: 409 });

    // Move the entry itself
    await db
      .update(filesTbl)
      .set({
        path: to,
        name: to.split("/").pop()!,
        updatedAt: new Date(),
      })
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, from)));

    // Move children if directory
    await db.execute(sql`
      UPDATE files
      SET path = ${to} || substr(path, ${from.length + 1}),
          updated_at = NOW()
      WHERE server_id = ${id} AND left(path, char_length(${from}) + 1) = ${from} || '/'
    `);

    await logActivity({
      userId: u.id,
      serverId: id,
      action: "RENAME",
      detail: `${from} → ${to}`,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
