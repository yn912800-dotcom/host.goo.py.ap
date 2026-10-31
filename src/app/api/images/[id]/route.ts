import { db } from "@/db";
import { files } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const [file] = await db
    .select({ mimeType: files.mimeType, content: files.content, binaryContent: files.binaryContent, name: files.name })
    .from(files)
    .where(and(eq(files.id, id), sql`${files.path} LIKE 'images/%'`))
    .limit(1);
  if (!file || !file.mimeType || !ALLOWED.has(file.mimeType)) return new Response("Not found", { status: 404 });
  const body = file.binaryContent ? Buffer.from(file.binaryContent, "base64") : Buffer.from(file.content ?? "", "utf8");
  return new Response(body, {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}"`,
    },
  });
}
