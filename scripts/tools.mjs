#!/usr/bin/env node
/**
 * YorkLanes developer tools — run via npm scripts or directly.
 *
 *   npm run tools          List commands
 *   npm run setup          Check env files + Python parser
 *   npm run doctor         Setup checks + live API health (dev server must be running)
 *   npm run smoke          Hit key API endpoints (dev server must be running)
 *   npm run test:parser    Run checklist parser pytest suite
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const cmd = process.argv[2] ?? "help";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function readEnvFile(relPath) {
  const path = join(root, relPath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function envValue(content, key) {
  if (!content) return null;
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw || raw.startsWith("[") || raw.includes("FROM-MAINTAINER") || raw.includes("YOUR-")) {
    return null;
  }
  return raw;
}

function apiBaseUrl() {
  const web = readEnvFile("apps/web/.env.local") ?? readEnvFile("apps/web/.env");
  return envValue(web, "PUBLIC_API_URL") ?? "http://localhost:3001";
}

function pythonCommand() {
  const apiEnv = readEnvFile("apps/api/.env");
  const fromEnv = apiEnv ? envValue(apiEnv, "PYTHON_PATH") : null;
  const venvWin = join(root, "services/checklist-parser/.venv/Scripts/python.exe");
  const venvUnix = join(root, "services/checklist-parser/.venv/bin/python");
  return fromEnv ?? (existsSync(venvWin) ? venvWin : existsSync(venvUnix) ? venvUnix : "python");
}

function runSetup() {
  const errors = [];
  const warnings = [];

  const apiEnv = readEnvFile("apps/api/.env");
  if (!apiEnv) {
    errors.push("Missing apps/api/.env — ask the database maintainer.");
  } else if (!envValue(apiEnv, "SUPABASE_DB_URL") && !envValue(apiEnv, "DATABASE_URL")) {
    errors.push("apps/api/.env needs SUPABASE_DB_URL.");
  }

  const webContent = readEnvFile("apps/web/.env.local") ?? readEnvFile("apps/web/.env");
  if (!webContent) {
    errors.push("Missing apps/web/.env.local — ask the database maintainer.");
  } else if (!envValue(webContent, "PUBLIC_API_URL")) {
    warnings.push("PUBLIC_API_URL not set — using http://localhost:3001");
  }

  try {
    execSync(`"${pythonCommand()}" -c "import pdfplumber"`, { stdio: "pipe" });
  } catch {
    warnings.push(
      "Python parser not ready. Run: cd services/checklist-parser && python -m venv .venv && pip install -r requirements.txt",
    );
  }

  return { errors, warnings };
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`
YorkLanes developer tools

  npm run setup        Verify env files and Python parser
  npm run doctor       Setup + API health (start npm run dev first)
  npm run smoke        Test API endpoints (start npm run dev first)
  npm run test:parser  Run checklist parser tests
  npm run check        Typecheck API + Astro
  npm run dev          Start API + web

Docs: CONTRIBUTING.md  |  scripts/README.md
`);
}

function commandSetup() {
  console.log("Setup check\n");
  const { errors, warnings } = runSetup();

  for (const w of warnings) console.log(`  ⚠ ${w}`);
  if (warnings.length) console.log();

  if (errors.length) {
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log("\nSee CONTRIBUTING.md");
    process.exit(1);
  }

  console.log("✓ Ready. Run: npm run dev");
  console.log("  Web: http://localhost:4321/dashboard");
  console.log("  API: http://localhost:3001/health");
}

async function commandDoctor() {
  console.log("Doctor\n");
  const { errors, warnings } = runSetup();

  for (const w of warnings) console.log(`  ⚠ ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);

  if (errors.length) {
    console.log("\nFix setup errors first (npm run setup).");
    process.exit(1);
  }

  const base = apiBaseUrl();
  console.log(`\nAPI (${base})`);

  try {
    const health = await fetchJson(`${base}/health`);
    if (health.ok) {
      console.log(`  ✓ /health — ${health.body.status ?? "ok"}`);
      console.log(`    database: ${health.body.database ? "connected" : "failed"}`);
      console.log(`    degree plan tables: ${health.body.degreePlanTables ? "ok" : "missing"}`);
      if (health.body.hint) console.log(`    hint: ${health.body.hint}`);
    } else {
      console.log(`  ✗ /health — HTTP ${health.status}`);
    }
  } catch {
    console.log("  ✗ Cannot reach API — is npm run dev running?");
    process.exit(1);
  }

  console.log("\n✓ Doctor complete");
}

async function commandSmoke() {
  const base = apiBaseUrl();
  console.log(`Smoke test — ${base}\n`);

  const endpoints = [
    { name: "Health", path: "/health" },
    { name: "Faculties", path: "/api/plans/faculties" },
    { name: "Dashboard", path: "/api/dashboard/summary" },
  ];

  let failed = false;
  for (const { name, path } of endpoints) {
    try {
      const res = await fetchJson(`${base}${path}`);
      if (res.ok) {
        console.log(`  ✓ ${name} (${path})`);
      } else {
        console.log(`  ✗ ${name} (${path}) — HTTP ${res.status}`);
        failed = true;
      }
    } catch {
      console.log(`  ✗ ${name} (${path}) — connection failed`);
      failed = true;
    }
  }

  if (failed) {
    console.log("\nStart the API with npm run dev and try again.");
    process.exit(1);
  }
  console.log("\n✓ All endpoints OK");
}

function commandParser() {
  console.log("Checklist parser tests\n");
  const dir = join(root, "services/checklist-parser");
  const py = pythonCommand();
  const result = spawnSync(py, ["-m", "pytest", "-q"], { cwd: dir, stdio: "inherit", shell: true });
  process.exit(result.status ?? 1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

switch (cmd) {
  case "help":
    printHelp();
    break;
  case "setup":
    commandSetup();
    break;
  case "doctor":
    await commandDoctor();
    break;
  case "smoke":
    await commandSmoke();
    break;
  case "parser":
    commandParser();
    break;
  default:
    console.error(`Unknown command: ${cmd}\n`);
    printHelp();
    process.exit(1);
}
