-- Check-in prep: the engineer writes the three conversation notes (live spot-check, where they are
-- stuck, support they need) before the check-in. The manager reads them, and records only the
-- rating and the one-line note.
--   * checkin_preps  one per enrollment and check-in day; the engineer writes it until the manager
--                    records that check-in, then it is read-only.
-- The old spot_check, stuck and support columns of checkins move here, then go.

-- CreateTable
CREATE TABLE "checkin_preps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "after_day" INTEGER NOT NULL,
    "spot_check" TEXT NOT NULL DEFAULT '',
    "stuck" TEXT NOT NULL DEFAULT '',
    "support" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "checkin_preps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkin_preps_user_id_idx" ON "checkin_preps"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_preps_enrollment_id_after_day_key" ON "checkin_preps"("enrollment_id", "after_day");

-- AddForeignKey
ALTER TABLE "checkin_preps" ADD CONSTRAINT "checkin_preps_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_preps" ADD CONSTRAINT "checkin_preps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE checkin_preps ADD CONSTRAINT checkin_preps_values_valid CHECK (
  after_day IN (10, 30, 50, 60)
  AND length(spot_check) <= 2000
  AND length(stuck) <= 2000
  AND length(support) <= 2000);

-- Keep what managers already typed: it becomes the engineer's prep for that check-in.
INSERT INTO checkin_preps (enrollment_id, user_id, after_day, spot_check, stuck, support)
SELECT enrollment_id, user_id, after_day, spot_check, stuck, support
  FROM checkins
 WHERE spot_check <> '' OR stuck <> '' OR support <> '';

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------
ALTER TABLE checkin_preps ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkin_preps FORCE ROW LEVEL SECURITY;

-- The engineer reads their own; managers of the engineer's team and admins read.
CREATE POLICY checkin_preps_read ON checkin_preps FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));

-- The engineer adds and edits their own prep on their own enrollment, only while the manager has not
-- recorded that check-in.
CREATE POLICY checkin_preps_own_insert ON checkin_preps FOR INSERT TO app_rw
  WITH CHECK (
    user_id = app.uid()
    AND EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = checkin_preps.user_id)
    AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.enrollment_id = checkin_preps.enrollment_id AND c.after_day = checkin_preps.after_day));
CREATE POLICY checkin_preps_own_update ON checkin_preps FOR UPDATE TO app_rw
  USING (
    user_id = app.uid()
    AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.enrollment_id = checkin_preps.enrollment_id AND c.after_day = checkin_preps.after_day))
  WITH CHECK (user_id = app.uid());

-- Grants: the content can change, never whose or which one it is; nothing is deleted.
GRANT SELECT, INSERT ON checkin_preps TO app_rw;
GRANT UPDATE (spot_check, stuck, support, updated_at) ON checkin_preps TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- checkins no longer holds the conversation notes
-- ---------------------------------------------------------------------------------------------
ALTER TABLE checkins DROP CONSTRAINT checkins_values_valid;
ALTER TABLE checkins DROP COLUMN spot_check, DROP COLUMN stuck, DROP COLUMN support;
ALTER TABLE checkins ADD CONSTRAINT checkins_values_valid CHECK (
  after_day IN (10, 30, 50, 60)
  AND rag IN ('green', 'amber', 'red')
  AND length(note) BETWEEN 1 AND 300);
