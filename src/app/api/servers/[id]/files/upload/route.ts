import { db } from "@/db";
import { files as filesTbl, plans, servers, users } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { getMimeType, isTextMime, normalizePath } from "@/lib/utils";
import { extractZip, MAX_FILE_SIZE } from "@/lib/zip";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const form = await req.formData();
    const prefix = normalizePath(String(form.get("path") ?? ""));
    const autoExtract = String(form.get("extractZip") ?? "true") !== "false";

    const uploaded: File[] = [];
    for (const [k, v] of form.entries()) {
      if (k === "file" && v instanceof File) uploaded.push(v);
      if (k === "files" && v instanceof File) uploaded.push(v);
    }
    if (uploaded.length === 0)
      return Response.json({ error: "No files provided" }, { status: 400 });

    // Determine plan storage limit
    const [owner] = await db
      .select({ planId: users.planId })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    let storageLimitBytes = 500 * 1024 * 1024;
    if (owner?.planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, owner.planId)).limit(1);
      if (plan) storageLimitBytes = plan.storageMb * 1024 * 1024;
    }
    const usageRes = await db.execute<{ bytes: string }>(
      sql`SELECT COALESCE(SUM(size_bytes),0)::text as bytes FROM files
          INNER JOIN servers ON servers.id = files.server_id
          WHERE servers.user_id = ${u.id}`
    );
    let currentUsage = Number(usageRes.rows[0]?.bytes ?? 0);

    type ToWrite = {
      path: string;
      name: string;
      isDirectory: boolean;
      content: string | null;
      binaryContent: string | null;
      isBinary: boolean;
      sizeBytes: number;
      mimeType: string;
    };
    const toWrite: ToWrite[] = [];

    for (const f of uploaded) {
      if (f.size > MAX_FILE_SIZE)
        return Response.json(
          { error: `${f.name} exceeds the ${MAX_FILE_SIZE} byte limit` },
          { status: 413 }
        );
      const buf = Buffer.from(await f.arrayBuffer());
      const relName = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const safeName = normalizePath(relName);
      const targetBase = prefix ? prefix + "/" : "";

      if (autoExtract && f.name.toLowerCase().endsWith(".zip")) {
        // Extract into target
        const entries = extractZip(buf);
        for (const e of entries) {
          const dest = normalizePath(targetBase + e.path);
          if (!dest) continue;
          toWrite.push({
            path: dest,
            name: dest.split("/").pop()!,
            isDirectory: e.isDirectory,
            content: e.content ?? null,
            binaryContent: e.binaryContent ?? null,
            isBinary: e.isBinary,
            sizeBytes: e.sizeBytes,
            mimeType: e.mimeType,
          });
        }
        continue;
      }

      const dest = normalizePath(targetBase + safeName);
      const mime = getMimeType(dest);
      const isBin = !isTextMime(mime) || looksBinary(buf);
      toWrite.push({
        path: dest,
        name: dest.split("/").pop()!,
        isDirectory: false,
        content: isBin ? null : buf.toString("utf8"),
        binaryContent: isBin ? buf.toString("base64") : null,
        isBinary: isBin,
        sizeBytes: buf.length,
        mimeType: mime,
      });
    }

    // Check total storage
    const incoming = toWrite.reduce((a, b) => a + b.sizeBytes, 0);
    if (currentUsage + incoming > storageLimitBytes) {
      return Response.json(
        {
          error: `Storage limit exceeded. ${(
            (currentUsage + incoming) / (1024 * 1024)
          ).toFixed(1)}MB would be used of ${(storageLimitBytes / 1024 / 1024).toFixed(0)}MB.`,
        },
        { status: 413 }
      );
    }

    // Deduplicate by path (keep last) & upsert
    const uniq = new Map<string, ToWrite>();
    for (const w of toWrite) uniq.set(w.path, w);

    let written = 0;
    for (const w of uniq.values()) {
      // delete existing
      await db
        .delete(filesTbl)
        .where(and(eq(filesTbl.serverId, id), eq(filesTbl.path, w.path)));
      await db.insert(filesTbl).values({
        serverId: id,
        path: w.path,
        name: w.name,
        isDirectory: w.isDirectory,
        content: w.content,
        binaryContent: w.binaryContent,
        isBinary: w.isBinary,
        sizeBytes: w.sizeBytes,
        mimeType: w.mimeType,
      });
      written++;
      currentUsage += w.sizeBytes;
    }

    // Update server storage
    await db
      .update(servers)
      .set({ updatedAt: new Date() })
      .where(eq(servers.id, id));

    await logActivity({
      userId: u.id,
      serverId: id,
      action: "UPLOAD_FILES",
      detail: `${written} entries (${incoming} bytes)`,
    });

    return Response.json({ ok: true, written });
  } catch (e) {
    return errorResponse(e);
  }
}

function looksBinary(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(1024, buf.length));
  let nonText = 0;
  for (const b of sample) {
    if (b === 0) return true;
    if (b < 7 || (b > 14 && b < 32)) nonText++;
  }
  return sample.length > 0 && nonText / sample.length > 0.3;
}
