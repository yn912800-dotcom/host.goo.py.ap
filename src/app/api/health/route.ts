import { db } from "@/db";
import { ensureBootstrap } from "@/lib/bootstrap";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    await ensureBootstrap();
    await db.execute(sql`SELECT 1`);
    return Response.json({
      ok: true,
      service: "team-x-hosting",
      time: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[health] readiness check failed", e);
    return Response.json({ ok: false, error: "Service initialization failed" }, { status: 503 });
  }
}
