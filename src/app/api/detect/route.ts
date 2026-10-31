import { errorResponse, requireUser } from "@/lib/auth";
import { detectRuntime } from "@/lib/runtime-detect";
import { extractZip } from "@/lib/zip";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File))
        return Response.json({ error: "No file provided" }, { status: 400 });
      const buf = Buffer.from(await file.arrayBuffer());
      let fileEntries: { path: string; content?: string }[] = [];
      if (file.name.toLowerCase().endsWith(".zip")) {
        const entries = extractZip(buf);
        fileEntries = entries
          .filter((e) => !e.isDirectory)
          .map((e) => ({ path: e.path, content: e.isBinary ? undefined : e.content }));
      } else {
        fileEntries = [{ path: file.name, content: buf.toString("utf8") }];
      }
      const detected = detectRuntime(fileEntries);
      return Response.json({ detected, fileCount: fileEntries.length });
    }
    const body = (await req.json()) as {
      files: { path: string; content?: string }[];
    };
    const detected = detectRuntime(body.files ?? []);
    return Response.json({ detected });
  } catch (e) {
    return errorResponse(e);
  }
}
