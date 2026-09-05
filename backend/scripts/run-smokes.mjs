// The full end-to-end suite in one command (2.0 execution item 14 —
// reliability pass; also the ROADMAP's "CI end-to-end job" hardening item).
//
// Each smoke suite gets a FRESH server boot: per-IP rate limits
// (signups 5/10min, uploads 5/10min) are in-memory, so back-to-back suites
// against one process trip them — a restart between suites is correctness,
// not paranoia. The creator suite runs twice: once dark (the shipping
// default) and once with FEATURE_USER_VIDEO_POSTING=true.
//
// Usage:  npm run build && node scripts/run-smokes.mjs
// Env:    PORT (default 4000) — everything else is set here.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const backendDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT ?? "4000";
const BASE = `http://localhost:${PORT}`;
const CRON_SECRET = "smoke-cron-secret-1234567890";

const BASE_ENV = {
  ...process.env,
  PORT,
  JWT_SECRET: "dev-only-smoke-test-secret-0123456789abcdef",
  DATABASE_URL: "file:./dev.db",
  CRON_SECRET,
  AI_PROVIDER: "mock",
};

const SUITES = [
  { name: "guest", script: "smoke-guest.mjs" },
  { name: "onboarding", script: "smoke-onboarding.mjs" },
  { name: "image", script: "smoke-image.mjs" },
  { name: "knowledge", script: "smoke-knowledge.mjs" },
  { name: "socratic3", script: "smoke-socratic3.mjs" },
  { name: "communities", script: "smoke-communities.mjs" },
  { name: "buddies", script: "smoke-buddies.mjs" },
  { name: "dms", script: "smoke-dms.mjs" },
  { name: "videos", script: "smoke-videos.mjs" },
  { name: "fyp", script: "smoke-fyp.mjs" },
  { name: "rooms", script: "smoke-rooms.mjs" },
  { name: "creator (flag off)", script: "smoke-creator.mjs" },
  {
    name: "creator (flag ON)",
    script: "smoke-creator.mjs",
    serverEnv: { FEATURE_USER_VIDEO_POSTING: "true" },
    smokeEnv: { FLAG_ON: "1" },
  },
];

if (!existsSync(join(backendDir, "dist", "server.js"))) {
  console.error("dist/server.js missing — run `npm run build` first.");
  process.exit(1);
}

function startServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["dist/server.js"], {
    cwd: backendDir,
    env: { ...BASE_ENV, ...extraEnv },
    stdio: "ignore",
  });
  return child;
}

async function waitHealthy(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function runSmoke(script, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join("scripts", script), BASE], {
      cwd: backendDir,
      env: { ...BASE_ENV, ...extraEnv },
      stdio: "inherit",
    });
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((r) => setTimeout(r, 1200));
  if (child.exitCode === null) child.kill("SIGKILL");
}

const results = [];
for (const suite of SUITES) {
  console.log(`\n=== ${suite.name} ===`);
  const server = startServer(suite.serverEnv);
  const healthy = await waitHealthy();
  if (!healthy) {
    console.error("  server never became healthy");
    results.push({ name: suite.name, code: 1 });
    await stopServer(server);
    continue;
  }
  const code = await runSmoke(suite.script, suite.smokeEnv);
  results.push({ name: suite.name, code });
  await stopServer(server);
}

console.log("\n========== SUMMARY ==========");
let failed = 0;
for (const r of results) {
  const ok = r.code === 0;
  if (!ok) failed += 1;
  console.log(`  ${ok ? "✔" : "✘"} ${r.name}`);
}
console.log(
  `\n${results.length - failed}/${results.length} suites passed${failed ? ` — ${failed} FAILED` : ""}`
);
process.exit(failed > 0 ? 1 : 0);
