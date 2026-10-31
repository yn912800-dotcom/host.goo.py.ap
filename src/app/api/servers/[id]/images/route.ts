import { db } from "@/db";
import { files as filesTbl, servers } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { getServerForUser } from "@/lib/server-access";
import { getMimeType, normalizePath } from "@/lib/utils";
import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser();
    await getServerForUser(id, user);
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const rows = await db
      .select({ id: filesTbl.id, path: filesTbl.path, name: filesTbl.name, mimeType: filesTbl.mimeType, sizeBytes: filesTbl.sizeBytes, createdAt: filesTbl.createdAt, updatedAt: filesTbl.updatedAt })
      .from(filesTbl)
      .where(and(eq(filesTbl.serverId, id), eq(filesTbl.isDirectory, false), sql`${filesTbl.path} LIKE 'images/%'`));
    const images = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q)) : rows;
    return Response.json({ images: images.map((image) => ({ ...image, url: `/api/images/${image.id}` })) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const user = await requireUser();
    const server = await getServerForUser(id, user);
    if (server.runtime !== "image") return Response.json({ error: "This endpoint requires an Image Hosting project." }, { status: 409 });

    const form = await req.formData();
    const uploads = [...form.values()].filter((value): value is File => value instanceof File);
    if (!uploads.length) return Response.json({ error: "No images provided" }, { status: 400 });
    if (uploads.length > 50) return Response.json({ error: "Maximum 50 images per request" }, { status: 413 });

    const usage = await db.execute<{ bytes: string }>(sql`SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes FROM files WHERE server_id = ${id}`);
    let used = Number(usage.rows[0]?.bytes ?? 0);
    const quota = server.storageMb * 1024 * 1024;
    const created: Array<{ id: string; name: string; sizeBytes: number; url: string }> = [];

    for (const upload of uploads) {
      if (upload.size <= 0 || upload.size > MAX_IMAGE_BYTES) throw new Error(`Image ${upload.name} exceeds the 10 MB limit`);
      const raw = Buffer.from(await upload.arrayBuffer());
      const mime = detectedMime(upload.name, upload.type, raw);
      if (!ALLOWED.has(mime)) throw new Error(`Unsupported image type: ${upload.name}`);
      const safeName = normalizePath(upload.name).split("/").pop()!.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `images/${crypto.randomUUID()}-${safeName}`;
      const content = mime === "image/svg+xml" ? sanitizeSvg(raw.toString("utf8")) : null;
      const binaryContent = content === null ? raw.toString("base64") : null;
      const sizeBytes = Buffer.byteLength(content ?? raw);
      if (used + sizeBytes > quota) return Response.json({ error: "Server storage quota exceeded" }, { status: 413 });
      const [row] = await db.insert(filesTbl).values({ serverId: id, path, name: safeName, isDirectory: false, sizeBytes, mimeType: mime, content, binaryContent, isBinary: content === null }).returning({ id: filesTbl.id, name: filesTbl.name, sizeBytes: filesTbl.sizeBytes });
      used += sizeBytes;
      created.push({ ...row, url: `/api/images/${row.id}` });
    }
    return Response.json({ ok: true, images: created }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

function detectedMime(name: string, declared: string, data: Buffer): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "svg") return "image/svg+xml";
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (data.subarray(0, 6).toString() === "GIF89a" || data.subarray(0, 6).toString() === "GIF87a") return "image/gif";
  return declared;
}

function sanitizeSvg(svg: string): string {
  if (svg.length > MAX_IMAGE_BYTES || /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\son\w+\s*=|javascript:/i.test(svg)) {
    throw new Error("SVG contains unsafe markup");
  }
  return svg.replace(/<\?xml[\s\S]*?\?>/i, "").trim();
}
