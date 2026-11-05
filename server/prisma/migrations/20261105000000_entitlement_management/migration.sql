BEGIN;
CREATE TABLE judytik.entitlement_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES judytik.users(id) ON DELETE RESTRICT,
 idempotency_key varchar(128) NOT NULL UNIQUE,
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 operation text NOT NULL CHECK(operation IN ('adjust','set-expiry','revoke')),
 days integer CHECK(days BETWEEN -36500 AND 36500 AND days<>0),
 source varchar(80) NOT NULL CHECK(length(source)>0),
 reason varchar(300) NOT NULL CHECK(length(btrim(reason))>0),
 before_state jsonb NOT NULL CHECK(jsonb_typeof(before_state)='object'),
 after_state jsonb NOT NULL CHECK(jsonb_typeof(after_state)='object'),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((operation='adjust')=(days IS NOT NULL))
);
CREATE INDEX entitlement_operations_user_created_id_idx ON judytik.entitlement_operations(user_id,created_at DESC,id DESC);
COMMIT;
