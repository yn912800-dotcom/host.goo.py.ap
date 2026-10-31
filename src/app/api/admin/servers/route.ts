import { db } from "@/db";
import { servers, users } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/activity";
import {
  destroyServer,
  killServer,
  restartServer,
  startDeployment,
  stopServer,
  suspendServer,
  resumeServer,
} from "@/lib/deploy";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await db
      .select({
        id: servers.id,
        name: servers.name,
        status: servers.status,
        runtime: servers.runtime,
        runtimeVersion: servers.runtimeVersion,
        createdAt: servers.createdAt,
        updatedAt: servers.updatedAt,
        userId: servers.userId,
        ownerEmail: users.email,
        ownerName: users.name,
      })
      .from(servers)
      .leftJoin(users, eq(users.id, servers.userId))
      .orderBy(desc(servers.createdAt))
      .limit(200);
    return Response.json({ servers: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const actionSchema = z.object({
  serverId: z.string().uuid(),
  action: z.enum(["start", "stop", "restart", "kill", "suspend", "resume", "delete"]),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const { serverId, action } = parsed.data;
    try {
      await adminAction(serverId, action);
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 409 });
    }
    await logAudit({
      adminId: admin.id,
      targetType: "server",
      targetId: serverId,
      action: `ADMIN_${action.toUpperCase()}`,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

async function adminAction(serverId: string, action: z.infer<typeof actionSchema>["action"]) {
    switch (action) {
      case "kill":
        await killServer(serverId);
        break;
      case "start":
        await startDeployment(serverId);
        break;
      case "stop":
        await stopServer(serverId);
        break;
      case "restart":
        await restartServer(serverId);
        break;
      case "suspend":
        await suspendServer(serverId);
        break;
      case "resume":
        await resumeServer(serverId);
        break;
      case "delete":
        await destroyServer(serverId);
        await db.delete(servers).where(eq(servers.id, serverId));
        break;
    }
}
