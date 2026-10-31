import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import {
  isProcessRunning,
  killServer,
  restartServer,
  startDeployment,
  stopServer,
} from "@/lib/deploy";
import { getServerForUser } from "@/lib/server-access";
import { NextRequest } from "next/server";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["start", "stop", "restart", "redeploy", "kill"]),
});

const BUSY = ["INSTALLING", "BUILDING", "STARTING", "STOPPING"];

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    const srv = await getServerForUser(id, u);
    const parsed = schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: "Invalid action" }, { status: 400 });
    const action = parsed.data.action;

    if (srv.status === "SUSPENDED" && u.role === "USER")
      return Response.json({ error: "This server is suspended by an administrator." }, { status: 403 });

    const run = async (): Promise<string | undefined> => {
      switch (action) {
        case "start":
          if (srv.status === "RUNNING" || BUSY.includes(srv.status))
            throw Object.assign(new Error(`Server is already ${srv.status}`), { status: 409 });
          return startDeployment(id);
        case "stop":
          if (!["RUNNING", "STARTING", "CRASHED"].includes(srv.status) && !isProcessRunning(id))
            throw Object.assign(new Error("Server is not running"), { status: 409 });
          await stopServer(id);
          return;
        case "kill":
          await killServer(id);
          return;
        case "restart":
        case "redeploy":
          if (BUSY.includes(srv.status) || srv.locked)
            throw Object.assign(new Error("Server is busy"), { status: 409 });
          return restartServer(id);
      }
    };

    let deploymentId: string | undefined;
    try {
      deploymentId = await run();
    } catch (e) {
      const status = (e as { status?: number }).status ?? 409;
      return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status });
    }
    await logActivity({ userId: u.id, serverId: id, action: `${action.toUpperCase()}_SERVER` });
    return Response.json({ ok: true, deploymentId });
  } catch (e) {
    return errorResponse(e);
  }
}
