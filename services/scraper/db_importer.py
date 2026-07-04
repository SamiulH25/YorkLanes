"""Upsert scraped courses into Postgres (Supabase)."""
from __future__ import annotations

import os
from typing import Iterable

import psycopg2
from psycopg2.extras import execute_values

from catalog import CourseRecord, normalize_stored_code


def resolve_database_url() -> str:
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Set SUPABASE_DB_URL or DATABASE_URL (same as apps/api/.env) to import courses"
        )
    return url


def upsert_courses(courses: Iterable[CourseRecord], dry_run: bool = False) -> dict[str, int]:
    course_list = list(courses)
    normalized: list[CourseRecord] = []
    for course in course_list:
        code = normalize_stored_code(course.code)
        prereqs = [normalize_stored_code(item) for item in course.prerequisite_codes]
        normalized.append(
            CourseRecord(
                code=code,
                title=course.title,
                credits=course.credits,
                department=(course.department or code.split(" ", 1)[0]).upper(),
                description=course.description,
                prerequisite_codes=prereqs,
                source=course.source,
            )
        )
    course_list = normalized
    if dry_run:
        return {
            "courses": len(course_list),
            "prerequisites": sum(len(c.prerequisite_codes) for c in course_list),
        }

    conn = psycopg2.connect(resolve_database_url())
    try:
        with conn.cursor() as cur:
            course_rows = [
                (
                    course.code,
                    course.title,
                    course.description,
                    course.credits,
                    course.department,
                )
                for course in course_list
            ]

            execute_values(
                cur,
                """
                INSERT INTO courses (code, title, description, credits, department, scraped_at)
                VALUES %s
                ON CONFLICT (code) DO UPDATE SET
                  title = EXCLUDED.title,
                  description = EXCLUDED.description,
                  credits = EXCLUDED.credits,
                  department = EXCLUDED.department,
                  scraped_at = NOW()
                """,
                course_rows,
                template="(%s, %s, %s, %s, %s, NOW())",
            )

            cur.execute("SELECT id, code FROM courses WHERE code = ANY(%s)", ([c.code for c in course_list],))
            id_by_code = {code: course_id for course_id, code in cur.fetchall()}

            prereq_rows: list[tuple[str, str]] = []
            for course in course_list:
                course_id = id_by_code.get(course.code)
                if not course_id:
                    continue
                for prereq_code in course.prerequisite_codes:
                    prereq_rows.append((course_id, prereq_code))

            if prereq_rows:
                course_ids = list({row[0] for row in prereq_rows})
                cur.execute(
                    "DELETE FROM course_prerequisites WHERE course_id = ANY(%s::uuid[])",
                    (course_ids,),
                )
                execute_values(
                    cur,
                    """
                    INSERT INTO course_prerequisites (course_id, prerequisite_code)
                    VALUES %s
                    ON CONFLICT DO NOTHING
                    """,
                    prereq_rows,
                )

        conn.commit()
        return {
            "courses": len(course_list),
            "prerequisites": sum(len(c.prerequisite_codes) for c in course_list),
        }
    finally:
        conn.close()
