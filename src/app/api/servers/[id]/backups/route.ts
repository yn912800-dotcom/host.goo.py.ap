import { db } from "@/db";
import { backups, files as filesTbl, plans, users } from "@/db/schema";
import { errorResponse, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { getServerForUser } from "@/lib/server-access";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { z } from "zod";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const rows = await db
      .select({
        id: backups.id,
        name: backups.name,
        sizeBytes: backups.sizeBytes,
        fileCount: backups.fileCount,
        status: backups.status,
        createdAt: backups.createdAt,
      })
      .from(backups)
      .where(eq(backups.serverId, id))
      .orderBy(desc(backups.createdAt));
    return Response.json({ backups: rows });
  } catch (e) {
    return errorResponse(e);
  }
}

const createSchema = z.object({ name: z.string().min(1).max(128).optional() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    const srv = await getServerForUser(id, u);
    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

    // Enforce backup limit
    const [owner] = await db
      .select({ planId: users.planId })
      .from(users)
      .where(eq(users.id, u.id))
      .limit(1);
    let maxBackups = 3;
    if (owner?.planId) {
      const [plan] = await db.select().from(plans).where(eq(plans.id, owner.planId)).limit(1);
      if (plan) maxBackups = plan.maxBackups;
    }
    const existingCount = await db.execute<{ c: string }>(
      sql`SELECT COUNT(*)::text as c FROM backups WHERE server_id = ${id}`
    );
    if (Number(existingCount.rows[0]?.c ?? 0) >= maxBackups)
      return Response.json(
        { error: `Backup limit (${maxBackups}) reached. Delete old backups first.` },
        { status: 402 }
      );

    const allFiles = await db.select().from(filesTbl).where(eq(filesTbl.serverId, id));
    const snapshot = {
      files: allFiles.map((f) => ({
        path: f.path,
        isDirectory: f.isDirectory,
        content: f.content,
        binaryContent: f.binaryContent,
        isBinary: f.isBinary,
        mimeType: f.mimeType,
        sizeBytes: f.sizeBytes,
      })),
    };
    const size = allFiles.reduce((a, b) => a + b.sizeBytes, 0);
    const [b] = await db
      .insert(backups)
      .values({
        serverId: id,
        name: parsed.data.name ?? `Backup ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        sizeBytes: size,
        fileCount: allFiles.length,
        status: "READY",
        snapshot,
      })
      .returning({ id: backups.id });
    await logActivity({ userId: u.id, serverId: id, action: "CREATE_BACKUP", detail: srv.name });
    return Response.json({ ok: true, id: b.id });
  } catch (e) {
    return errorResponse(e);
  }
}

const restoreSchema = z.object({ action: z.literal("restore"), backupId: z.string().uuid() });

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const body = await req.json();
    const parsed = restoreSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
    const [b] = await db
      .select()
      .from(backups)
      .where(and(eq(backups.id, parsed.data.backupId), eq(backups.serverId, id)))
      .limit(1);
    if (!b) return Response.json({ error: "Backup not found" }, { status: 404 });
    const snapshot = b.snapshot as { files: Array<{
      path: string; isDirectory: boolean;
      content: string | null; binaryContent: string | null;
      isBinary: boolean; mimeType: string | null; sizeBytes: number;
    }> };

    // Replace all files
    await db.transaction(async (tx) => {
      await tx.delete(filesTbl).where(eq(filesTbl.serverId, id));
      if (snapshot.files.length > 0) {
        const vals = snapshot.files.map((f) => ({
          serverId: id,
          path: f.path,
          name: f.path.split("/").pop() ?? f.path,
          isDirectory: f.isDirectory,
          content: f.content,
          binaryContent: f.binaryContent,
          isBinary: f.isBinary,
          sizeBytes: f.sizeBytes,
          mimeType: f.mimeType,
        }));
        const chunk = 200;
        for (let i = 0; i < vals.length; i += chunk) {
          await tx.insert(filesTbl).values(vals.slice(i, i + chunk));
        }
      }
    });
    await logActivity({ userId: u.id, serverId: id, action: "RESTORE_BACKUP", detail: b.name });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const u = await requireUser();
    await getServerForUser(id, u);
    const url = new URL(req.url);
    const bid = url.searchParams.get("backupId");
    if (!bid) return Response.json({ error: "backupId required" }, { status: 400 });
    await db.delete(backups).where(and(eq(backups.id, bid), eq(backups.serverId, id)));
    await logActivity({ userId: u.id, serverId: id, action: "DELETE_BACKUP" });
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
