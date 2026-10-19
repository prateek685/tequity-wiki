-- Red flags and manager emails (docs/PORTAL_PLAN.md §3 "Red flags" and "Emails", §5 "red_flags",
-- "email_log"; contracts in packages/contracts/src/red-flags.ts).
--
-- red_flags  One row per raised signal (PDF §5.4). The worker computes the signals every hour from pure
--            rules (apps/api/src/rules/red-flags.ts) and syncs them through app.red_flags_sync():
--            a signal with no uncleared row of the same enrollment, kind and key is raised (new row); an
--            uncleared row whose signal is gone gets cleared_at. So there is at most one uncleared row per
--            enrollment + kind + key, and a flag is raised again only after it cleared. A flag stays open
--            for the manager until acknowledged (acknowledged_at / acknowledged_by), cleared or not.
--            Management view (PDF §5): managers of the engineer's team and admins read; a manager of the
--            team acknowledges (those two columns only). Engineers can NOT read their own flags.
-- email_log  One row per manager email item (template checkin_due or red_flag), with a unique dedupe key
--            per item and recipient, so nothing is sent twice. Saved `pending` with the flags (same
--            statement) or by app.checkin_due_email(); the worker's email job sends all pending items of
--            one manager as one email and marks them sent / failed. Admins read; nobody else.
--
-- The worker reads each engineer's own data as that engineer (withUser, row-level security as usual) and
-- writes only through the SECURITY DEFINER functions below. They work only without a user identity
-- (app.user_id unset: the worker's system connection), so no request can call them.

-- ---------------------------------------------------------------------------------------------
-- red_flags
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "red_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enrollment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "detail" TEXT NOT NULL,
    "raised_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cleared_at" TIMESTAMPTZ(6),
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by" UUID,

    CONSTRAINT "red_flags_pkey" PRIMARY KEY ("id")
);

-- At most one uncleared flag per enrollment, kind and key (pillar, gate + round …).
CREATE UNIQUE INDEX red_flags_open_key ON red_flags (enrollment_id, kind, key) WHERE cleared_at IS NULL;
CREATE INDEX "red_flags_user_id_idx" ON "red_flags"("user_id");

ALTER TABLE "red_flags" ADD CONSTRAINT "red_flags_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "red_flags" ADD CONSTRAINT "red_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "red_flags" ADD CONSTRAINT "red_flags_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE red_flags ADD CONSTRAINT red_flags_values_valid CHECK (
  kind IN ('scorecard_missing', 'pillar_low', 'self_vs_gate', 'few_practice_days', 'avoiding_live', 'gate_not_passed')
  AND length(key) <= 100
  AND length(detail) BETWEEN 1 AND 300
  AND (acknowledged_at IS NULL) = (acknowledged_by IS NULL)
  AND (cleared_at IS NULL OR cleared_at >= raised_at));

ALTER TABLE red_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE red_flags FORCE ROW LEVEL SECURITY;

-- Managers of the engineer's team and admins read. No owner rule: engineers never see their flags.
CREATE POLICY red_flags_read ON red_flags FOR SELECT TO app_rw
  USING (app.is_admin() OR app.manages_user(user_id));
-- A manager of the team acknowledges an open flag, as themselves (the column grant below limits what
-- can change to acknowledged_at / acknowledged_by).
CREATE POLICY red_flags_manager_acknowledge ON red_flags FOR UPDATE TO app_rw
  USING (acknowledged_at IS NULL AND app.manages_user(user_id))
  WITH CHECK (acknowledged_by = app.uid() AND acknowledged_at IS NOT NULL AND app.manages_user(user_id));

GRANT SELECT ON red_flags TO app_rw;
GRANT UPDATE (acknowledged_at, acknowledged_by) ON red_flags TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- email_log
-- ---------------------------------------------------------------------------------------------
CREATE TABLE "email_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_log_dedupe_key_key" ON "email_log"("dedupe_key");
CREATE INDEX "email_log_recipient_id_status_idx" ON "email_log"("recipient_id", "status");

ALTER TABLE "email_log" ADD CONSTRAINT "email_log_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE email_log ADD CONSTRAINT email_log_values_valid CHECK (
  template IN ('checkin_due', 'red_flag')
  AND status IN ('pending', 'sent', 'failed')
  AND (status = 'sent') = (sent_at IS NOT NULL)
  AND length(dedupe_key) BETWEEN 1 AND 300
  AND jsonb_typeof(payload) = 'object');

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_log FORCE ROW LEVEL SECURITY;

CREATE POLICY email_log_admin_read ON email_log FOR SELECT TO app_rw USING (app.is_admin());
GRANT SELECT ON email_log TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- Worker functions (system only: they refuse to run with app.user_id set)
-- ---------------------------------------------------------------------------------------------

-- Engineers the hourly run checks: active engineers with an active enrollment (their latest), Day 65 not
-- done. Ids only.
CREATE FUNCTION app.red_flag_candidates()
  RETURNS TABLE (user_id uuid, enrollment_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  RETURN QUERY
    SELECT e.user_id, e.id
      FROM public.enrollments e
      JOIN public.users u ON u.id = e.user_id
     WHERE u.status = 'active' AND u.role = 'engineer' AND e.status = 'active'
       AND e.cycle_no = (SELECT max(e2.cycle_no) FROM public.enrollments e2
                          WHERE e2.user_id = e.user_id AND e2.status = 'active')
       AND NOT EXISTS (SELECT 1 FROM public.day_progress p
                        WHERE p.enrollment_id = e.id AND p.day = 65 AND p.completed_at IS NOT NULL)
     ORDER BY e.user_id;
END
$$;

-- Active managers of the engineer's team (the email recipients).
CREATE FUNCTION app.managers_of(p_user uuid)
  RETURNS TABLE (manager_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT tm.user_id
    FROM public.team_members m
    JOIN public.team_managers tm ON tm.team_id = m.team_id
    JOIN public.users mu ON mu.id = tm.user_id
   WHERE m.user_id = p_user AND mu.status = 'active' AND mu.role = 'manager'
     AND app.uid() IS NULL
$$;

-- Sync one enrollment's signals: p_signals = [{kind, key, detail}] (what the rules see now), p_hold =
-- [{kind, key}] (signals the rules couldn't judge this time, e.g. a period overlapping a pause: left as
-- they are). Clears uncleared flags no longer signalled, raises new ones, and saves a pending `red_flag`
-- email item for each manager of the team per new flag. Returns how many flags were raised.
CREATE FUNCTION app.red_flags_sync(p_enrollment uuid, p_signals jsonb, p_hold jsonb)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_name text;
  v_flag record;
  v_raised int := 0;
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  IF jsonb_typeof(p_signals) IS DISTINCT FROM 'array' OR jsonb_typeof(p_hold) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'RED_FLAGS_INVALID';
  END IF;
  SELECT e.user_id, u.name INTO v_user, v_name
    FROM public.enrollments e JOIN public.users u ON u.id = e.user_id
   WHERE e.id = p_enrollment;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'RED_FLAGS_NO_ENROLLMENT';
  END IF;

  UPDATE public.red_flags f
     SET cleared_at = now()
   WHERE f.enrollment_id = p_enrollment
     AND f.cleared_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_signals) s
                      WHERE s->>'kind' = f.kind AND coalesce(s->>'key', '') = f.key)
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_hold) h
                      WHERE h->>'kind' = f.kind AND coalesce(h->>'key', '') = f.key);

  FOR v_flag IN
    INSERT INTO public.red_flags (enrollment_id, user_id, kind, key, detail)
    SELECT p_enrollment, v_user, s->>'kind', coalesce(s->>'key', ''), s->>'detail'
      FROM jsonb_array_elements(p_signals) s
    ON CONFLICT (enrollment_id, kind, key) WHERE cleared_at IS NULL DO NOTHING
    RETURNING id, kind, detail
  LOOP
    v_raised := v_raised + 1;
    INSERT INTO public.email_log (recipient_id, template, dedupe_key, payload)
    SELECT m.manager_id, 'red_flag', 'red_flag:' || v_flag.id || ':' || m.manager_id,
           jsonb_build_object('engineerId', v_user, 'engineerName', v_name, 'flagId', v_flag.id,
                              'kind', v_flag.kind, 'detail', v_flag.detail)
      FROM app.managers_of(v_user) m
    ON CONFLICT (dedupe_key) DO NOTHING;
  END LOOP;
  RETURN v_raised;
END
$$;

-- A check-in coming due (the engineer finished Day 10/30/50/60, no check-in recorded yet): one pending
-- `checkin_due` item per manager, once per enrollment and day. Returns how many items were saved.
CREATE FUNCTION app.checkin_due_email(p_enrollment uuid, p_day int)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_user uuid;
  v_name text;
  v_count int;
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  IF p_day IS NULL OR p_day NOT IN (10, 30, 50, 60) THEN
    RAISE EXCEPTION 'CHECKIN_DAY_INVALID';
  END IF;
  SELECT e.user_id, u.name INTO v_user, v_name
    FROM public.enrollments e JOIN public.users u ON u.id = e.user_id
   WHERE e.id = p_enrollment
     AND EXISTS (SELECT 1 FROM public.day_progress p
                  WHERE p.enrollment_id = e.id AND p.day = p_day AND p.completed_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM public.checkins c WHERE c.enrollment_id = e.id AND c.after_day = p_day);
  IF v_user IS NULL THEN
    RETURN 0;
  END IF;
  INSERT INTO public.email_log (recipient_id, template, dedupe_key, payload)
  SELECT m.manager_id, 'checkin_due', 'checkin_due:' || p_enrollment || ':' || p_day || ':' || m.manager_id,
         jsonb_build_object('engineerId', v_user, 'engineerName', v_name, 'day', p_day)
    FROM app.managers_of(v_user) m
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- Managers with pending email items.
CREATE FUNCTION app.email_pending_recipients()
  RETURNS TABLE (recipient_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  RETURN QUERY SELECT DISTINCT l.recipient_id FROM public.email_log l WHERE l.status = 'pending';
END
$$;

-- One manager's pending items (oldest first, at most 200), with where to send them. `active`: the
-- recipient is still an active manager.
CREATE FUNCTION app.email_pending(p_recipient uuid)
  RETURNS TABLE (id uuid, template text, payload jsonb, email text, name text, active boolean)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  RETURN QUERY
    SELECT l.id, l.template, l.payload, u.email, u.name, (u.status = 'active' AND u.role = 'manager')
      FROM public.email_log l JOIN public.users u ON u.id = l.recipient_id
     WHERE l.recipient_id = p_recipient AND l.status = 'pending'
     ORDER BY l.created_at, l.id
     LIMIT 200;
END
$$;

-- Mark pending items sent or failed. Returns how many changed.
CREATE FUNCTION app.email_mark(p_ids uuid[], p_status text)
  RETURNS int
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_count int;
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'SYSTEM_ONLY';
  END IF;
  IF p_status NOT IN ('sent', 'failed') THEN
    RAISE EXCEPTION 'EMAIL_STATUS_INVALID';
  END IF;
  UPDATE public.email_log l
     SET status = p_status, sent_at = CASE WHEN p_status = 'sent' THEN now() END
   WHERE l.id = ANY(p_ids) AND l.status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Existing functions
-- ---------------------------------------------------------------------------------------------

-- Audit: red_flag.* actions (the manager's acknowledgement).
CREATE OR REPLACE FUNCTION app.audit(p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.user_role() IS NULL THEN
    RAISE EXCEPTION 'AUDIT_REQUIRES_ACTIVE_USER';
  END IF;
  IF p_action !~ '^(user|team|enrollment|pause|setting|content|question|card|gate|checkin|override|unlock|prompt|assessment|red_flag)\.[a-z_]{2,40}$' THEN
    RAISE EXCEPTION 'AUDIT_UNKNOWN_ACTION';
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (app.uid(), p_action, p_entity, p_entity_id, p_before, p_after);
END
$$;

-- Author names now also cover who acknowledged a red flag (for its managers and admins).
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
                 AND (app.is_admin() OR app.manages_user(f.user_id))))
$$;

REVOKE EXECUTE ON FUNCTION
  app.red_flag_candidates(),
  app.managers_of(uuid),
  app.red_flags_sync(uuid, jsonb, jsonb),
  app.checkin_due_email(uuid, int),
  app.email_pending_recipients(),
  app.email_pending(uuid),
  app.email_mark(uuid[], text)
FROM PUBLIC;

-- app.managers_of is used only inside the functions above (not granted).
GRANT EXECUTE ON FUNCTION
  app.red_flag_candidates(),
  app.red_flags_sync(uuid, jsonb, jsonb),
  app.checkin_due_email(uuid, int),
  app.email_pending_recipients(),
  app.email_pending(uuid),
  app.email_mark(uuid[], text)
TO app_rw;
