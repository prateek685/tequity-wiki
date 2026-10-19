-- Security hardening after the M0 review (docs/PORTAL_PLAN.md §5).
--
-- 1. search_path: SECURITY DEFINER functions resolved unqualified table names through the caller's
--    search_path, which puts pg_temp first. A user could create a TEMP table called `users` and make
--    app.user_role() return 'admin'. Every definer function now pins pg_temp LAST, and TEMP is revoked.
-- 2. Least privilege: the app role may call only the functions it needs; trigger and helper
--    functions are internal.
-- 3. Sign-in: initial admins come from a locked table (not a flag the app passes), a different Google
--    account for an existing email is refused, and disabled accounts are not touched.
-- 4. Session lookup returns only the caller's own row.
-- 5. Last-admin guard is serialised so two concurrent demotions cannot both succeed.
-- 6. Audit entries: only known action families, only from active users.
-- 7. Pauses: no overlaps, inside the enrollment, bounded length; plan length comes from settings.

-- ---------------------------------------------------------------------------------------------
-- 1. Remove TEMP for everyone except the owner, and pin search_path on all definer functions.
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM app_rw', current_database());
END
$$;

ALTER FUNCTION app.user_role() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.manages_user(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.manages_team(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.is_member_of(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.guard_team_member_role() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.guard_team_manager_role() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.set_target_date_on_enrollment() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.refresh_target_date_from_pause() SET search_path = pg_catalog, public, pg_temp;
-- Non-definer helpers get the same pin so their behaviour never depends on the caller.
ALTER FUNCTION app.uid() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION app.is_admin() SET search_path = pg_catalog, public, pg_temp;

-- ---------------------------------------------------------------------------------------------
-- 2. Settings-driven plan length and pause limit.
-- ---------------------------------------------------------------------------------------------
INSERT INTO settings (key, value) VALUES ('pause.maxDays', '30') ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app.setting_int(p_key text, p_default int) RETURNS int
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT coalesce((SELECT (value #>> '{}')::int FROM public.settings WHERE key = p_key), p_default) $$;

CREATE OR REPLACE FUNCTION app.compute_target_date(p_enrollment uuid) RETURNS date
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT e.start_date + app.setting_int('plan.targetDays', 90) + coalesce((
    SELECT sum(p.to_date - p.from_date + 1)::int FROM public.pauses p WHERE p.enrollment_id = e.id
  ), 0)
  FROM public.enrollments e WHERE e.id = p_enrollment
$$;

CREATE OR REPLACE FUNCTION app.set_target_date_on_enrollment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  NEW.target_date := NEW.start_date + app.setting_int('plan.targetDays', 90) + coalesce((
    SELECT sum(p.to_date - p.from_date + 1)::int FROM public.pauses p WHERE p.enrollment_id = NEW.id
  ), 0);
  RETURN NEW;
END
$$;

-- Pause validity: inside an active enrollment, not before its start, bounded length, no overlaps.
-- Portable: Supabase keeps extensions in its own `extensions` schema; plain PostgreSQL uses the default.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS btree_gist;
  END IF;
END $$;

ALTER TABLE pauses ADD CONSTRAINT pauses_no_overlap
  EXCLUDE USING gist (enrollment_id WITH =, daterange(from_date, to_date, '[]') WITH &&);

CREATE OR REPLACE FUNCTION app.validate_pause() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_start date;
  v_status enrollment_status;
BEGIN
  SELECT start_date, status INTO v_start, v_status FROM public.enrollments WHERE id = NEW.enrollment_id;
  IF v_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'PAUSE_ENROLLMENT_NOT_ACTIVE';
  END IF;
  IF NEW.from_date < v_start THEN
    RAISE EXCEPTION 'PAUSE_BEFORE_START';
  END IF;
  IF NEW.to_date - NEW.from_date + 1 > app.setting_int('pause.maxDays', 30) THEN
    RAISE EXCEPTION 'PAUSE_TOO_LONG';
  END IF;
  IF length(trim(NEW.reason)) = 0 THEN
    RAISE EXCEPTION 'PAUSE_REASON_REQUIRED';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER pauses_validate
  BEFORE INSERT OR UPDATE ON pauses
  FOR EACH ROW EXECUTE FUNCTION app.validate_pause();

-- ---------------------------------------------------------------------------------------------
-- 3. Sign-in. Initial admins live in a table the app role cannot read or write; it is filled from
--    INITIAL_ADMIN_EMAILS by scripts/db-setup-app-role.ts (run as the owner).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE app.bootstrap_admin_emails (
  email text PRIMARY KEY CHECK (email = lower(email))
);
REVOKE ALL ON app.bootstrap_admin_emails FROM PUBLIC;

DROP FUNCTION app.upsert_login_user(text, text, text, boolean);

CREATE FUNCTION app.upsert_login_user(p_email text, p_name text, p_sub text)
  RETURNS TABLE (id uuid, role user_role, status user_status)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_existing public.users%ROWTYPE;
  v_bootstrap boolean;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED';
  END IF;

  SELECT * INTO v_existing FROM public.users u WHERE u.email = v_email FOR UPDATE;

  IF FOUND THEN
    -- Same address, different Google account (e.g. the address was reassigned): refuse.
    IF v_existing.google_sub IS NOT NULL AND p_sub IS NOT NULL AND v_existing.google_sub <> p_sub THEN
      RAISE EXCEPTION 'ACCOUNT_MISMATCH';
    END IF;
    IF v_existing.status <> 'disabled' THEN
      UPDATE public.users u
        SET last_login_at = now(),
            google_sub = coalesce(u.google_sub, p_sub),
            name = CASE WHEN u.name = u.email AND nullif(trim(p_name), '') IS NOT NULL THEN trim(p_name) ELSE u.name END
        WHERE u.id = v_existing.id;
    END IF;
  ELSE
    v_bootstrap := EXISTS (SELECT 1 FROM app.bootstrap_admin_emails b WHERE b.email = v_email);
    INSERT INTO public.users (email, name, google_sub, role, status, last_login_at)
    VALUES (
      v_email,
      coalesce(nullif(trim(p_name), ''), v_email),
      p_sub,
      CASE WHEN v_bootstrap THEN 'admin'::user_role END,
      CASE WHEN v_bootstrap THEN 'active'::user_status ELSE 'pending'::user_status END,
      now()
    );
  END IF;

  RETURN QUERY SELECT u.id, u.role, u.status FROM public.users u WHERE u.email = v_email;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Session lookup: only your own row (the caller sets app.user_id first).
--    Renamed: "session_user" is a reserved SQL keyword.
-- ---------------------------------------------------------------------------------------------
DROP FUNCTION app."session_user"(uuid);

CREATE FUNCTION app.current_session_user()
  RETURNS TABLE (id uuid, email text, name text, role user_role, status user_status)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT u.id, u.email, u.name, u.role, u.status FROM public.users u WHERE u.id = app.uid() $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Last-admin guard, serialised with a transaction-level advisory lock. PL/pgSQL takes a fresh
--    snapshot per statement, so the check after the lock sees the other transaction's commit.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_last_admin() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin' OR NEW.status <> 'active')
  THEN
    PERFORM pg_advisory_xact_lock(hashtext('app.guard_last_admin'));
    IF NOT EXISTS (
      SELECT 1 FROM public.users WHERE role = 'admin' AND status = 'active' AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'LAST_ADMIN' USING HINT = 'At least one active admin must remain.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 6. Audit: known action families only, active users only, always attributed to the caller.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.audit(p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF app.user_role() IS NULL THEN
    RAISE EXCEPTION 'AUDIT_REQUIRES_ACTIVE_USER';
  END IF;
  IF p_action !~ '^(user|team|enrollment|pause|setting|content|question|card|gate|checkin|override|unlock|prompt)\.[a-z_]{2,40}$' THEN
    RAISE EXCEPTION 'AUDIT_UNKNOWN_ACTION';
  END IF;
  INSERT INTO public.audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (app.uid(), p_action, p_entity, p_entity_id, p_before, p_after);
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Function privileges: callable by the app only where needed.
-- ---------------------------------------------------------------------------------------------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC, app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM app_rw;

GRANT EXECUTE ON FUNCTION
  app.uid(),
  app.user_role(),
  app.is_admin(),
  app.manages_user(uuid),
  app.manages_team(uuid),
  app.is_member_of(uuid),
  app.upsert_login_user(text, text, text),
  app.current_session_user(),
  app.audit(text, text, text, jsonb, jsonb)
TO app_rw;
