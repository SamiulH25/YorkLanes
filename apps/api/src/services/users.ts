import type { Pool } from "pg";

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  display_name: string;
}

export async function findOrCreateGoogleUser(
  pool: Pool,
  profile: { googleId: string; email: string; displayName: string },
): Promise<UserRow> {
  try {
    const result = await pool.query<UserRow>(
      `INSERT INTO users (google_id, email, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (google_id) DO UPDATE SET
         email = EXCLUDED.email,
         display_name = EXCLUDED.display_name,
         updated_at = NOW()
       RETURNING id, google_id, email, display_name`,
      [profile.googleId, profile.email, profile.displayName],
    );

    return result.rows[0];
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      throw new Error("An account with this email already exists under a different Google sign-in");
    }
    throw error;
  }
}

export async function findUserById(pool: Pool, userId: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    `SELECT id, google_id, email, display_name FROM users WHERE id = $1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
  };
}
