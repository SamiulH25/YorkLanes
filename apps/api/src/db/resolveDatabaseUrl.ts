/**
 * Resolve Postgres connection string for the API.
 * Prefers hosted Supabase (SUPABASE_DB_URL) over local defaults.
 */
export function resolveDatabaseUrl(): string {
  const hosted = process.env.SUPABASE_DB_URL?.trim();
  if (hosted) {
    return hosted;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "No database configured. Set SUPABASE_DB_URL in apps/api/.env (ask the database maintainer for the connection string).",
    );
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const usingLocalDefault =
    databaseUrl.includes("localhost:54322") || databaseUrl.includes("127.0.0.1:54322");

  if (usingLocalDefault && supabaseUrl.includes("supabase.co")) {
    throw new Error(
      "DATABASE_URL points to local Supabase (localhost:54322) but SUPABASE_URL is hosted. " +
        "Set SUPABASE_DB_URL in apps/api/.env to your hosted Postgres connection string instead.",
    );
  }

  return databaseUrl;
}

export function describeDatabaseTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "unknown";
  }
}
