#!/usr/bin/env node
/**
 * Run services/scraper/scrape_courses.py with the local .venv when present.
 *
 *   node scripts/scraper-run.mjs schedule --subject eecs
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scraperDir = join(root, "services/scraper");
const venvWin = join(scraperDir, ".venv/Scripts/python.exe");
const venvUnix = join(scraperDir, ".venv/bin/python");

function resolvePython() {
  if (existsSync(venvUnix)) return venvUnix;
  if (existsSync(venvWin)) return venvWin;
  return process.platform === "win32" ? "python" : "python3";
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/scraper-run.mjs <scrape_courses.py args...>");
  process.exit(1);
}

const script = args[0]?.endsWith(".py") ? args.shift() : "scrape_courses.py";
const python = resolvePython();
const result = spawnSync(python, [script, ...args], {
  cwd: scraperDir,
  stdio: "inherit",
});

if (result.error?.code === "ENOENT") {
  console.error(
    "\nPython not found. Run: npm run scraper:setup\n",
  );
}

process.exit(result.status ?? 1);
