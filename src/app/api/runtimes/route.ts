import { db } from "@/db";
import { runtimes } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { eq, and, asc } from "drizzle-orm";

export async function GET() {
  await ensureBootstrap();
  const rows = await db
    .select()
    .from(runtimes)
    .where(and(eq(runtimes.isEnabled, true), eq(runtimes.isInstalled, true)))
    .orderBy(asc(runtimes.type), asc(runtimes.version));
  return Response.json({ runtimes: rows });
}
