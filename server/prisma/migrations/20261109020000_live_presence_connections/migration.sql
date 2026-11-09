-- A session keeps one public lease and an append-only set of used connection IDs.
-- Replacing the lease must never forget a stopped/superseded ID: delayed POSTs
-- for that ID must not replace the newer connection. Session deletion cleans up.
CREATE TABLE judytik.live_presence_connections (
 session_id uuid NOT NULL REFERENCES judytik.sessions(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL,
 PRIMARY KEY(session_id,connection_id)
);
INSERT INTO judytik.live_presence_connections(session_id,connection_id)
 SELECT session_id,connection_id FROM judytik.live_presences;
ALTER TABLE judytik.live_presence_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE judytik.live_presence_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY read_own_live_presence_connections ON judytik.live_presence_connections FOR SELECT USING(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id()));
CREATE POLICY insert_own_live_presence_connections ON judytik.live_presence_connections FOR INSERT WITH CHECK(EXISTS(SELECT 1 FROM judytik.sessions s WHERE s.id=session_id AND s.user_id=judytik.request_user_id()));
