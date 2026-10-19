-- Course player (docs/LESSON_FORMAT.md, 8 Oct 2026): a day is an ordered list of lessons with ids,
-- not four fixed steps. Entries are keyed by the lesson id. Existing rows keep their old step kind
-- ('prep', 'learn', 'mock', 'write') as the lesson id. RLS (step_entries_owner: owner only) and the
-- grants are column-agnostic and stay as they are.

ALTER TABLE step_entries DROP CONSTRAINT step_entries_kind_valid;

-- AlterTable
ALTER TABLE "step_entries" RENAME COLUMN "kind" TO "lesson_id";

-- RenameIndex
ALTER INDEX "step_entries_enrollment_id_day_kind_key" RENAME TO "step_entries_enrollment_id_day_lesson_id_key";

-- Same format as the lesson id in @portal/contracts (content.ts `lessonId`).
ALTER TABLE step_entries ADD CONSTRAINT step_entries_lesson_id_valid
  CHECK (lesson_id ~ '^[a-z][a-z0-9-]{1,40}$');

-- While true (content review), every imported day and lesson is open to engineers.
INSERT INTO settings (key, value) VALUES ('learning.unlockAll', 'true') ON CONFLICT (key) DO NOTHING;
