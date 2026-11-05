BEGIN;
ALTER TABLE judytik.users ADD COLUMN merged_into_id uuid REFERENCES judytik.users(id) ON DELETE RESTRICT,
 ADD COLUMN merged_at timestamptz,
 ADD CONSTRAINT valid_merged_account CHECK((merged_into_id IS NULL)=(merged_at IS NULL) AND merged_into_id IS DISTINCT FROM id);
CREATE INDEX users_merged_into_id_idx ON judytik.users(merged_into_id);
DROP INDEX judytik.identities_user_id_provider_key;
CREATE INDEX identities_user_id_provider_idx ON judytik.identities(user_id,provider);
CREATE TABLE judytik.account_merge_archives(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL REFERENCES judytik.users(id) ON DELETE RESTRICT,
 source_user_id uuid NOT NULL REFERENCES judytik.users(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('source','primary','restore')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object' AND octet_length(data::text)<=33554432),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_merge_archives_owner_created ON judytik.account_merge_archives(owner_user_id,created_at DESC);
ALTER TABLE judytik.account_merge_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE judytik.account_merge_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY own_merge_archives ON judytik.account_merge_archives USING(owner_user_id=judytik.request_user_id()) WITH CHECK(owner_user_id=judytik.request_user_id());
COMMIT;
