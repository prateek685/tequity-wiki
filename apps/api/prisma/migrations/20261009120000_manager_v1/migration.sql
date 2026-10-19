-- Manager v1 (docs/PORTAL_PLAN.md §1 "Privacy", §5 "D. Manager actions", §9 "Manager"; contracts in
-- packages/contracts/src/manager.ts). Three append-or-upsert tables written by a manager of the
-- engineer's team, read by the engineer and admins too:
--   * answer_reviews  (append-only) a manager's 1–5 score and note on an assessment written answer.
--   * manual_unlocks  (append-only) "Open Day N" / "Allow the retake now", with the reason.
--   * checkins        one per enrollment and check-in day (after Days 10, 30, 50, 60), updatable.
-- Plus manager read access to what the plan allows:
--   * ai_scores of assessment items (the full row: managers may read assessment answers and feedback).
--   * numbers only from private tables, through SECURITY DEFINER functions that check the caller is the
--     engineer or manages them: the Day-1 baseline ratings (step_entries) and write-lesson AI scores.
--   * names of the managers who wrote a review, check-in or unlock (the engineer can't read users rows).
-- And an admin-only count of pending / failed AI scores for the Settings screen.
-- Prep, journal, daily-quiz answers, write submissions, mock notes and non-assessment AI feedback stay
-- unreadable for managers and admins.

-- CreateTable
CREATE TABLE "answer_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "quiz_item_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "answer_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manual_unlocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "manager_id" UUID NOT NULL,
    "after_day" INTEGER NOT NULL,
    "held_on" DATE NOT NULL,
    "spot_check" TEXT NOT NULL DEFAULT '',
    "stuck" TEXT NOT NULL DEFAULT '',
    "support" TEXT NOT NULL DEFAULT '',
    "rag" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "answer_reviews_quiz_item_id_created_at_idx" ON "answer_reviews"("quiz_item_id", "created_at");

-- CreateIndex
CREATE INDEX "answer_reviews_user_id_idx" ON "answer_reviews"("user_id");

-- CreateIndex
CREATE INDEX "answer_reviews_manager_id_idx" ON "answer_reviews"("manager_id");

-- CreateIndex
CREATE INDEX "manual_unlocks_enrollment_id_idx" ON "manual_unlocks"("enrollment_id");

-- CreateIndex
CREATE INDEX "manual_unlocks_user_id_idx" ON "manual_unlocks"("user_id");

-- CreateIndex
CREATE INDEX "manual_unlocks_manager_id_idx" ON "manual_unlocks"("manager_id");

-- CreateIndex
CREATE INDEX "checkins_user_id_idx" ON "checkins"("user_id");

-- CreateIndex
CREATE INDEX "checkins_manager_id_idx" ON "checkins"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkins_enrollment_id_after_day_key" ON "checkins"("enrollment_id", "after_day");

-- AddForeignKey
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_quiz_item_id_fkey" FOREIGN KEY ("quiz_item_id") REFERENCES "quiz_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_unlocks" ADD CONSTRAINT "manual_unlocks_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_unlocks" ADD CONSTRAINT "manual_unlocks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manual_unlocks" ADD CONSTRAINT "manual_unlocks_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks.
ALTER TABLE answer_reviews ADD CONSTRAINT answer_reviews_values_valid CHECK (
  score BETWEEN 1 AND 5
  AND (note IS NULL OR length(note) BETWEEN 1 AND 500));
ALTER TABLE manual_unlocks ADD CONSTRAINT manual_unlocks_values_valid CHECK (
  kind IN ('next_day', 'retake_now')
  AND day BETWEEN 1 AND 65
  AND (kind <> 'retake_now' OR (day % 5 = 0 AND day <= 60))
  AND length(reason) BETWEEN 1 AND 500);
ALTER TABLE checkins ADD CONSTRAINT checkins_values_valid CHECK (
  after_day IN (10, 30, 50, 60)
  AND rag IN ('green', 'amber', 'red')
  AND length(note) BETWEEN 1 AND 300
  AND length(spot_check) <= 2000
  AND length(stuck) <= 2000
  AND length(support) <= 2000);

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
ALTER TABLE answer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE manual_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_unlocks FORCE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins FORCE ROW LEVEL SECURITY;

-- answer_reviews: the engineer reads their own; managers of the engineer's team and admins read.
-- A manager of the team adds a row as themselves, on a written assessment item of that engineer.
CREATE POLICY answer_reviews_read ON answer_reviews FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY answer_reviews_manager_insert ON answer_reviews FOR INSERT TO app_rw
  WITH CHECK (
    manager_id = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (
      SELECT 1 FROM quiz_items q
       WHERE q.id = quiz_item_id AND q.user_id = answer_reviews.user_id
         AND q.kind = 'assessment' AND q.question_data->>'type' = 'written'));

-- manual_unlocks: the same readers; a manager of the team adds a row as themselves, on the engineer's
-- own enrollment.
CREATE POLICY manual_unlocks_read ON manual_unlocks FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY manual_unlocks_manager_insert ON manual_unlocks FOR INSERT TO app_rw
  WITH CHECK (
    manager_id = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = manual_unlocks.user_id));

-- checkins: the same readers; a manager of the team records or updates one as themselves.
CREATE POLICY checkins_read ON checkins FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY checkins_manager_insert ON checkins FOR INSERT TO app_rw
  WITH CHECK (
    manager_id = app.uid()
    AND app.manages_user(user_id)
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = checkins.user_id));
CREATE POLICY checkins_manager_update ON checkins FOR UPDATE TO app_rw
  USING (app.manages_user(user_id))
  WITH CHECK (manager_id = app.uid() AND app.manages_user(user_id));

-- Grants: reviews and unlocks are append-only (no UPDATE/DELETE); a check-in's content can change,
-- never whose or which one it is; nothing is deleted.
GRANT SELECT, INSERT ON answer_reviews, manual_unlocks TO app_rw;
GRANT SELECT, INSERT ON checkins TO app_rw;
GRANT UPDATE (manager_id, held_on, spot_check, stuck, support, rag, note, updated_at) ON checkins TO app_rw;

-- ai_scores: managers of the engineer's team and admins read the AI score of assessment answers (the
-- full row, as they read the answer itself). Daily-quiz and write-lesson scores stay owner-only.
CREATE POLICY ai_scores_assessment_read ON ai_scores FOR SELECT TO app_rw
  USING (
    target = 'quiz_item'
    AND (app.is_admin() OR app.manages_user(user_id))
    AND EXISTS (SELECT 1 FROM quiz_items q WHERE q.id = quiz_item_id AND q.kind = 'assessment'));

-- ---------------------------------------------------------------------------------------------
-- Numbers-only functions. Each returns rows only to the engineer themselves or a manager of their
-- team (app.manages_user), and never any text the engineer wrote.
-- ---------------------------------------------------------------------------------------------

-- The Day-1 baseline ratings (behaviour id → 1–5) saved in the given Day-1 lesson's entry.
CREATE FUNCTION app.baseline_ratings(p_enrollment uuid, p_lesson text)
  RETURNS TABLE (behaviour text, rating int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT r.key, round((r.value #>> '{}')::numeric)::int
    FROM public.enrollments e
    JOIN public.step_entries s ON s.enrollment_id = e.id AND s.day = 1 AND s.lesson_id = p_lesson
    CROSS JOIN LATERAL jsonb_each(
      CASE WHEN jsonb_typeof(s.entry->'ratings') = 'object' THEN s.entry->'ratings' ELSE '{}'::jsonb END) r
   WHERE e.id = p_enrollment
     AND (e.user_id = app.uid() OR app.manages_user(e.user_id))
     AND jsonb_typeof(r.value) = 'number'
$$;

-- The latest scored write-lesson AI scores (score and when), newest first, at most p_limit (≤ 100).
CREATE FUNCTION app.write_scores(p_enrollment uuid, p_limit int)
  RETURNS TABLE (score int, scored_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.score, s.scored_at
    FROM public.ai_scores s
    JOIN public.enrollments e ON e.id = s.enrollment_id
   WHERE s.enrollment_id = p_enrollment
     AND s.target = 'lesson' AND s.status = 'scored'
     AND (e.user_id = app.uid() OR app.manages_user(e.user_id))
   ORDER BY s.scored_at DESC
   LIMIT least(greatest(coalesce(p_limit, 0), 0), 100)
$$;

-- Names of managers who wrote a review, check-in or unlock the caller may read (the engineer it is
-- about, a manager of that engineer, an admin). Name only.
CREATE FUNCTION app.author_names(p_ids uuid[])
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
                 AND (m.user_id = app.uid() OR app.is_admin() OR app.manages_user(m.user_id))))
$$;

-- Admins: how many AI scores are waiting and how many failed (counts only).
CREATE FUNCTION app.ai_score_counts()
  RETURNS TABLE (pending int, failed int)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT app.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  RETURN QUERY
    SELECT (count(*) FILTER (WHERE s.status = 'pending'))::int,
           (count(*) FILTER (WHERE s.status = 'failed'))::int
      FROM public.ai_scores s;
END
$$;

REVOKE EXECUTE ON FUNCTION
  app.baseline_ratings(uuid, text),
  app.write_scores(uuid, int),
  app.author_names(uuid[]),
  app.ai_score_counts()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app.baseline_ratings(uuid, text),
  app.write_scores(uuid, int),
  app.author_names(uuid[]),
  app.ai_score_counts()
TO app_rw;
