import { db } from "@/db";
import { plans, settings, users } from "@/db/schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_DAYS,
  createSession,
  errorResponse,
  hashPassword,
} from "@/lib/auth";
import { ensureBootstrap } from "@/lib/bootstrap";
import { logActivity, notify } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { rateLimit, requestKey } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  try {
    const ipLimit = rateLimit(requestKey(req, "register"), 5, 60 * 60_000);
    if (!ipLimit.ok) {
      return Response.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } }
      );
    }
    await ensureBootstrap();
    const [platform] = await db
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, "platform"))
      .limit(1);
    const platformConfig = (platform?.value ?? {}) as { registrationEnabled?: boolean };
    if (platformConfig.registrationEnabled === false) {
      return Response.json({ error: "Registration is currently disabled" }, { status: 403 });
    }
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      return Response.json(
        { error: "Invalid input", issues: parsed.error.issues },
        { status: 400 }
      );
    const { email, password, name } = parsed.data;

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (existing.length > 0)
      return Response.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );

    const [defaultPlan] = await db
      .select()
      .from(plans)
      .where(eq(plans.isDefault, true))
      .limit(1);

    const hash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        name,
        passwordHash: hash,
        planId: defaultPlan?.id,
      })
      .returning();

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
    await logActivity({ userId: user.id, action: "REGISTER" });
    await notify({
      userId: user.id,
      title: "Welcome to the platform",
      message: `Hi ${user.name}, your account is ready. Create your first project to get started.`,
      type: "success",
    });

    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
