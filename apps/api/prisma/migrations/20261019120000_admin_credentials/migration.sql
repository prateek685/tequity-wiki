-- Admin email + password sign-in (admins only; everyone else signs in with Google).
--
-- The password hash lives in its own table that the app role cannot read or write: the only way in is
-- one SECURITY DEFINER lookup, which returns a row only for an admin who has a password. The
-- password is set from the command line (`pnpm admin:set-password`) as the database owner.

CREATE TABLE app.admin_credentials (
  user_id       uuid        PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  password_hash text        NOT NULL CHECK (password_hash <> ''),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.admin_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.admin_credentials FROM PUBLIC, app_rw;

-- The admin account and its password hash for an email, or no row if the email is not an admin with a
-- password. Disabled admins are returned so the caller can refuse them.
CREATE FUNCTION app.admin_login_lookup(p_email text)
  RETURNS TABLE (id uuid, role user_role, status user_status, password_hash text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT u.id, u.role, u.status, c.password_hash
    FROM public.users u
    JOIN app.admin_credentials c ON c.user_id = u.id
   WHERE u.email = lower(p_email) AND u.role = 'admin'
$$;

-- Demoting an admin removes their password, so it cannot come back if they are promoted again later.
CREATE FUNCTION app.drop_admin_credentials_on_demote() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  DELETE FROM app.admin_credentials c WHERE c.user_id = NEW.id;
  RETURN NEW;
END
$$;

CREATE TRIGGER users_drop_admin_credentials_on_demote
  AFTER UPDATE OF role ON public.users
  FOR EACH ROW WHEN (OLD.role = 'admin' AND NEW.role IS DISTINCT FROM 'admin')
  EXECUTE FUNCTION app.drop_admin_credentials_on_demote();

REVOKE EXECUTE ON FUNCTION
  app.admin_login_lookup(text),
  app.drop_admin_credentials_on_demote()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.admin_login_lookup(text) TO app_rw;
