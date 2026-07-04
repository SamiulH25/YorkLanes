/**
 * Resolve Postgres connection string for the API.
 * Uses the hosted Supabase database (SUPABASE_DB_URL) for normal development.
 * Local Docker Postgres is maintainer-only — set ALLOW_LOCAL_SUPABASE=1 to opt in.
 */
export function resolveDatabaseUrl(): string {
  const hosted = process.env.SUPABASE_DB_URL?.trim();
  if (hosted) {
    assertNotAccidentalLocal(hosted, "SUPABASE_DB_URL");
    return hosted;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "No database configured. Set SUPABASE_DB_URL in apps/api/.env to the hosted Postgres connection string (ask the database maintainer).",
    );
  }

  assertNotAccidentalLocal(databaseUrl, "DATABASE_URL");

  const supabaseUrl = process.env.SUPABASE_URL ?? "";
  const usingLocalDefault =
    isLocalSupabaseUrl(databaseUrl);

  if (usingLocalDefault && supabaseUrl.includes("supabase.co")) {
    throw new Error(
      "DATABASE_URL points to local Supabase (localhost:54322) but SUPABASE_URL is hosted. " +
        "Set SUPABASE_DB_URL in apps/api/.env to your hosted Postgres connection string instead.",
    );
  }

  if (usingLocalDefault && process.env.ALLOW_LOCAL_SUPABASE !== "1") {
    throw new Error(
      "DATABASE_URL points to local Docker Postgres (localhost:54322). " +
        "Normal development uses the hosted database — set SUPABASE_DB_URL in apps/api/.env (from the maintainer). " +
        "Maintainers testing locally can set ALLOW_LOCAL_SUPABASE=1.",
    );
  }

  return databaseUrl;
}

function isLocalSupabaseUrl(connectionString: string): boolean {
  return connectionString.includes("localhost:54322") || connectionString.includes("127.0.0.1:54322");
}

function assertNotAccidentalLocal(connectionString: string, label: string): void {
  if (isLocalSupabaseUrl(connectionString)) {
    throw new Error(
      `${label} points to local Docker Postgres (localhost:54322). ` +
        "Use the hosted Supabase connection string from the database maintainer instead.",
    );
  }
}

export function describeDatabaseTarget(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "unknown";
  }
}
