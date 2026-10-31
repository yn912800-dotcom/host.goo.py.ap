import { db } from "@/db";
import { serverMetrics } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { isProcessRunning } from "@/lib/deploy";
import { getServerForUser } from "@/lib/server-access";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

// Metrics are sampled from /proc by the process-manager monitor every 10s (real CPU / RSS / disk).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    const srv = await getServerForUser(id, u);
    const url = new URL(req.url);
    const take = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "30") || 30, 1), 360);
    const rows = await db
      .select()
      .from(serverMetrics)
      .where(eq(serverMetrics.serverId, id))
      .orderBy(desc(serverMetrics.createdAt))
      .limit(take);
    return Response.json({
      metrics: rows.reverse(),
      limits: { ramMb: srv.ramMb, storageMb: srv.storageMb, cpuMillis: srv.cpuMillis },
      status: srv.status,
      processRunning: isProcessRunning(id),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
