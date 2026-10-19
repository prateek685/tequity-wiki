-- Let a signed-in admin set their own password from the app.
--
-- The app role still cannot touch app.admin_credentials directly: it calls this one function, which
-- only accepts a hash for an active admin (the API passes the id of the signed-in user).

CREATE FUNCTION app.set_admin_password(p_user uuid, p_password_hash text)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.role = 'admin' AND u.status = 'active') THEN
    RAISE EXCEPTION 'NOT_AN_ADMIN';
  END IF;
  INSERT INTO app.admin_credentials (user_id, password_hash) VALUES (p_user, p_password_hash)
  ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now();
END
$$;

REVOKE EXECUTE ON FUNCTION app.set_admin_password(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_admin_password(uuid, text) TO app_rw;
