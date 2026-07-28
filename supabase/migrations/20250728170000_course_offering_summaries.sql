-- Pre-aggregated course offering stats (refreshed after section scrapes).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.course_offering_summaries AS
SELECT
  course_code,
  array_agg(DISTINCT term ORDER BY term DESC) AS terms_seen,
  count(DISTINCT (term || '|' || section_code))::integer AS section_count,
  max(scraped_at) AS last_scraped_at
FROM public.course_sections
GROUP BY course_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_course_offering_summaries_course_code
  ON public.course_offering_summaries (course_code);

CREATE OR REPLACE FUNCTION public.refresh_course_offering_summaries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.course_offering_summaries;
EXCEPTION
  WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
    REFRESH MATERIALIZED VIEW public.course_offering_summaries;
END;
$$;

-- course_sections.course_code is stored uppercased by the scraper; direct equality uses btree indexes.
CREATE INDEX IF NOT EXISTS idx_course_sections_course_code
  ON public.course_sections (course_code);
