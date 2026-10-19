-- New sign-ins start as engineers (user decision, 7 Oct 2026). Replaces "wait as pending until an admin
-- assigns a role": a first Google sign-in now creates an active engineer with an enrollment that starts
-- today (in the plan's timezone), so Day 1 opens at once. Bootstrap emails still become admins.
-- Admins can change the role, team and start date afterwards in Users and roles.

CREATE OR REPLACE FUNCTION app.upsert_login_user(p_email text, p_name text, p_sub text)
  RETURNS TABLE (id uuid, role user_role, status user_status)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_existing public.users%ROWTYPE;
  v_bootstrap boolean;
  v_user uuid;
  v_today date;
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
      CASE WHEN v_bootstrap THEN 'admin'::user_role ELSE 'engineer'::user_role END,
      'active'::user_status,
      now()
    )
    RETURNING users.id INTO v_user;

    IF NOT v_bootstrap THEN
      v_today := (now() AT TIME ZONE coalesce(
        (SELECT s.value #>> '{}' FROM public.settings s WHERE s.key = 'plan.timezone'), 'Asia/Kolkata'))::date;
      INSERT INTO public.enrollments (user_id, start_date) VALUES (v_user, v_today);
    END IF;
  END IF;

  RETURN QUERY SELECT u.id, u.role, u.status FROM public.users u WHERE u.email = v_email;
END
$$;
