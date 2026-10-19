-- Server-side sessions (architecture v2, replaces Auth.js JWT cookies).
--
-- The browser holds a random token in an httpOnly cookie; only its SHA-256 hash is stored here.
-- The app role cannot read or write this table at all: it goes through three SECURITY DEFINER
-- functions. Role and status are read from `users` on every lookup, so a role change applies on the
-- next request, and disabling a user deletes their sessions at once (trigger below).

CREATE TABLE app.sessions (
  token_hash   bytea       PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  user_id      uuid        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON app.sessions (user_id);

ALTER TABLE app.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.sessions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON app.sessions FROM PUBLIC, app_rw;

-- Create a session for a user who just signed in. Disabled users get none. Also removes that
-- user's expired sessions so the table doesn't grow without bound.
CREATE FUNCTION app.create_session(p_user uuid, p_token_hash bytea, p_lifetime interval)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_lifetime <= interval '0' OR p_lifetime > interval '30 days' THEN
    RAISE EXCEPTION 'SESSION_LIFETIME_INVALID';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user AND u.status <> 'disabled') THEN
    RAISE EXCEPTION 'SESSION_USER_INVALID';
  END IF;
  DELETE FROM app.sessions s WHERE s.user_id = p_user AND s.expires_at <= now();
  INSERT INTO app.sessions (token_hash, user_id, expires_at) VALUES (p_token_hash, p_user, now() + p_lifetime);
END
$$;

-- The user behind a session token, or no row if the token is unknown, expired, idle too long or
-- the user is disabled. Touches last_seen_at at most once a minute to keep writes low.
CREATE FUNCTION app.session_user_by_token(p_token_hash bytea, p_idle interval)
  RETURNS TABLE (id uuid, email text, name text, role user_role, status user_status)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE app.sessions s SET last_seen_at = now()
   WHERE s.token_hash = p_token_hash
     AND s.expires_at > now()
     AND s.last_seen_at > now() - p_idle
     AND s.last_seen_at < now() - interval '1 minute';

  RETURN QUERY
    SELECT u.id, u.email, u.name, u.role, u.status
      FROM app.sessions s
      JOIN public.users u ON u.id = s.user_id
     WHERE s.token_hash = p_token_hash
       AND s.expires_at > now()
       AND s.last_seen_at > now() - p_idle
       AND u.status <> 'disabled';
END
$$;

CREATE FUNCTION app.delete_session(p_token_hash bytea)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ DELETE FROM app.sessions s WHERE s.token_hash = p_token_hash $$;

-- Disabling a user signs them out everywhere, immediately.
CREATE FUNCTION app.end_sessions_on_disable() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  DELETE FROM app.sessions s WHERE s.user_id = NEW.id;
  RETURN NEW;
END
$$;

CREATE TRIGGER users_end_sessions_on_disable
  AFTER UPDATE OF status ON public.users
  FOR EACH ROW WHEN (NEW.status = 'disabled' AND OLD.status IS DISTINCT FROM 'disabled')
  EXECUTE FUNCTION app.end_sessions_on_disable();

REVOKE EXECUTE ON FUNCTION
  app.create_session(uuid, bytea, interval),
  app.session_user_by_token(bytea, interval),
  app.delete_session(bytea),
  app.end_sessions_on_disable()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  app.create_session(uuid, bytea, interval),
  app.session_user_by_token(bytea, interval),
  app.delete_session(bytea)
TO app_rw;
