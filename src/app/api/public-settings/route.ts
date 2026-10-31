import { db } from "@/db";
import { settings } from "@/db/schema";
import { ensureBootstrap } from "@/lib/bootstrap";
import { eq } from "drizzle-orm";

export async function GET() {
  await ensureBootstrap();
  const [row] = await db.select().from(settings).where(eq(settings.key, "platform")).limit(1);
  const val = (row?.value ?? {}) as Record<string, unknown>;
  // Only expose safe fields publicly
  return Response.json({
    platformName: val.platformName ?? "•-تــيــ۾ إڪـXـس-•",
    description: val.description ?? "",
    registrationEnabled: val.registrationEnabled ?? true,
    googleLoginEnabled: val.googleLoginEnabled ?? false,
    maintenanceMode: val.maintenanceMode ?? false,
  });
}
