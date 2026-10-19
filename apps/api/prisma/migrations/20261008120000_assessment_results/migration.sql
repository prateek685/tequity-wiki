-- Weekly assessment (after Days 5, 10 … 60): the result is stored on the attempt when its last item is
-- answered. Pass = floor(choice_correct / choice_total × 100) ≥ setting `assessment.passPercent`;
-- written answers don't count. A failed attempt opens a retake at `retake_at`.
-- RLS: quiz_attempts_owner (engineer read/write) and quiz_attempts_read (their managers and admins)
-- and the table-level grants are column-agnostic and stay as they are.

-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN "choice_correct" INTEGER,
ADD COLUMN "choice_total" INTEGER,
ADD COLUMN "passed" BOOLEAN,
ADD COLUMN "retake_at" TIMESTAMPTZ(6);

-- Assessments follow every 5th day up to Day 60.
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_assessment_day
  CHECK (kind <> 'assessment' OR (day % 5 = 0 AND day <= 60));

-- A result is all or nothing, only on a finished assessment; a retake time only after a fail.
ALTER TABLE quiz_attempts ADD CONSTRAINT quiz_attempts_result_valid CHECK (
  (choice_correct IS NULL AND choice_total IS NULL AND passed IS NULL AND retake_at IS NULL)
  OR (kind = 'assessment' AND completed_at IS NOT NULL
      AND choice_correct IS NOT NULL AND choice_total IS NOT NULL AND passed IS NOT NULL
      AND choice_total >= 0 AND choice_correct BETWEEN 0 AND choice_total
      AND (retake_at IS NULL OR NOT passed)));

-- Admin settings with their defaults (the API falls back to the same values when missing).
INSERT INTO settings (key, value) VALUES ('assessment.passPercent', '60'), ('assessment.retakeHours', '24')
  ON CONFLICT (key) DO NOTHING;
