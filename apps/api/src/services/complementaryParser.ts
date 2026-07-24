/**
 * Spawns the Python complementary studies parser (services/checklist-parser/parse_complementary.py).
 */
import { execFile } from "node:child_process";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolvePythonPath } from "../lib/pythonPath.js";

const execFileAsync = promisify(execFile);

export interface ComplementarySubjectArea {
  name: string;
  prefixes: string[];
}

export interface ComplementaryListedCourse {
  code: string;
  credits: number;
  raw: string;
  counts_as_subject_area: boolean;
}

export interface ComplementaryCatalog {
  programme_hint: string | null;
  rules: {
    total_credits: number;
    min_subject_area_credits: number;
  };
  subject_areas: ComplementarySubjectArea[];
  listed_courses: ComplementaryListedCourse[];
  warnings: string[];
  error?: string;
}

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const PARSER_SCRIPT = join(REPO_ROOT, "services", "checklist-parser", "parse_complementary.py");

export async function parseComplementaryFile(
  buffer: Buffer,
  originalName: string,
): Promise<ComplementaryCatalog> {
  const ext = originalName.toLowerCase().match(/\.pdf$/)?.[0] ?? ".pdf";
  if (ext !== ".pdf") {
    return {
      programme_hint: null,
      rules: { total_credits: 12, min_subject_area_credits: 3 },
      subject_areas: [],
      listed_courses: [],
      warnings: ["Only PDF complementary studies documents are supported."],
      error: "Only PDF files are supported",
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "yorklanes-complementary-"));
  const tempPath = join(tempDir, `upload${ext}`);

  try {
    await writeFile(tempPath, buffer);
    const { stdout } = await execFileAsync(resolvePythonPath(), [PARSER_SCRIPT, tempPath], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as ComplementaryCatalog;
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Complementary PDF parsing failed";
    return {
      programme_hint: null,
      rules: { total_credits: 12, min_subject_area_credits: 3 },
      subject_areas: [],
      listed_courses: [],
      warnings: [
        message.includes("ENOENT") || message.includes("spawn")
          ? "Python parser not available. Install services/checklist-parser/requirements.txt and set PYTHON_PATH if needed."
          : message,
      ],
      error: message,
    };
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
