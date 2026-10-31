import { db } from "@/db";
import { activityLogs, auditLogs, servers, users } from "@/db/schema";
import { errorResponse, requireAdmin } from "@/lib/auth";
import { desc, sql } from "drizzle-orm";

export async function GET() {
  try {
    await requireAdmin();
    const usersCountRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM users`
    );
    const activeUsersRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM users WHERE status='ACTIVE'`
    );
    const serversRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM servers`
    );
    const runningRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM servers WHERE status='RUNNING'`
    );
    const stoppedRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM servers WHERE status='STOPPED'`
    );
    const storageRes = await db.execute<{ bytes: string }>(
      sql`SELECT COALESCE(SUM(size_bytes),0)::text as bytes FROM files`
    );
    const activity = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.createdAt))
      .limit(15);
    const audit = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(15);
    void users;
    void servers;
    return Response.json({
      users: Number(usersCountRes.rows[0]?.c ?? 0),
      activeUsers: Number(activeUsersRes.rows[0]?.c ?? 0),
      servers: Number(serversRes.rows[0]?.c ?? 0),
      running: Number(runningRes.rows[0]?.c ?? 0),
      stopped: Number(stoppedRes.rows[0]?.c ?? 0),
      storageMb: Math.ceil(Number(storageRes.rows[0]?.bytes ?? 0) / (1024 * 1024)),
      activity,
      audit,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
