import { db } from "@/db";
import { environmentVariables, servers } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { destroyServer } from "@/lib/deploy";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    const srv = await getServerForUser(id, u);
    const envs = await db
      .select()
      .from(environmentVariables)
      .where(eq(environmentVariables.serverId, id));
    return Response.json({ server: srv, env: envs });
  } catch (e) {
    return errorResponse(e);
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  startCommand: z.string().max(500).nullable().optional(),
  installCommand: z.string().max(500).nullable().optional(),
  buildCommand: z.string().max(500).nullable().optional(),
  entryPoint: z.string().max(255).nullable().optional(),
  runtimeVersion: z.string().max(32).optional(),
  autoRestart: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    await db
      .update(servers)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(servers.id, id));
    await logActivity({ userId: u.id, serverId: id, action: "UPDATE_SERVER" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    const srv = await getServerForUser(id, u);
    if (srv.locked)
      return Response.json(
        { error: "Server is busy; try again shortly." },
        { status: 409 }
      );
    await destroyServer(id);
    await db.delete(servers).where(eq(servers.id, id));
    await logActivity({ userId: u.id, action: "DELETE_SERVER", detail: srv.name });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
