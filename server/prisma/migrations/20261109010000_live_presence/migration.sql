CREATE TABLE judytik.live_presences (
 session_id uuid PRIMARY KEY REFERENCES judytik.sessions(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL,
 username varchar(24) NOT NULL CHECK(username ~ '^[a-z0-9_.]{2,24}$'),
 room_id varchar(30) NOT NULL CHECK(room_id ~ '^[0-9]{8,30}$' AND room_id !~ '^0+$'),
 display_name varchar(80) NOT NULL CHECK(length(btrim(display_name))>0),
 avatar_url varchar(2048),
 viewers integer CHECK(viewers BETWEEN 0 AND 1000000000),
 sequence bigint NOT NULL DEFAULT 0 CHECK(sequence BETWEEN 0 AND 9007199254740991),
 active boolean NOT NULL DEFAULT true,
 expires_at timestamptz NOT NULL,
 last_seen_at timestamptz NOT NULL
);
CREATE INDEX live_presences_active_expiry ON judytik.live_presences(expires_at) WHERE active;
ALTER TABLE judytik.live_presences ENABLE ROW LEVEL SECURITY;
ALTER TABLE judytik.live_presences FORCE ROW LEVEL SECURITY;
-- Cross-session reads are necessary for the sanitized directory service projection.
CREATE POLICY read_authenticated_live_presence ON judytik.live_presences FOR SELECT USING(judytik.request_user_id() IS NOT NULL);
CREATE POLICY insert_own_live_presence ON judytik.live_presences FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id()));
CREATE POLICY update_own_live_presence ON judytik.live_presences FOR UPDATE USING(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id())) WITH CHECK(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id()));
