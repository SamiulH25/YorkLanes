/**
 * Serialize JSON for safe embedding in <script type="application/json"> blocks.
 * Prevents </script> breakouts and line-separator issues in JSON.parse.
 */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function parseScriptJson<T>(raw: string | null | undefined): T | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function readJsonResponse<T>(response: Response, label: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let message = `${label} error: ${response.status}`;
    try {
      const payload = JSON.parse(text) as { error?: string; hint?: string };
      if (payload.error) {
        message = payload.hint ? `${payload.error} ${payload.hint}` : payload.error;
      }
    } catch {
      if (text.trim()) {
        message = `${label} error: ${response.status} (${text.slice(0, 120).trim()})`;
      }
    }
    throw new Error(message);
  }

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`${label} returned invalid JSON: ${detail}`);
  }
}
