#!/usr/bin/env node
/**
 * Create services/scraper/.venv and install requirements.txt
 */
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scraperDir = join(root, "services/scraper");
const python = process.platform === "win32" ? "python" : "python3";
const venvDir = join(scraperDir, ".venv");
const pip =
  process.platform === "win32"
    ? join(venvDir, "Scripts/pip.exe")
    : join(venvDir, "bin/pip");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!existsSync(venvDir)) {
  console.log("Creating scraper virtualenv...");
  run(python, ["-m", "venv", ".venv"], { cwd: scraperDir });
}

console.log("Installing scraper dependencies...");
run(pip, ["install", "-r", "requirements.txt"], { cwd: scraperDir });
console.log("Scraper Python environment ready.");
