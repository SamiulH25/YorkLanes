import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

/**
 * Python executable for checklist/complementary parsers.
 * Prefers PYTHON_PATH, then services/checklist-parser/.venv, then "python".
 */
export function resolvePythonPath(): string {
  const fromEnv = process.env.PYTHON_PATH?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const venvWin = join(REPO_ROOT, "services", "checklist-parser", ".venv", "Scripts", "python.exe");
  const venvUnix = join(REPO_ROOT, "services", "checklist-parser", ".venv", "bin", "python");

  if (existsSync(venvWin)) {
    return venvWin;
  }
  if (existsSync(venvUnix)) {
    return venvUnix;
  }

  return "python";
}
