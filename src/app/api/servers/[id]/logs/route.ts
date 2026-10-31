import { db } from "@/db";
import { serverLogs } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { getServerForUser } from "@/lib/server-access";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const url = new URL(req.url);
    const sinceId = Number(url.searchParams.get("sinceId") ?? "0");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "200"), 500);

    if (sinceId > 0) {
      const rows = await db
        .select()
        .from(serverLogs)
        .where(and(eq(serverLogs.serverId, id), gt(serverLogs.id, sinceId)))
        .orderBy(asc(serverLogs.id))
        .limit(limit);
      return Response.json({ logs: rows });
    }
    const rows = await db
      .select()
      .from(serverLogs)
      .where(eq(serverLogs.serverId, id))
      .orderBy(desc(serverLogs.id))
      .limit(limit);
    return Response.json({ logs: rows.reverse() });
  } catch (e) {
    return errorResponse(e);
  }
}
