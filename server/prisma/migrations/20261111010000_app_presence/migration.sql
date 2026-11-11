-- Private desktop presence. No TikTok identifiers or profile data are recorded.
CREATE TABLE judytik.app_presences (
 session_id uuid NOT NULL REFERENCES judytik.sessions(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL,
 active boolean NOT NULL DEFAULT true,
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 9007199254740991),
 expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL,
 PRIMARY KEY(session_id,connection_id)
);
CREATE INDEX app_presences_active_expiry ON judytik.app_presences(expires_at) WHERE active;
ALTER TABLE judytik.app_presences ENABLE ROW LEVEL SECURITY;
-- Owner bypass is intentionally limited to the fixed aggregate SECURITY DEFINER
-- function below. The runtime role must never own this table or inherit its owner.
CREATE POLICY own_app_presence ON judytik.app_presences USING(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id())) WITH CHECK(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id()));
CREATE FUNCTION judytik.app_online_count(at_time timestamptz) RETURNS bigint
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp
 AS $$ SELECT count(DISTINCT s.user_id) FROM judytik.app_presences p
 JOIN judytik.sessions s ON s.id=p.session_id JOIN judytik.users u ON u.id=s.user_id
 WHERE judytik.request_user_id() IS NOT NULL AND p.active AND p.expires_at>at_time
 AND s.revoked_at IS NULL AND s.expires_at>at_time AND u.disabled_at IS NULL AND u.merged_into_id IS NULL $$;
REVOKE ALL ON FUNCTION judytik.app_online_count(timestamptz) FROM PUBLIC;
