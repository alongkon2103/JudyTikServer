BEGIN;
ALTER TABLE judytik.email_challenges ADD COLUMN request_ip_hash BYTEA;
ALTER TABLE judytik.email_challenges ADD CONSTRAINT email_ip_hash_length CHECK(request_ip_hash IS NULL OR octet_length(request_ip_hash)=32);
CREATE INDEX email_challenges_user_id_created_at_idx ON judytik.email_challenges(user_id,created_at);
CREATE INDEX email_challenges_request_ip_hash_created_at_idx ON judytik.email_challenges(request_ip_hash,created_at);
COMMIT;
