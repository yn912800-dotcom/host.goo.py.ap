import { getCurrentUser } from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";

export async function GET() {
  await ensureBootstrap();
  const u = await getCurrentUser();
  return Response.json({ user: u });
}
