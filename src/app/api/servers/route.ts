import { db } from "@/db";
import { environmentVariables, plans, servers, files as filesTbl } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { normalizePath, slugify } from "@/lib/utils";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET() {
  try {
    const u = await requireUser();
    const rows = await db
      .select()
      .from(servers)
      .where(eq(servers.userId, u.id))
      .orderBy(desc(servers.createdAt));
    return Response.json({ servers: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  runtime: z.enum([
    "python",
    "node",
    "php",
    "static",
    "image",
    "java",
    "go",
    "ruby",
    "rust",
    "deno",
    "shell",
  ]),
  runtimeVersion: z.string().max(32),
  entryPoint: z.string().max(255).optional(),
  startCommand: z.string().max(500).optional(),
  installCommand: z.string().max(500).optional(),
  buildCommand: z.string().max(500).optional(),
  description: z.string().max(500).optional(),
  env: z
    .array(
      z.object({
        key: z.string().min(1).max(128).regex(/^[A-Z_][A-Z0-9_]*$/i),
        value: z.string().max(10000),
        isSecret: z.boolean().optional().default(true),
      })
    )
    .max(100)
    .optional(),
  files: z
    .array(
      z.object({
        path: z.string().max(500),
        isDirectory: z.boolean().optional().default(false),
        content: z.string().max(10 * 1024 * 1024).optional(),
        binaryContent: z.string().max(14 * 1024 * 1024).optional(),
        isBinary: z.boolean().optional().default(false),
        sizeBytes: z.number().int().nonnegative().optional().default(0),
        mimeType: z.string().max(128).optional(),
      })
    )
    .max(500)
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    const u = await requireUser();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );

    // Normalize & validate every file path (rejects "..", absolute paths, NUL bytes)
    try {
      for (const f of parsed.data.files ?? []) {
        f.path = normalizePath(f.path);
        if (!f.path) throw new Error("empty path");
      }
    } catch {
      return Response.json({ error: "Invalid file path in upload" }, { status: 400 });
    }

    // Check plan limits
    const [plan] = u.planId
      ? await db.select().from(plans).where(eq(plans.id, u.planId)).limit(1)
      : [];
    const countRes = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM servers WHERE user_id = ${u.id}`
    );
    const current = Number(countRes.rows[0]?.c ?? 0);
    const limit = plan?.maxServers ?? 1;
    if (current >= limit)
      return Response.json(
        {
          error: `You have reached your plan's server limit (${limit}). Upgrade to add more.`,
        },
        { status: 402 }
      );

    // Compute slug (unique per user)
    const baseSlug = slugify(parsed.data.name);
    let slug = baseSlug;
    for (let i = 1; i < 50; i++) {
      const [exists] = await db
        .select()
        .from(servers)
        .where(and(eq(servers.userId, u.id), eq(servers.slug, slug)))
        .limit(1);
      if (!exists) break;
      slug = `${baseSlug}-${i + 1}`;
    }

    // Enforce storage using bytes derived from the payload, never client metadata.
    const totalBytes = (parsed.data.files ?? []).reduce(
      (acc, f) => acc + authoritativeSize(f),
      0
    );
    const storageLimit = (plan?.storageMb ?? 500) * 1024 * 1024;
    if (totalBytes > storageLimit)
      return Response.json(
        { error: "Upload exceeds your plan's storage limit." },
        { status: 413 }
      );

    const [srv] = await db
      .insert(servers)
      .values({
        userId: u.id,
        name: parsed.data.name,
        slug,
        description: parsed.data.description,
        runtime: parsed.data.runtime,
        runtimeVersion: parsed.data.runtimeVersion,
        entryPoint: parsed.data.entryPoint,
        startCommand: parsed.data.startCommand,
        installCommand: parsed.data.installCommand,
        buildCommand: parsed.data.buildCommand,
        cpuMillis: plan?.cpuMillis ?? 250,
        ramMb: plan?.ramMb ?? 256,
        storageMb: plan?.storageMb ?? 500,
      })
      .returning();

    // Insert files
    if (parsed.data.files && parsed.data.files.length > 0) {
      // dedupe by path, keep last
      const uniq = new Map<string, (typeof parsed.data.files)[number]>();
      for (const f of parsed.data.files) uniq.set(f.path, f);
      const vals = [...uniq.values()].map((f) => ({
        serverId: srv.id,
        path: f.path,
        name: f.path.split("/").pop() || f.path,
        isDirectory: f.isDirectory ?? false,
        sizeBytes: authoritativeSize(f),
        mimeType: f.mimeType,
        content: f.content,
        binaryContent: f.binaryContent,
        isBinary: f.isBinary ?? false,
      }));
      // Chunk inserts to avoid huge payload
      const chunk = 200;
      for (let i = 0; i < vals.length; i += chunk) {
        await db.insert(filesTbl).values(vals.slice(i, i + chunk));
      }
    }

    // Environment variables (e.g. BOT_TOKEN) — values are never logged.
    const envRows = new Map<string, { key: string; value: string; isSecret: boolean }>();
    for (const e of parsed.data.env ?? []) if (e.value !== "") envRows.set(e.key, e);
    if (envRows.size > 0) {
      await db.insert(environmentVariables).values(
        [...envRows.values()].map((e) => ({ serverId: srv.id, key: e.key, value: e.value, isSecret: e.isSecret }))
      );
    }

    await logActivity({
      userId: u.id,
      serverId: srv.id,
      action: "CREATE_SERVER",
      detail: srv.name,
    });

    return Response.json({ server: srv });
  } catch (e) {
    return errorResponse(e);
  }
}

function authoritativeSize(file: {
  isDirectory?: boolean;
  content?: string;
  binaryContent?: string;
}): number {
  if (file.isDirectory) return 0;
  if (typeof file.binaryContent === "string") {
    try {
      return Buffer.from(file.binaryContent, "base64").byteLength;
    } catch {
      throw new Error("Invalid binary file payload");
    }
  }
  return typeof file.content === "string" ? Buffer.byteLength(file.content, "utf8") : 0;
}
