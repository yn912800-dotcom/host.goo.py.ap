import { errorResponse, requireUser } from "@/lib/auth";
import { extractZip } from "@/lib/zip";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return Response.json({ error: "No file provided" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const entries = extractZip(buf);
    return Response.json({
      files: entries.map((e) => ({
        path: e.path,
        isDirectory: e.isDirectory,
        sizeBytes: e.sizeBytes,
        mimeType: e.mimeType,
        isBinary: e.isBinary,
        content: e.content,
        binaryContent: e.binaryContent,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
