import { execFile } from "node:child_process";
import { mkdtemp, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export interface ParsedCourse {
  code: string;
  credits: number | null;
  raw: string;
}

export interface ParsedYear {
  year: number;
  courses: ParsedCourse[];
}

export interface ParsedChecklist {
  programme_hint: string | null;
  years: ParsedYear[];
  warnings: string[];
  error?: string;
}

const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));
const PARSER_SCRIPT = join(REPO_ROOT, "services", "checklist-parser", "parse_checklist.py");
const PYTHON = process.env.PYTHON_PATH ?? "python";

export async function parseChecklistFile(
  buffer: Buffer,
  originalName: string,
): Promise<ParsedChecklist> {
  const ext = originalName.toLowerCase().match(/\.(pdf|docx|doc)$/)?.[0] ?? ".pdf";
  const tempDir = await mkdtemp(join(tmpdir(), "yorklanes-checklist-"));
  const tempPath = join(tempDir, `upload${ext}`);

  try {
    await writeFile(tempPath, buffer);
    const { stdout } = await execFileAsync(PYTHON, [PARSER_SCRIPT, tempPath], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = JSON.parse(stdout) as ParsedChecklist;
    if (parsed.error) {
      throw new Error(parsed.error);
    }
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checklist parsing failed";
    return {
      programme_hint: null,
      years: [{ year: 1, courses: [] }],
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
