// End-to-end test: real Telegram bots (Python / Node.js / PHP) on the running platform.
//   node tests/telegram/emulator.mjs &           (test harness: local Bot API with fault injection)
//   node tests/telegram/e2e.mjs <BASE_URL> <ADMIN_EMAIL> <ADMIN_PASSWORD>
// Every assertion checks real data: platform API, /proc (PIDs, process count), process logs,
// and the Bot API traffic actually received by the emulator. The final phase calls the REAL
// api.telegram.org through the platform's preflight.
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

const [BASE, EMAIL, PASSWORD] = process.argv.slice(2);
const CTRL = "http://127.0.0.1:8082";
const EMU_API = "http://127.0.0.1:8081";
const DATA = path.resolve("/app/.data/servers");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let cookie = "";
let failures = 0;
const results = [];

function check(name, ok, info = "") {
  results.push({ name, ok });
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${info ? `  — ${info}` : ""}`);
}
async function api(p, opts = {}) {
  const r = await fetch(BASE + p, { ...opts, headers: { ...(opts.body && !(opts.body instanceof FormData) ? { "content-type": "application/json" } : {}), cookie } });
  const sc = r.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t }; }
}
const ctrl = async (p, body) => (await fetch(CTRL + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
const server = async (id) => (await api(`/api/servers/${id}`)).body.server;
const logs = async (id) => (await api(`/api/servers/${id}/logs?limit=500`)).body.logs ?? [];
async function waitFor(fn, ms, every = 1000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(every);
  }
}
const waitStatus = (id, statuses, ms = 240000) => waitFor(async () => { const s = await server(id); return statuses.includes(s.status) ? s : null; }, ms, 1500);
function pidAlive(pid) { try { fs.accessSync(`/proc/${pid}`); return true; } catch { return false; } }
function workspaceProcs(id) {
  const ws = path.join(DATA, id);
  const out = [];
  for (const e of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(e)) continue;
    try {
      const cwd = fs.readlinkSync(`/proc/${e}/cwd`);
      if (cwd === ws || cwd.startsWith(ws + "/")) out.push({ pid: +e, cmd: fs.readFileSync(`/proc/${e}/cmdline`, "utf8").replace(/\0/g, " ").trim() });
    } catch {}
  }
  return out;
}
const pidOf = (s) => (s?.containerId?.startsWith("pid-") ? Number(s.containerId.slice(4)) : 0);
async function sentContains(token, text, ms = 25000) {
  return waitFor(async () => {
    const st = await (await fetch(`${CTRL}/state?token=${encodeURIComponent(token)}`)).json();
    return st.sent.some((m) => m.text === text) ? st : null;
  }, ms, 500);
}
async function roundTrip(b, text, expect = text, ms = 25000) {
  await ctrl("/push", { token: b.token, text });
  const t0 = Date.now();
  const ok = await sentContains(b.token, expect, ms);
  return { ok: !!ok, ms: Date.now() - t0 };
}

// ───────────────────────────── main ─────────────────────────────
const { TELEGRAM_TEMPLATES } = await import("/tmp/bt/telegram-templates.js");
const BOTS = TELEGRAM_TEMPLATES.map((t, i) => ({ t, lang: t.language, token: `90000000${i + 1}:TEST_${t.language.toUpperCase()}_abcdefghijklmnopqrstuvwxyz`, id: "" }));

console.log(`== login`);
check("admin login", (await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).status === 200);
const runtimes = (await api("/api/runtimes")).body.runtimes;
for (const lang of ["python", "node", "php"]) {
  const r = runtimes.find((x) => x.type === lang);
  check(`runtime available: ${lang}`, !!r, r ? `${r.displayName}` : "missing");
}

console.log(`\n== upload ZIP → detect → install → start (all 3 in parallel)`);
await Promise.all(BOTS.map(async (b) => {
  const zip = new AdmZip();
  for (const f of b.t.files) zip.addFile(`my-${b.lang}-bot/${f.path}`, Buffer.from(f.content, "utf8"));
  const blob = new Blob([zip.toBuffer()], { type: "application/zip" });
  const fdDetect = new FormData();
  fdDetect.append("file", blob, `${b.lang}-bot.zip`);
  const det = (await api("/api/detect", { method: "POST", body: fdDetect })).body.detected;
  check(`[${b.lang}] runtime detected from ZIP`, det?.runtime === b.t.runtime, `${det?.runtime} · start: ${det?.startCommand} · install: ${det?.installCommand ?? "—"}`);
  const version = runtimes.find((x) => x.type === det.runtime).version;
  const created = (await api("/api/servers", { method: "POST", body: JSON.stringify({ name: `e2e-telegram-${b.lang}`, runtime: det.runtime, runtimeVersion: version, startCommand: det.startCommand, installCommand: det.installCommand, entryPoint: det.entryPoint }) })).body.server;
  b.id = created.id;
  const fd = new FormData();
  fd.append("file", blob, `${b.lang}-bot.zip`);
  const up = (await api(`/api/servers/${b.id}/files/upload`, { method: "POST", body: fd })).body;
  check(`[${b.lang}] ZIP uploaded & extracted`, up.ok && up.written === b.t.files.length, `${up.written} files`);
  await api(`/api/servers/${b.id}/env`, { method: "POST", body: JSON.stringify({ key: "BOT_TOKEN", value: b.token, isSecret: true }) });
  await api(`/api/servers/${b.id}/env`, { method: "POST", body: JSON.stringify({ key: "TELEGRAM_API_URL", value: EMU_API, isSecret: false }) });
  const t0 = Date.now();
  await api(`/api/servers/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) });
  const s = await waitStatus(b.id, ["RUNNING", "ERROR"]);
  check(`[${b.lang}] deployed → RUNNING`, s?.status === "RUNNING", `${s?.status} in ${Math.round((Date.now() - t0) / 1000)}s`);
  b.pid = pidOf(s);
  const procs = workspaceProcs(b.id);
  check(`[${b.lang}] real process exists (PID ${b.pid})`, b.pid > 0 && pidAlive(b.pid) && procs.length === 1, procs.map((p) => `${p.pid}:${p.cmd}`).join(" | "));
  const l = await logs(b.id);
  check(`[${b.lang}] connected to Telegram API (getMe)`, l.some((x) => /Connected to Telegram as @arena_test_/.test(x.message)));
  check(`[${b.lang}] token not leaked in logs`, !l.some((x) => x.message.includes(b.token)));
}));

console.log(`\n== polling: receive message → respond`);
await Promise.all(BOTS.map(async (b) => {
  const r1 = await roundTrip(b, `hello from ${b.lang}`);
  check(`[${b.lang}] message received & echoed`, r1.ok, `${r1.ms} ms`);
  const r2 = await roundTrip(b, "/ping", "pong 🏓");
  check(`[${b.lang}] /ping → pong`, r2.ok, `${r2.ms} ms`);
  const seen = await waitFor(async () => (await logs(b.id)).filter((x) => x.message === `[message] 777000: hello from ${b.lang}`).length, 3000, 300);
  check(`[${b.lang}] message visible in console logs (exactly once)`, seen === 1, `${seen ?? 0} line(s)`);
}));

console.log(`\n== real CPU/RAM metrics (sampled from /proc)`);
await Promise.all(BOTS.map(async (b) => {
  const m = await waitFor(async () => { const r = (await api(`/api/servers/${b.id}/metrics?limit=5`)).body; return r.metrics?.length && r.metrics.at(-1).ramMb > 0 ? r : null; }, 25000, 2000);
  const last = m?.metrics.at(-1);
  check(`[${b.lang}] metrics recorded`, !!m && m.processRunning, last ? `RAM ${last.ramMb} MB · CPU ${last.cpuPercent}% · disk ${last.diskMb} MB` : "none");
}));

for (const [mode, ms, label] of [["reset", 12000, "connection reset"], ["502", 8000, "502 Bad Gateway"], ["hang", 45000, "network timeout (requests hang)"]]) {
  console.log(`\n== outage: ${label} for ${ms / 1000}s → automatic reconnect`);
  const marks = Object.fromEntries(await Promise.all(BOTS.map(async (b) => [b.lang, ((await logs(b.id)).at(-1)?.id) ?? 0])));
  await ctrl("/outage", { mode, ms });
  await sleep(ms + 500);
  await ctrl("/outage", { mode: "none" });
  await Promise.all(BOTS.map(async (b) => {
    const rec = await waitFor(async () => { const l = (await logs(b.id)).filter((x) => x.id > marks[b.lang]); const lost = l.find((x) => /connection to Telegram lost/.test(x.message)); const back = l.find((x) => /Reconnected to Telegram/.test(x.message)); return lost && back ? { lost, back } : null; }, 70000, 2000);
    check(`[${b.lang}] ${mode}: lost → reconnected`, !!rec, rec ? `"${rec.lost.message.slice(0, 90)}" … "${rec.back.message.slice(0, 60)}"` : "no reconnect log");
    const s = await server(b.id);
    check(`[${b.lang}] ${mode}: same process kept running (no crash)`, s.status === "RUNNING" && pidOf(s) === b.pid && pidAlive(b.pid), `status ${s.status} pid ${pidOf(s)}`);
    const r = await roundTrip(b, `after ${mode} ${b.lang}`);
    check(`[${b.lang}] ${mode}: messages work again`, r.ok, `${r.ms} ms`);
  }));
}

console.log(`\n== stop → start → restart (no duplicates)`);
await Promise.all(BOTS.map(async (b) => {
  await api(`/api/servers/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "stop" }) });
  const s = await waitStatus(b.id, ["STOPPED"], 20000);
  await sleep(500);
  check(`[${b.lang}] stop → STOPPED, process gone`, s?.status === "STOPPED" && !pidAlive(b.pid) && workspaceProcs(b.id).length === 0, `old pid ${b.pid} alive=${pidAlive(b.pid)}`);
  check(`[${b.lang}] graceful shutdown logged`, (await logs(b.id)).some((x) => /Shutting down gracefully/.test(x.message)));
  await sleep(1500);
  const st = await (await fetch(`${CTRL}/state?token=${b.token}`)).json();
  check(`[${b.lang}] no poller left after stop`, st.active === 0, `active polls ${st.active}`);

  await api(`/api/servers/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) });
  const s2 = await waitStatus(b.id, ["RUNNING", "ERROR"], 60000);
  const p2 = pidOf(s2);
  const dup = await api(`/api/servers/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) });
  check(`[${b.lang}] start again → new PID, double-start rejected`, s2?.status === "RUNNING" && p2 !== b.pid && pidAlive(p2) && dup.status === 409, `pid ${p2}, 2nd start HTTP ${dup.status}`);
  check(`[${b.lang}] deps cached on redeploy`, b.t.installCommand ? (await logs(b.id)).some((x) => /using cached install/.test(x.message)) : true);

  await ctrl("/reset-concurrency", { token: b.token });
  await api(`/api/servers/${b.id}/action`, { method: "POST", body: JSON.stringify({ action: "restart" }) });
  await sleep(2000);
  const s3 = await waitStatus(b.id, ["RUNNING", "ERROR"], 60000);
  const p3 = pidOf(s3);
  await sleep(1500);
  const st3 = await (await fetch(`${CTRL}/state?token=${b.token}`)).json();
  const procs = workspaceProcs(b.id);
  check(`[${b.lang}] restart → old PID gone, exactly 1 process`, s3?.status === "RUNNING" && !pidAlive(p2) && pidAlive(p3) && procs.length === 1, `pid ${p2} → ${p3}, procs ${procs.length}`);
  check(`[${b.lang}] never 2 pollers at once`, st3.maxConcurrent <= 1, `max concurrent getUpdates ${st3.maxConcurrent}`);
  const r = await roundTrip(b, `after restart ${b.lang}`);
  check(`[${b.lang}] works after restart`, r.ok, `${r.ms} ms`);
  b.pid = p3;
}));

console.log(`\n== crash (kill -9) → auto-restart`);
await Promise.all(BOTS.map(async (b) => {
  const before = await server(b.id);
  process.kill(b.pid, "SIGKILL");
  const crashed = await waitFor(async () => { const l = await logs(b.id); return l.some((x) => /Process crashed \(signal SIGKILL\)/.test(x.message)); }, 15000, 500);
  const s = await waitFor(async () => { const x = await server(b.id); return x.status === "RUNNING" && pidOf(x) && pidOf(x) !== b.pid ? x : null; }, 40000, 1000);
  check(`[${b.lang}] crash detected`, !!crashed);
  check(`[${b.lang}] auto-restarted with new PID`, !!s && pidAlive(pidOf(s)) && workspaceProcs(b.id).length === 1, s ? `pid ${b.pid} → ${pidOf(s)}, restarts ${before.restartCount} → ${s.restartCount}` : "not restarted");
  const r = await roundTrip(b, `after crash ${b.lang}`);
  check(`[${b.lang}] works after crash recovery`, r.ok, `${r.ms} ms`);
}));

console.log(`\n== REAL api.telegram.org (platform preflight with an invalid token)`);
{
  const t = TELEGRAM_TEMPLATES[0];
  const c = (await api("/api/servers", { method: "POST", body: JSON.stringify({ name: "e2e-real-telegram", runtime: "python", runtimeVersion: runtimes.find((x) => x.type === "python").version, startCommand: t.startCommand, installCommand: t.installCommand, files: t.files.map((f) => ({ path: f.path, content: f.content, sizeBytes: f.content.length })), env: [{ key: "BOT_TOKEN", value: "123456789:AAInvalidTokenForE2E_abcdefghijklmnop", isSecret: true }] }) })).body.server;
  await api(`/api/servers/${c.id}/action`, { method: "POST", body: JSON.stringify({ action: "start" }) });
  const s = await waitStatus(c.id, ["ERROR", "RUNNING"], 180000);
  const l = await logs(c.id);
  const line = l.find((x) => /Telegram rejected BOT_TOKEN \(401/.test(x.message));
  check("real Telegram API reached → invalid token rejected before start (no crash loop)", s?.status === "ERROR" && !!line && workspaceProcs(c.id).length === 0, line?.message.slice(0, 120));
  await api(`/api/servers/${c.id}`, { method: "DELETE" });
}

console.log(`\n== cleanup`);
for (const b of BOTS) await api(`/api/servers/${b.id}`, { method: "DELETE" });
await sleep(1500);
check("all bot processes terminated & workspaces removed", BOTS.every((b) => workspaceProcs(b.id).length === 0 && !fs.existsSync(path.join(DATA, b.id))));

const passed = results.filter((r) => r.ok).length;
console.log(`\nRESULT: ${passed}/${results.length} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
