import { db } from "@/db";
import { files as filesTbl } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { normalizePath } from "@/lib/utils";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const url = new URL(req.url);
    const path = normalizePath(url.searchParams.get("path") ?? "");
    if (!path) return Response.json({ error: "Path required" }, { status: 400 });
    const [row] = await db
      .select()
      .from(filesTbl)
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, path)))
      .limit(1);
    if (!row) return Response.json({ error: "File not found" }, { status: 404 });
    if (row.isDirectory)
      return Response.json({ error: "Cannot read directory" }, { status: 400 });
    return Response.json({
      path: row.path,
      name: row.name,
      sizeBytes: row.sizeBytes,
      mimeType: row.mimeType,
      isBinary: row.isBinary,
      content: row.isBinary ? null : row.content,
      binaryContent: row.isBinary ? row.binaryContent : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

const putSchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string().max(2 * 1024 * 1024),
});

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const path = normalizePath(parsed.data.path);
    const size = Buffer.byteLength(parsed.data.content, "utf8");
    const result = await db
      .update(filesTbl)
      .set({
        content: parsed.data.content,
        sizeBytes: size,
        isBinary: false,
        binaryContent: null,
        updatedAt: new Date(),
      })
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, path)));
    if ((result.rowCount ?? 0) === 0) {
      // create if missing
      const name = path.split("/").pop()!;
      await db.insert(filesTbl).values({
        serverId: id,
        path,
        name,
        sizeBytes: size,
        content: parsed.data.content,
        isBinary: false,
      });
    }
    await logActivity({ userId: u.id, serverId: id, action: "EDIT_FILE", detail: path });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
