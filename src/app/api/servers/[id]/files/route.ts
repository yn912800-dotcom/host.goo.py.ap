import { db } from "@/db";
import { files as filesTbl } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { getMimeType, isTextMime, normalizePath } from "@/lib/utils";
import { and, asc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

// List files (optionally under a prefix)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const url = new URL(req.url);
    const prefix = url.searchParams.get("path") ?? "";
    const normalized = prefix ? normalizePath(prefix) : "";
    const rows = await db
      .select({
        id: filesTbl.id,
        path: filesTbl.path,
        name: filesTbl.name,
        isDirectory: filesTbl.isDirectory,
        sizeBytes: filesTbl.sizeBytes,
        mimeType: filesTbl.mimeType,
        isBinary: filesTbl.isBinary,
        updatedAt: filesTbl.updatedAt,
      })
      .from(filesTbl)
      .where(eq(filesTbl.serverId, id))
      .orderBy(asc(filesTbl.path));

    // Build a tree view at the requested prefix: direct children only
    const children = new Map<string, {
      path: string; name: string; isDirectory: boolean; sizeBytes: number;
      mimeType: string | null; isBinary: boolean; updatedAt: Date;
    }>();
    const prefixWithSlash = normalized ? normalized + "/" : "";
    for (const r of rows) {
      if (normalized && !r.path.startsWith(prefixWithSlash) && r.path !== normalized) continue;
      const rel = normalized ? r.path.slice(prefixWithSlash.length) : r.path;
      if (!rel) continue;
      const idx = rel.indexOf("/");
      if (idx === -1) {
        // direct file/folder
        if (!children.has(rel)) {
          children.set(rel, {
            path: r.path,
            name: rel,
            isDirectory: r.isDirectory,
            sizeBytes: r.sizeBytes,
            mimeType: r.mimeType,
            isBinary: r.isBinary,
            updatedAt: r.updatedAt,
          });
        }
      } else {
        // implicit sub-directory
        const dirName = rel.slice(0, idx);
        const dirPath = prefixWithSlash + dirName;
        if (!children.has(dirName)) {
          children.set(dirName, {
            path: dirPath,
            name: dirName,
            isDirectory: true,
            sizeBytes: 0,
            mimeType: "inode/directory",
            isBinary: false,
            updatedAt: r.updatedAt,
          });
        }
      }
    }
    const entries = [...children.values()].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return Response.json({ path: normalized, entries });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  path: z.string().min(1).max(500),
  isDirectory: z.boolean().optional().default(false),
  content: z.string().max(2 * 1024 * 1024).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const path = normalizePath(parsed.data.path);
    if (!path) return Response.json({ error: "Path required" }, { status: 400 });

    // Check if exists
    const [existing] = await db
      .select()
      .from(filesTbl)
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, path)))
      .limit(1);
    if (existing) return Response.json({ error: "File already exists" }, { status: 409 });

    const name = path.split("/").pop()!;
    const mime = parsed.data.isDirectory ? "inode/directory" : getMimeType(name);
    const content = parsed.data.isDirectory ? null : parsed.data.content ?? "";
    const size = content ? Buffer.byteLength(content, "utf8") : 0;
    await db.insert(filesTbl).values({
      serverId: id,
      path,
      name,
      isDirectory: parsed.data.isDirectory,
      mimeType: mime,
      content,
      isBinary: false,
      sizeBytes: size,
    });
    await logActivity({
      userId: u.id,
      serverId: id,
      action: parsed.data.isDirectory ? "CREATE_FOLDER" : "CREATE_FILE",
      detail: path,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// Bulk delete
const deleteSchema = z.object({
  paths: z.array(z.string().min(1)).min(1).max(500),
});
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });
    const normalizedPaths = parsed.data.paths.map((p) => normalizePath(p));
    let deleted = 0;
    for (const p of normalizedPaths) {
      const res = await db
        .delete(filesTbl)
        .where(
          and(
            eq(filesTbl.serverId, id),
            sql`(${filesTbl.path} = ${p} OR left(${filesTbl.path}, char_length(${p}) + 1) = ${p} || '/')`
          )
        );
      deleted += res.rowCount ?? 0;
    }
    await logActivity({ userId: u.id, serverId: id, action: "DELETE_FILES", detail: `${deleted} entries` });
    return Response.json({ ok: true, deleted });
  } catch (e) {
    return errorResponse(e);
  }
}

// mark unused imports as used
void isTextMime;
