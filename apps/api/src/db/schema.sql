-- YorkLanes initial database schema (dashboard foundation only).
--
-- SOURCE OF TRUTH: supabase/migrations/
-- This file is a reference mirror. Apply schema changes as new files in
-- supabase/migrations/, then run npm run supabase:reset (local) or
-- npm run supabase:push (remote).
--
-- EXPAND HERE: add tables as features are implemented.
-- Each section notes which team member owns the feature.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Auth & users (all features depend on this)
-- TODO: wire Google OAuth 2.0 (Passport.js or Firebase Auth) in apps/api/src/auth/
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id     TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Onboarding / degree programme selection
-- TODO: populate programme list from scraped degree checklists
-- Samiul: degree plan editor will read/write plan tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_programmes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  programme_name  TEXT NOT NULL,
  starting_year   INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

-- ---------------------------------------------------------------------------
-- Course catalogue (scraped data)
-- Jericho: Course Explorer reads from courses + prerequisites
-- Python scraper (future: services/scraper/) populates these tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  credits       NUMERIC(3, 1),
  department    TEXT,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_prerequisites (
  course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  prerequisite_code   TEXT NOT NULL,
  PRIMARY KEY (course_id, prerequisite_code)
);

-- ---------------------------------------------------------------------------
-- Degree plans (Samiul)
-- TODO: add plan_terms, plan_courses when degree plan editor is built
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Schedule builder (Nabeela)
-- TODO: add schedules, schedule_sections when schedule builder is built
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Progress tracker (Thor)
-- TODO: add requirement_progress when progress tracker is built
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Finance module (Taziz)
-- TODO: add finance_entries when finance module is built
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Assignment calendar (Sarah)
-- TODO: add assignments when assignment calendar is built
-- ---------------------------------------------------------------------------
