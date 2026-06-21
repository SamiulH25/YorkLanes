#!/usr/bin/env node
/**
 * Onboarding check — run after copying env files from the maintainer.
 * Usage: npm run setup
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const errors = [];
const warnings = [];

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

// --- API env ---
const apiEnv = readEnvFile("apps/api/.env");
if (!apiEnv) {
  errors.push("Missing apps/api/.env — ask the database maintainer for a copy.");
} else if (!envValue(apiEnv, "SUPABASE_DB_URL") && !envValue(apiEnv, "DATABASE_URL")) {
  errors.push("apps/api/.env needs SUPABASE_DB_URL (get it from the maintainer).");
}

// --- Web env (.env.local preferred) ---
const webLocal = readEnvFile("apps/web/.env.local");
const webEnv = readEnvFile("apps/web/.env");
const webContent = webLocal ?? webEnv;

if (!webContent) {
  errors.push("Missing apps/web/.env.local — ask the database maintainer for a copy.");
} else {
  if (!envValue(webContent, "PUBLIC_API_URL")) {
    warnings.push("PUBLIC_API_URL not set in web env — defaulting to http://localhost:3001");
  }
  if (!envValue(webContent, "SUPABASE_KEY")) {
    warnings.push("SUPABASE_KEY not set — /todos test page will fail; degree plan uses API only.");
  }
}

// --- Python parser ---
const pythonPath = apiEnv ? envValue(apiEnv, "PYTHON_PATH") : null;
const parserReqs = join(root, "services/checklist-parser/requirements.txt");
const venvWin = join(root, "services/checklist-parser/.venv/Scripts/python.exe");
const venvUnix = join(root, "services/checklist-parser/.venv/bin/python");

let pythonCmd = pythonPath ?? (existsSync(venvWin) ? venvWin : existsSync(venvUnix) ? venvUnix : "python");

try {
  execSync(`"${pythonCmd}" -c "import pdfplumber"`, { stdio: "pipe" });
} catch {
  warnings.push(
    "Python checklist parser not ready — degree plan import will fail. " +
      "Run: cd services/checklist-parser && python -m venv .venv && pip install -r requirements.txt",
  );
}

// --- Report ---
console.log("YorkLanes setup check\n");

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log();
}

if (errors.length > 0) {
  console.log("Errors:");
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log("\nSee CONTRIBUTING.md and docs/development.md");
  process.exit(1);
}

console.log("✓ Env files look good. Run: npm run dev");
console.log("  Web:  http://localhost:4321/dashboard");
console.log("  API:  http://localhost:3001/health");
console.log("  Plan: http://localhost:4321/plan/setup");
