import { SESSION_COOKIE, destroySessionByToken } from "@/lib/auth";
import { cookies } from "next/headers";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    try {
      await destroySessionByToken(token);
    } catch {}
  }
  store.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
