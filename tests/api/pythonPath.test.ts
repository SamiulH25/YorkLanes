import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

test("resolvePythonPath prefers checklist-parser venv when present", async () => {
  const { resolvePythonPath } = await import("../../apps/api/src/lib/pythonPath.ts");
  const venvUnix = join(REPO_ROOT, "services", "checklist-parser", ".venv", "bin", "python");
  const python = resolvePythonPath();

  if (existsSync(venvUnix)) {
    assert.equal(python, venvUnix);
  } else {
    assert.ok(python.length > 0);
  }
});
