#!/usr/bin/env node
/**
 * Render docs/diagrams/src/*.mmd → docs/diagrams/png/*.png
 * Uses @mermaid-js/mermaid-cli (mmdc) via npx.
 */
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const srcDir = join(root, "docs/diagrams/src");
const outDir = join(root, "docs/diagrams/png");
const config = join(root, "docs/diagrams/mermaid.config.json");

if (!existsSync(srcDir)) {
  console.error(`Missing ${srcDir}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const files = readdirSync(srcDir)
  .filter((name) => name.endsWith(".mmd"))
  .sort();

if (files.length === 0) {
  console.error("No .mmd files in docs/diagrams/src");
  process.exit(1);
}

let failed = 0;

for (const file of files) {
  const input = join(srcDir, file);
  const output = join(outDir, `${basename(file, ".mmd")}.png`);
  const args = [
    "@mermaid-js/mermaid-cli",
    "-i",
    input,
    "-o",
    output,
    "-c",
    config,
    "-b",
    "white",
    "-s",
    "2",
  ];

  console.log(`Rendering ${file} → png/${basename(output)}`);
  const result = spawnSync("npx", args, { cwd: root, stdio: "inherit", shell: false });

  if (result.status !== 0) {
    failed += 1;
    console.error(`Failed: ${file}`);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n✓ Rendered ${files.length - failed} diagram(s) to docs/diagrams/png/`);
