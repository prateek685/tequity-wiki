-- Row-level security for M0 tables (docs/PORTAL_PLAN.md §5 "Privacy is enforced in the database").
--
-- Model:
--   * The app connects as `app_user` (created by scripts/db-setup-app-role.ts), a member of the
--     NOLOGIN group role `app_rw`. Neither has BYPASSRLS and neither owns the tables.
--   * Every request runs inside one transaction that sets `app.user_id` (set_config(..., true)).
--   * The caller's role is NEVER taken from the session: app.user_role() reads it from `users`,
--     so a bug that sets a wrong value cannot escalate privileges.
--   * Writes that must bypass row visibility (sign-in upsert, audit) go through narrow
--     SECURITY DEFINER functions.

-- ---------------------------------------------------------------------------------------------
-- Group role used by the application
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rw') THEN
    CREATE ROLE app_rw NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA public, app TO app_rw;

-- ---------------------------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.uid() RETURNS uuid
  LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Role of the current user, read from the users table (active users only).
CREATE OR REPLACE FUNCTION app.user_role() RETURNS user_role
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM users WHERE id = app.uid() AND status = 'active' $$;

CREATE OR REPLACE FUNCTION app.is_admin() RETURNS boolean
  LANGUAGE sql STABLE
AS $$ SELECT coalesce(app.user_role() = 'admin', false) $$;

-- True when the current user is an active manager of a team the target user belongs to.
CREATE OR REPLACE FUNCTION app.manages_user(target uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT app.user_role() = 'manager' AND EXISTS (
    SELECT 1 FROM team_managers tm JOIN team_members m ON m.team_id = tm.team_id
    WHERE tm.user_id = app.uid() AND m.user_id = target
  )
$$;

CREATE OR REPLACE FUNCTION app.manages_team(target_team uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT app.user_role() = 'manager' AND EXISTS (
    SELECT 1 FROM team_managers WHERE team_id = target_team AND user_id = app.uid()
  )
$$;

CREATE OR REPLACE FUNCTION app.is_member_of(target_team uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM team_members WHERE team_id = target_team AND user_id = app.uid()) $$;

-- ---------------------------------------------------------------------------------------------
-- Sign-in: create or refresh the user row. Called by the auth layer before any identity exists.
-- New users start as `pending` with no role; emails listed as initial admins start as active admins.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.upsert_login_user(p_email text, p_name text, p_sub text, p_initial_admin boolean)
  RETURNS TABLE (id uuid, role user_role, status user_status)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED';
  END IF;

  INSERT INTO users AS u (email, name, google_sub, role, status, last_login_at)
  VALUES (
    v_email,
    coalesce(nullif(trim(p_name), ''), v_email),
    p_sub,
    CASE WHEN p_initial_admin THEN 'admin'::user_role END,
    CASE WHEN p_initial_admin THEN 'active'::user_status ELSE 'pending'::user_status END,
    now()
  )
  ON CONFLICT (email) DO UPDATE
    SET last_login_at = now(),
        google_sub = coalesce(u.google_sub, excluded.google_sub),
        name = CASE WHEN u.name = u.email THEN excluded.name ELSE u.name END;

  RETURN QUERY SELECT u.id, u.role, u.status FROM users u WHERE u.email = v_email;
END
$$;

-- Session lookup used by the auth layer (id -> role/status). Returns nothing for unknown ids.
CREATE OR REPLACE FUNCTION app.session_user(p_id uuid)
  RETURNS TABLE (id uuid, email text, name text, role user_role, status user_status)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT u.id, u.email, u.name, u.role, u.status FROM users u WHERE u.id = p_id $$;

-- Append-only audit entry, always attributed to the current user.
CREATE OR REPLACE FUNCTION app.audit(p_action text, p_entity text, p_entity_id text, p_before jsonb, p_after jsonb)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  INSERT INTO audit_log (actor_id, action, entity, entity_id, before, after)
  VALUES (app.uid(), p_action, p_entity, p_entity_id, p_before, p_after)
$$;

-- ---------------------------------------------------------------------------------------------
-- Integrity rules
-- ---------------------------------------------------------------------------------------------

-- At least one active admin must always exist.
CREATE OR REPLACE FUNCTION app.guard_last_admin() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin' OR NEW.status <> 'active')
     AND NOT EXISTS (
       SELECT 1 FROM users WHERE role = 'admin' AND status = 'active' AND id <> OLD.id
     )
  THEN
    RAISE EXCEPTION 'LAST_ADMIN' USING HINT = 'At least one active admin must remain.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER users_guard_last_admin
  BEFORE UPDATE OF role, status OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION app.guard_last_admin();

-- An active user must have a role; a pending user must not.
ALTER TABLE users ADD CONSTRAINT users_role_matches_status
  CHECK ((status = 'pending' AND role IS NULL) OR (status <> 'pending' AND role IS NOT NULL));

-- Only engineers can be team members.
CREATE OR REPLACE FUNCTION app.guard_team_member_role() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT role FROM users WHERE id = NEW.user_id) IS DISTINCT FROM 'engineer' THEN
    RAISE EXCEPTION 'TEAM_MEMBER_MUST_BE_ENGINEER';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER team_members_engineer_only
  BEFORE INSERT OR UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION app.guard_team_member_role();

-- Only managers can manage teams.
CREATE OR REPLACE FUNCTION app.guard_team_manager_role() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT role FROM users WHERE id = NEW.user_id) IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'TEAM_MANAGER_MUST_BE_MANAGER';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER team_managers_manager_only
  BEFORE INSERT OR UPDATE ON team_managers
  FOR EACH ROW EXECUTE FUNCTION app.guard_team_manager_role();

-- Target date = start date + 90 days + total pause days (docs/PORTAL_PLAN.md §1 "Pacing").
CREATE OR REPLACE FUNCTION app.compute_target_date(p_enrollment uuid) RETURNS date
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.start_date + 90 + coalesce((
    SELECT sum(p.to_date - p.from_date + 1)::int FROM pauses p WHERE p.enrollment_id = e.id
  ), 0)
  FROM enrollments e WHERE e.id = p_enrollment
$$;

CREATE OR REPLACE FUNCTION app.set_target_date_on_enrollment() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.target_date := NEW.start_date + 90 + coalesce((
    SELECT sum(p.to_date - p.from_date + 1)::int FROM pauses p WHERE p.enrollment_id = NEW.id
  ), 0);
  RETURN NEW;
END
$$;
CREATE TRIGGER enrollments_target_date
  BEFORE INSERT OR UPDATE OF start_date ON enrollments
  FOR EACH ROW EXECUTE FUNCTION app.set_target_date_on_enrollment();

CREATE OR REPLACE FUNCTION app.refresh_target_date_from_pause() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enrollment uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.enrollment_id ELSE NEW.enrollment_id END;
BEGIN
  UPDATE enrollments SET target_date = app.compute_target_date(v_enrollment) WHERE id = v_enrollment;
  RETURN NULL;
END
$$;
CREATE TRIGGER pauses_refresh_target_date
  AFTER INSERT OR UPDATE OR DELETE ON pauses
  FOR EACH ROW EXECUTE FUNCTION app.refresh_target_date_from_pause();

ALTER TABLE pauses ADD CONSTRAINT pauses_valid_range CHECK (to_date >= from_date);

-- ---------------------------------------------------------------------------------------------
-- Privileges: least privilege per table; row-level security decides which rows.
-- ---------------------------------------------------------------------------------------------
GRANT SELECT, UPDATE ON users TO app_rw;                          -- no INSERT/DELETE: sign-in function only
GRANT SELECT, INSERT, UPDATE, DELETE ON teams, team_members, team_managers TO app_rw;
GRANT SELECT, INSERT, UPDATE ON enrollments TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON pauses TO app_rw;
GRANT SELECT, INSERT, UPDATE ON settings TO app_rw;
GRANT SELECT ON audit_log TO app_rw;                                -- writes only via app.audit()
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO app_rw;

-- Supabase exposes `anon` and `authenticated` roles to its Data API. We do not use that API;
-- make sure those roles can never read our tables even if the API is switched on by mistake.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security policies
-- ---------------------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;          ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;          ALTER TABLE teams FORCE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;   ALTER TABLE team_members FORCE ROW LEVEL SECURITY;
ALTER TABLE team_managers ENABLE ROW LEVEL SECURITY;  ALTER TABLE team_managers FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;    ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE pauses ENABLE ROW LEVEL SECURITY;         ALTER TABLE pauses FORCE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;       ALTER TABLE settings FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;      ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- users: yourself; managers see engineers on their teams; admins see everyone. Only admins update.
CREATE POLICY users_select ON users FOR SELECT TO app_rw
  USING (id = app.uid() OR app.is_admin() OR app.manages_user(id));
CREATE POLICY users_update ON users FOR UPDATE TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

-- teams and memberships: visible to admins, the team's managers and the team's members.
CREATE POLICY teams_select ON teams FOR SELECT TO app_rw
  USING (app.is_admin() OR app.manages_team(id) OR app.is_member_of(id));
CREATE POLICY teams_write ON teams FOR ALL TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY team_members_select ON team_members FOR SELECT TO app_rw
  USING (app.is_admin() OR user_id = app.uid() OR app.manages_team(team_id));
CREATE POLICY team_members_write ON team_members FOR ALL TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY team_managers_select ON team_managers FOR SELECT TO app_rw
  USING (app.is_admin() OR user_id = app.uid() OR app.is_member_of(team_id));
CREATE POLICY team_managers_write ON team_managers FOR ALL TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

-- enrollments: the engineer, their managers, admins. Only admins create or change them.
CREATE POLICY enrollments_select ON enrollments FOR SELECT TO app_rw
  USING (user_id = app.uid() OR app.is_admin() OR app.manages_user(user_id));
CREATE POLICY enrollments_insert ON enrollments FOR INSERT TO app_rw
  WITH CHECK (app.is_admin());
CREATE POLICY enrollments_update ON enrollments FOR UPDATE TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

-- pauses: the engineer manages their own; managers and admins can read.
CREATE POLICY pauses_select ON pauses FOR SELECT TO app_rw
  USING (EXISTS (
    SELECT 1 FROM enrollments e WHERE e.id = enrollment_id
      AND (e.user_id = app.uid() OR app.is_admin() OR app.manages_user(e.user_id))
  ));
CREATE POLICY pauses_owner_write ON pauses FOR ALL TO app_rw
  USING (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM enrollments e WHERE e.id = enrollment_id AND e.user_id = app.uid()));

-- settings: every signed-in active user can read; only admins write.
CREATE POLICY settings_select ON settings FOR SELECT TO app_rw
  USING (app.user_role() IS NOT NULL);
CREATE POLICY settings_insert ON settings FOR INSERT TO app_rw WITH CHECK (app.is_admin());
CREATE POLICY settings_update ON settings FOR UPDATE TO app_rw
  USING (app.is_admin()) WITH CHECK (app.is_admin());

-- audit_log: admins read; nobody updates or deletes (no grants).
CREATE POLICY audit_select ON audit_log FOR SELECT TO app_rw USING (app.is_admin());

-- ---------------------------------------------------------------------------------------------
-- Default settings (docs/PORTAL_PLAN.md §1 and §3)
-- ---------------------------------------------------------------------------------------------
INSERT INTO settings (key, value) VALUES
  ('assessment.passMarkPct', '60'),
  ('assessment.retakeWaitHours', '24'),
  ('plan.targetDays', '90'),
  ('pace.behindToleranceDays', '3'),
  ('redFlags.liveDeferralsPerPhase', '2'),
  ('ai.scoreRealProjectAnswers', 'false')
ON CONFLICT (key) DO NOTHING;
