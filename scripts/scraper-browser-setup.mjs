#!/usr/bin/env node
/**
 * Install Playwright into /tmp when home quota is tight (common on university labs).
 */
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scraperDir = join(root, "services/scraper");
const pip = join(scraperDir, process.platform === "win32" ? ".venv/Scripts/pip.exe" : ".venv/bin/pip");
const playwright = join(
  scraperDir,
  process.platform === "win32" ? ".venv/Scripts/playwright.exe" : ".venv/bin/playwright",
);

const browserPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ??
  (process.platform === "win32"
    ? join(scraperDir, ".cache", "playwright-browsers")
    : `/tmp/${process.env.USER ?? "yorklanes"}-playwright-browsers`);

// Reuse /tmp browser path for all scraper Python runs unless already set.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.platform !== "win32") {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browserPath;
}

mkdirSync(browserPath, { recursive: true });

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserPath };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: scraperDir, stdio: "inherit", env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Using PLAYWRIGHT_BROWSERS_PATH=${browserPath}`);
run(pip, ["install", "-r", "requirements-browser.txt"]);
run(playwright, ["install", "chromium"]);
console.log("Playwright Chromium ready.");
console.log(`Keep this env var for bootstrap:\n  export PLAYWRIGHT_BROWSERS_PATH=${browserPath}`);
