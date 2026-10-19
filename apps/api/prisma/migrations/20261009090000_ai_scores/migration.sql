-- AI scores of written answers (docs/M2_SPEC.md "AI scoring", docs/PORTAL_PLAN.md §7 and §7.1).
-- One row per scored answer: a written daily-quiz or assessment item (target 'quiz_item'), or a write
-- lesson with a scoring guide (target 'lesson', one row per enrollment, day and lesson; saving a changed
-- answer bumps `revision` and sets it back to 'pending').
--
-- Who writes what:
--   * The API (as the engineer, under withUser) inserts or resets its own rows, only to 'pending' or
--     'not_scored' and with no result fields (policies + the result check below).
--   * The result is written only by the worker, through the SECURITY DEFINER functions at the end
--     (app.ai_score_record / app.ai_score_fail), and only on a 'pending' row of the same revision.
-- Who reads: the engineer reads their own rows. Managers and admins read nothing (the feedback text is
-- private); M4 adds a numbers-only function for managers.

-- CreateTable
CREATE TABLE "ai_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "day" INTEGER NOT NULL,
    "target" TEXT NOT NULL,
    "quiz_item_id" UUID,
    "lesson_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "score" INTEGER,
    "points" JSONB,
    "reason" TEXT,
    "better_sentence" TEXT,
    "possible_phi" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "prompt_version" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scored_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_scores_quiz_item_id_key" ON "ai_scores"("quiz_item_id");

-- CreateIndex
CREATE INDEX "ai_scores_user_id_idx" ON "ai_scores"("user_id");

-- CreateIndex
CREATE INDEX "ai_scores_enrollment_id_target_idx" ON "ai_scores"("enrollment_id", "target");

-- One score per write lesson of an enrollment; the sweep looks up old pending rows.
CREATE UNIQUE INDEX ai_scores_lesson_key ON ai_scores (enrollment_id, day, lesson_id) WHERE target = 'lesson';
CREATE INDEX ai_scores_pending_idx ON ai_scores (updated_at) WHERE status = 'pending';

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_quiz_item_id_fkey" FOREIGN KEY ("quiz_item_id") REFERENCES "quiz_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Checks: exactly one target; known status; the result fields are set exactly when the row is scored.
ALTER TABLE ai_scores ADD CONSTRAINT ai_scores_target_valid CHECK (
  (target = 'quiz_item' AND quiz_item_id IS NOT NULL AND lesson_id IS NULL)
  OR (target = 'lesson' AND lesson_id IS NOT NULL AND quiz_item_id IS NULL));
ALTER TABLE ai_scores ADD CONSTRAINT ai_scores_values_valid CHECK (
  day BETWEEN 1 AND 65
  AND revision >= 1
  AND attempts >= 0
  AND status IN ('pending', 'scored', 'failed', 'not_scored'));
ALTER TABLE ai_scores ADD CONSTRAINT ai_scores_result_valid CHECK (
  (status = 'scored'
    AND score BETWEEN 1 AND 5
    AND jsonb_typeof(points) = 'array'
    AND reason IS NOT NULL
    AND better_sentence IS NOT NULL
    AND model IS NOT NULL
    AND prompt_version IS NOT NULL
    AND scored_at IS NOT NULL)
  OR (status <> 'scored'
    AND score IS NULL
    AND points IS NULL
    AND reason IS NULL
    AND better_sentence IS NULL
    AND NOT possible_phi
    AND scored_at IS NULL));

-- Row-level security.
ALTER TABLE ai_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_scores FORCE ROW LEVEL SECURITY;

-- The engineer reads their own rows. No manager or admin policy (feedback text is private).
CREATE POLICY ai_scores_owner_select ON ai_scores FOR SELECT TO app_rw
  USING (user_id = app.uid());

-- The engineer creates or resets their own rows, on their own enrollment and quiz item, only as a
-- request to score ('pending') or 'not_scored', with no result, model or attempts.
CREATE POLICY ai_scores_owner_insert ON ai_scores FOR INSERT TO app_rw
  WITH CHECK (
    user_id = app.uid()
    AND status IN ('pending', 'not_scored')
    AND score IS NULL AND points IS NULL AND reason IS NULL AND better_sentence IS NULL
    AND NOT possible_phi AND model IS NULL AND prompt_version IS NULL AND attempts = 0 AND scored_at IS NULL
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid())
    AND (quiz_item_id IS NULL
      OR EXISTS (SELECT 1 FROM quiz_items q WHERE q.id = quiz_item_id AND q.user_id = app.uid())));
CREATE POLICY ai_scores_owner_update ON ai_scores FOR UPDATE TO app_rw
  USING (user_id = app.uid())
  WITH CHECK (
    user_id = app.uid()
    AND status IN ('pending', 'not_scored')
    AND score IS NULL AND points IS NULL AND reason IS NULL AND better_sentence IS NULL
    AND NOT possible_phi AND model IS NULL AND prompt_version IS NULL AND attempts = 0 AND scored_at IS NULL);

-- Grants: no DELETE; UPDATE only of the columns a reset touches (never the owner, enrollment or target).
GRANT SELECT, INSERT ON ai_scores TO app_rw;
GRANT UPDATE (status, revision, score, points, reason, better_sentence, possible_phi, model, prompt_version,
  attempts, updated_at, scored_at) ON ai_scores TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- quiz_items.score_status mirrors the item's AI score ('not_scored' shows as 'failed').
-- ---------------------------------------------------------------------------------------------
CREATE FUNCTION app.ai_scores_sync_quiz_item() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_status text := CASE NEW.status WHEN 'not_scored' THEN 'failed' ELSE NEW.status END;
BEGIN
  IF NEW.quiz_item_id IS NOT NULL THEN
    UPDATE public.quiz_items q SET score_status = v_status
     WHERE q.id = NEW.quiz_item_id AND q.score_status IS DISTINCT FROM v_status;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER ai_scores_sync_quiz_item
  AFTER INSERT OR UPDATE OF status ON ai_scores
  FOR EACH ROW EXECUTE FUNCTION app.ai_scores_sync_quiz_item();

-- ---------------------------------------------------------------------------------------------
-- Worker functions. They change only a 'pending' row of the revision the job was queued for, so a
-- job for an answer that has since changed (or been scored) does nothing. They return no answer text.
-- ---------------------------------------------------------------------------------------------

-- Store a validated, consistent score (the worker checks it against the scoring guide first).
CREATE FUNCTION app.ai_score_record(
  p_id uuid, p_revision int, p_score int, p_points jsonb, p_reason text, p_better_sentence text,
  p_possible_phi boolean, p_model text, p_prompt_version text, p_attempts int)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_score IS NULL OR p_score NOT BETWEEN 1 AND 5 OR jsonb_typeof(p_points) IS DISTINCT FROM 'array'
     OR coalesce(length(trim(p_reason)), 0) = 0 OR coalesce(length(trim(p_better_sentence)), 0) = 0
     OR coalesce(length(trim(p_model)), 0) = 0 OR coalesce(length(trim(p_prompt_version)), 0) = 0 THEN
    RAISE EXCEPTION 'AI_SCORE_INVALID';
  END IF;
  UPDATE public.ai_scores s
     SET status = 'scored', score = p_score, points = p_points, reason = p_reason,
         better_sentence = p_better_sentence, possible_phi = coalesce(p_possible_phi, false),
         model = p_model, prompt_version = p_prompt_version, attempts = greatest(p_attempts, 1),
         scored_at = now(), updated_at = now()
   WHERE s.id = p_id AND s.revision = p_revision AND s.status = 'pending';
  RETURN FOUND;
END
$$;

-- Give up on a pending row after the last attempt.
CREATE FUNCTION app.ai_score_fail(p_id uuid, p_revision int, p_attempts int)
  RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.ai_scores s
     SET status = 'failed', attempts = greatest(p_attempts, 0), updated_at = now()
   WHERE s.id = p_id AND s.revision = p_revision AND s.status = 'pending';
  RETURN FOUND;
END
$$;

-- Pending rows waiting longer than `p_older_than` (answers saved while Redis was down), oldest first.
CREATE FUNCTION app.ai_scores_stale_pending(p_older_than interval)
  RETURNS TABLE (id uuid, user_id uuid, revision int)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_older_than < interval '1 minute' THEN
    RAISE EXCEPTION 'AI_SCORE_SWEEP_TOO_SOON';
  END IF;
  RETURN QUERY
    SELECT s.id, s.user_id, s.revision
      FROM public.ai_scores s
     WHERE s.status = 'pending' AND s.updated_at < now() - p_older_than
     ORDER BY s.updated_at
     LIMIT 500;
END
$$;

REVOKE EXECUTE ON FUNCTION
  app.ai_scores_sync_quiz_item(),
  app.ai_score_record(uuid, int, int, jsonb, text, text, boolean, text, text, int),
  app.ai_score_fail(uuid, int, int),
  app.ai_scores_stale_pending(interval)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app.ai_score_record(uuid, int, int, jsonb, text, text, boolean, text, text, int),
  app.ai_score_fail(uuid, int, int),
  app.ai_scores_stale_pending(interval)
TO app_rw;
