CREATE TABLE judytik.tts_workspaces (
 user_id uuid PRIMARY KEY REFERENCES judytik.users(id) ON DELETE CASCADE,
 data jsonb NOT NULL CHECK (jsonb_typeof(data)='object' AND octet_length(data::text)<=1048576),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tts_revision_guard BEFORE UPDATE ON judytik.tts_workspaces FOR EACH ROW EXECUTE FUNCTION judytik.protect_revision();
ALTER TABLE judytik.tts_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE judytik.tts_workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY own_tts ON judytik.tts_workspaces USING (user_id=judytik.request_user_id()) WITH CHECK (user_id=judytik.request_user_id());
