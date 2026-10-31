import { db } from "@/db";
import { activityLogs, plans, servers, users } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { desc, eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const u = await requireUser();
    const [plan] = u.planId
      ? await db.select().from(plans).where(eq(plans.id, u.planId)).limit(1)
      : [];
    const [me] = await db.select().from(users).where(eq(users.id, u.id)).limit(1);

    const rows = await db.select().from(servers).where(eq(servers.userId, u.id));
    const total = rows.length;
    const running = rows.filter((r) => r.status === "RUNNING").length;
    const stopped = rows.filter((r) => r.status === "STOPPED").length;
    const error = rows.filter((r) => r.status === "ERROR" || r.status === "CRASHED").length;

    const usageRes = await db.execute<{ bytes: string }>(
      sql`SELECT COALESCE(SUM(size_bytes),0)::text as bytes FROM files
          INNER JOIN servers ON servers.id = files.server_id
          WHERE servers.user_id = ${u.id}`
    );
    const storageUsedMb = Math.ceil(Number(usageRes.rows[0]?.bytes ?? 0) / (1024 * 1024));

    const activity = await db
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.userId, u.id))
      .orderBy(desc(activityLogs.createdAt))
      .limit(10);

    return Response.json({
      user: {
        id: me?.id,
        name: me?.name,
        email: me?.email,
        status: me?.status,
        expiresAt: me?.expiresAt,
      },
      plan: plan ?? null,
      servers: {
        total,
        running,
        stopped,
        error,
        items: rows.slice(0, 5),
      },
      resources: {
        storageUsedMb,
        storageLimitMb: plan?.storageMb ?? 500,
        ramLimitMb: plan?.ramMb ?? 256,
        cpuMillisLimit: plan?.cpuMillis ?? 250,
      },
      activity,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
