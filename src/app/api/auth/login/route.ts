import { db } from "@/db";
import { users } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_DAYS,
  createSession,
  errorResponse,
  verifyPassword,
} from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, requestKey } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

export async function POST(req: NextRequest) {
  try {
    const ipLimit = rateLimit(requestKey(req, "login"), 10, 15 * 60_000);
    if (!ipLimit.ok) {
      return Response.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } }
      );
    }
    await ensureBootstrap();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json({ error: "Invalid input" }, { status: 400 });

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email.toLowerCase()))
      .limit(1);
    if (!user || !user.passwordHash)
      return Response.json({ error: "Invalid credentials" }, { status: 401 });
    if (user.status !== "ACTIVE")
      return Response.json(
        { error: `Account is ${user.status.toLowerCase()}` },
        { status: 403 }
      );

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok)
      return Response.json({ error: "Invalid credentials" }, { status: 401 });

    const token = await createSession(user.id, {
      ip:
        req.headers.get("x-forwarded-for") ??
        req.headers.get("x-real-ip") ??
        undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
      path: "/",
    });
    await logActivity({ userId: user.id, action: "LOGIN" });

    return Response.json({ ok: true, role: user.role });
  } catch (e) {
    return errorResponse(e);
  }
}
