import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { sendInput } from "@/lib/deploy";
import { getServerForUser } from "@/lib/server-access";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({ input: z.string().min(1).max(2000) });

/** Write a line to the running process' stdin (interactive console). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    if (/[\r\n]/.test(parsed.data.input))
      return Response.json({ error: "Send one line at a time" }, { status: 400 });
    if (!sendInput(id, parsed.data.input))
      return Response.json({ error: "Process is not running" }, { status: 409 });
    await logActivity({ userId: u.id, serverId: id, action: "CONSOLE_INPUT" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
