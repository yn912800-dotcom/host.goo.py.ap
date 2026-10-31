import { db } from "@/db";
import { plans } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { asc, eq } from "drizzle-orm";

export async function GET() {
  await ensureBootstrap();
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.isActive, true))
    .orderBy(asc(plans.sortOrder));
  return Response.json({ plans: rows });
}
