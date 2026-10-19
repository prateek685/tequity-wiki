-- Phase 3 (M7): live-call days, the readiness case, the final review, Library kinds (docs/PORTAL_PLAN.md
-- §2 "Live-call days", §3 "Final review", §5; contracts in packages/contracts/src/final-review.ts).
--
-- New tables:
--   * live_calls       one per enrollment, live-call day and round: the path the engineer picked (had the
--                      call / shadowed another team / later / substitute) and whether "later" was ever
--                      chosen. Written by the engineer with the day's live lesson; read by the engineer, their
--                      managers and admins. The call sheet itself stays in step_entries (private).
--   * readiness_cases  one per enrollment: "My readiness case" (A11) as shared when Day 64's lesson is saved
--                      (field labels and values). Written by the engineer until the final review is recorded;
--                      read by the engineer, their managers and admins (it only exists once shared).
--   * final_reviews    one per enrollment (v1: "Another cycle" is recorded only): the observed call, criteria
--                      1–11 (jsonb, null = didn't come up), the maths, the outcome. Recorded and corrected by a
--                      manager of the engineer's team; read by the engineer, their managers and admins.
-- Nothing is deleted (no DELETE grants or policies).

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "live_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "role" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "deferred" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_calls_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "live_calls_enrollment_id_day_round_key" ON "live_calls"("enrollment_id", "day", "round");
CREATE INDEX "live_calls_user_id_idx" ON "live_calls"("user_id");
ALTER TABLE "live_calls" ADD CONSTRAINT "live_calls_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "live_calls" ADD CONSTRAINT "live_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE live_calls ADD CONSTRAINT live_calls_values_valid CHECK (
  day BETWEEN 41 AND 65 AND round >= 1
  AND role IN ('shadow', 'co_lead', 'lead', 'solo')
  AND path IN ('had_call', 'shadowed_other', 'later', 'substitute')
  AND (path <> 'later' OR deferred));

CREATE TABLE "readiness_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fields" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "readiness_cases_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "readiness_cases_enrollment_id_key" ON "readiness_cases"("enrollment_id");
CREATE INDEX "readiness_cases_user_id_idx" ON "readiness_cases"("user_id");
ALTER TABLE "readiness_cases" ADD CONSTRAINT "readiness_cases_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "readiness_cases" ADD CONSTRAINT "readiness_cases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE readiness_cases ADD CONSTRAINT readiness_cases_fields_valid CHECK (
  jsonb_typeof(fields) = 'array' AND jsonb_array_length(fields) BETWEEN 1 AND 20
  AND octet_length(fields::text) <= 100000);

CREATE TABLE "final_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "held_at" TIMESTAMPTZ(6) NOT NULL,
    "observer" TEXT NOT NULL,
    "call" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "scored" INTEGER NOT NULL,
    "average" DOUBLE PRECISION,
    "lowest" INTEGER,
    "outcome" TEXT NOT NULL,
    "rag" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "override_note" TEXT NOT NULL DEFAULT '',
    "manager_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "final_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "final_reviews_enrollment_id_key" ON "final_reviews"("enrollment_id");
CREATE INDEX "final_reviews_user_id_idx" ON "final_reviews"("user_id");
CREATE INDEX "final_reviews_manager_id_idx" ON "final_reviews"("manager_id");
ALTER TABLE "final_reviews" ADD CONSTRAINT "final_reviews_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "final_reviews" ADD CONSTRAINT "final_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "final_reviews" ADD CONSTRAINT "final_reviews_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE final_reviews ADD CONSTRAINT final_reviews_values_valid CHECK (
  observer IN ('manager', 'pm')
  AND length(call) BETWEEN 1 AND 200
  AND jsonb_typeof(criteria) = 'object'
  AND outcome IN ('client_ready', 'light_support', 'another_cycle')
  AND rag IN ('green', 'amber', 'red')
  AND length(note) BETWEEN 1 AND 300
  AND length(override_note) <= 500
  AND scored BETWEEN 0 AND 11
  AND ((scored = 0 AND average IS NULL AND lowest IS NULL)
    OR (scored > 0 AND average BETWEEN 1 AND 5 AND lowest BETWEEN 1 AND 5)));

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
ALTER TABLE live_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_calls FORCE ROW LEVEL SECURITY;
ALTER TABLE readiness_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE final_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_reviews FORCE ROW LEVEL SECURITY;

-- live_calls: the engineer writes their own, on their own enrollment.
CREATE POLICY live_calls_read ON live_calls FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY live_calls_owner_insert ON live_calls FOR INSERT TO app_rw
  WITH CHECK (
    user_id = app.uid()
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));
CREATE POLICY live_calls_owner_update ON live_calls FOR UPDATE TO app_rw
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());

-- readiness_cases: the engineer writes their own, on their own enrollment, while the final review isn't
-- recorded.
CREATE POLICY readiness_cases_read ON readiness_cases FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY readiness_cases_owner_insert ON readiness_cases FOR INSERT TO app_rw
  WITH CHECK (
    user_id = app.uid()
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid())
    AND NOT EXISTS (SELECT 1 FROM final_reviews r WHERE r.enrollment_id = readiness_cases.enrollment_id));
CREATE POLICY readiness_cases_owner_update ON readiness_cases FOR UPDATE TO app_rw
  USING (
    user_id = app.uid()
    AND NOT EXISTS (SELECT 1 FROM final_reviews r WHERE r.enrollment_id = readiness_cases.enrollment_id))
  WITH CHECK (user_id = app.uid());

-- final_reviews: a manager of the team records (and corrects) it as themselves, on the engineer's own
-- enrollment, once the readiness case is shared.
CREATE POLICY final_reviews_read ON final_reviews FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY final_reviews_manager_insert ON final_reviews FOR INSERT TO app_rw
  WITH CHECK (
    manager_id = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = final_reviews.user_id)
    AND EXISTS (SELECT 1 FROM readiness_cases c WHERE c.enrollment_id = final_reviews.enrollment_id));
CREATE POLICY final_reviews_manager_update ON final_reviews FOR UPDATE TO app_rw
  USING (app.manages_user(user_id))
  WITH CHECK (manager_id = app.uid() AND app.manages_user(user_id));

GRANT SELECT, INSERT ON live_calls, readiness_cases, final_reviews TO app_rw;
GRANT UPDATE (role, path, deferred, updated_at) ON live_calls TO app_rw;
GRANT UPDATE (fields, updated_at) ON readiness_cases TO app_rw;
GRANT UPDATE (held_at, observer, call, criteria, scored, average, lowest, outcome, rag, note, override_note,
  manager_id, updated_at) ON final_reviews TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- Library kinds (content/library/<id>.yaml)
-- ---------------------------------------------------------------------------------------------
ALTER TABLE content_library DROP CONSTRAINT content_library_kind_valid;
DELETE FROM content_library WHERE kind NOT IN ('framework', 'template', 'prompt', 'glossary', 'resource');
ALTER TABLE content_library ADD CONSTRAINT content_library_kind_valid
  CHECK (kind IN ('framework', 'template', 'prompt', 'glossary', 'resource'));

-- ---------------------------------------------------------------------------------------------
-- Author names also cover final reviews (the engineer sees who recorded theirs).
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.author_names(p_ids uuid[])
  RETURNS TABLE (id uuid, name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id, u.name
    FROM public.users u
   WHERE u.id = ANY(p_ids)
     AND app.user_role() IS NOT NULL
     AND (
       EXISTS (SELECT 1 FROM public.answer_reviews r WHERE r.manager_id = u.id
                 AND (r.user_id = app.uid() OR app.is_admin() OR app.manages_user(r.user_id)))
       OR EXISTS (SELECT 1 FROM public.checkins c WHERE c.manager_id = u.id
                 AND (c.user_id = app.uid() OR app.is_admin() OR app.manages_user(c.user_id)))
       OR EXISTS (SELECT 1 FROM public.manual_unlocks m WHERE m.manager_id = u.id
                 AND (m.user_id = app.uid() OR app.is_admin() OR app.manages_user(m.user_id)))
       OR EXISTS (SELECT 1 FROM public.gate_results g WHERE g.manager_id = u.id
                 AND (g.user_id = app.uid() OR app.is_admin() OR app.manages_user(g.user_id)))
       OR EXISTS (SELECT 1 FROM public.red_flags f WHERE f.acknowledged_by = u.id
                 AND (app.is_admin() OR app.manages_user(f.user_id)))
       OR EXISTS (SELECT 1 FROM public.final_reviews v WHERE v.manager_id = u.id
                 AND (v.user_id = app.uid() OR app.is_admin() OR app.manages_user(v.user_id))))
$$;
