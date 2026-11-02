BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "judytik";

-- CreateTable
CREATE TABLE "judytik"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "display_name" VARCHAR(80) NOT NULL,
    "presets_revision" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."user_emails" (
    "user_id" UUID NOT NULL,
    "email_key" VARCHAR(254) NOT NULL,
    "verified_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_emails_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "judytik"."devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "installation_id" UUID NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "platform" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "token_hash" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "replaced_by" UUID,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."desktop_auth_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "installation_id" UUID NOT NULL,
    "device_label" VARCHAR(80) NOT NULL,
    "platform" TEXT NOT NULL,
    "code_challenge" VARCHAR(43) NOT NULL,
    "client_state" VARCHAR(128) NOT NULL,
    "redirect_uri" VARCHAR(256) NOT NULL,
    "oauth_state_hash" BYTEA,
    "oauth_nonce_hash" BYTEA,
    "provider_secret_ciphertext" BYTEA,
    "provider_state_consumed_at" TIMESTAMPTZ,
    "user_id" UUID,
    "grant_code_hash" BYTEA,
    "grant_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "desktop_auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."email_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "email_key" VARCHAR(254) NOT NULL,
    "code_hmac" BYTEA NOT NULL,
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "invalidated_at" TIMESTAMPTZ,

    CONSTRAINT "email_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."entitlement_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "plan" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "ends_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entitlement_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."action_presets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "schema_version" SMALLINT NOT NULL DEFAULT 1,
    "actions" JSONB NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "action_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judytik"."account_settings" (
    "user_id" UUID NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "language" TEXT NOT NULL DEFAULT 'th',
    "revision" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "judytik"."audit_events" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "session_id" UUID,
    "event_name" VARCHAR(80) NOT NULL,
    "resource_id" UUID,
    "resource_revision" BIGINT,
    "request_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identities_provider_provider_subject_key" ON "judytik"."identities"("provider", "provider_subject");

-- CreateIndex
CREATE UNIQUE INDEX "identities_user_id_provider_key" ON "judytik"."identities"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "user_emails_email_key_key" ON "judytik"."user_emails"("email_key");

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_id_id_key" ON "judytik"."devices"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "devices_user_id_installation_id_key" ON "judytik"."devices"("user_id", "installation_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "judytik"."sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "judytik"."refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_session_id_idx" ON "judytik"."refresh_tokens"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_session_id_id_key" ON "judytik"."refresh_tokens"("session_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_session_id_replaced_by_key" ON "judytik"."refresh_tokens"("session_id", "replaced_by");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_auth_attempts_oauth_state_hash_key" ON "judytik"."desktop_auth_attempts"("oauth_state_hash");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_auth_attempts_grant_code_hash_key" ON "judytik"."desktop_auth_attempts"("grant_code_hash");

-- CreateIndex
CREATE INDEX "desktop_auth_attempts_expires_at_idx" ON "judytik"."desktop_auth_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "entitlement_grants_user_id_ends_at_idx" ON "judytik"."entitlement_grants"("user_id", "ends_at");

-- CreateIndex
CREATE INDEX "action_presets_user_id_id_idx" ON "judytik"."action_presets"("user_id", "id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "judytik"."audit_events"("actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "judytik"."identities" ADD CONSTRAINT "identities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."user_emails" ADD CONSTRAINT "user_emails_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."devices" ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."sessions" ADD CONSTRAINT "sessions_user_id_device_id_fkey" FOREIGN KEY ("user_id", "device_id") REFERENCES "judytik"."devices"("user_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "judytik"."sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_session_id_replaced_by_fkey" FOREIGN KEY ("session_id", "replaced_by") REFERENCES "judytik"."refresh_tokens"("session_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."desktop_auth_attempts" ADD CONSTRAINT "desktop_auth_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."email_challenges" ADD CONSTRAINT "email_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."entitlement_grants" ADD CONSTRAINT "entitlement_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."action_presets" ADD CONSTRAINT "action_presets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."account_settings" ADD CONSTRAINT "account_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "judytik"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "judytik"."audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "judytik"."users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;


-- Begin reviewed SQL extensions
-- Reviewed Prisma migration extension: constraints, functions, triggers and RLS.
-- Append AFTER the Prisma-generated base migration; never apply independently to an unknown live schema.
SET LOCAL search_path=judytik,pg_catalog;
CREATE FUNCTION request_user_id() RETURNS uuid LANGUAGE sql STABLE
 RETURN nullif(current_setting('judytik.user_id',true),'')::uuid;
ALTER TABLE users ADD CONSTRAINT valid_display_name CHECK(length(btrim(display_name)) BETWEEN 1 AND 80),
 ADD CONSTRAINT nonnegative_collection_revision CHECK(presets_revision>=0);
ALTER TABLE identities ADD CONSTRAINT allowed_identity_provider CHECK(provider IN ('google','discord')),
 ADD CONSTRAINT nonempty_provider_subject CHECK(length(provider_subject)>0);
ALTER TABLE user_emails ADD CONSTRAINT email_key_length CHECK(length(email_key) BETWEEN 3 AND 254);
ALTER TABLE devices ADD CONSTRAINT device_label_length CHECK(length(btrim(label)) BETWEEN 1 AND 80),
 ADD CONSTRAINT allowed_device_platform CHECK(platform IN ('windows','macos','linux'));
ALTER TABLE sessions ADD CONSTRAINT valid_session_expiry CHECK(expires_at>created_at);
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_hash_length CHECK(octet_length(token_hash)=32),
 ADD CONSTRAINT valid_refresh_expiry CHECK(expires_at>created_at),
 ADD CONSTRAINT valid_refresh_rotation CHECK(replaced_by IS NULL OR (replaced_by<>id AND used_at IS NOT NULL));
ALTER TABLE desktop_auth_attempts ADD CONSTRAINT allowed_auth_provider CHECK(provider IN ('google','discord')),
 ADD CONSTRAINT auth_device_label_length CHECK(length(btrim(device_label)) BETWEEN 1 AND 80),
 ADD CONSTRAINT allowed_auth_platform CHECK(platform IN ('windows','macos','linux')),
 ADD CONSTRAINT valid_pkce_challenge CHECK(code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
 ADD CONSTRAINT valid_client_state CHECK(client_state ~ '^[A-Za-z0-9_-]{43,128}$'),
 ADD CONSTRAINT loopback_redirect_shape CHECK(redirect_uri ~ '^http://127[.]0[.]0[.]1:[0-9]{4,5}/oauth/callback$'),
 ADD CONSTRAINT oauth_state_hash_length CHECK(octet_length(oauth_state_hash)=32),
 ADD CONSTRAINT oauth_nonce_hash_length CHECK(octet_length(oauth_nonce_hash)=32),
 ADD CONSTRAINT grant_hash_length CHECK(octet_length(grant_code_hash)=32),
 ADD CONSTRAINT valid_auth_expiry CHECK(expires_at>created_at),
 ADD CONSTRAINT complete_grant_tuple CHECK((grant_code_hash IS NULL AND grant_expires_at IS NULL) OR
  (grant_code_hash IS NOT NULL AND grant_expires_at IS NOT NULL AND user_id IS NOT NULL)),
 ADD CONSTRAINT consumed_grant_exists CHECK(consumed_at IS NULL OR grant_code_hash IS NOT NULL);
ALTER TABLE email_challenges ADD CONSTRAINT email_code_hmac_length CHECK(octet_length(code_hmac)=32),
 ADD CONSTRAINT bounded_email_guesses CHECK(attempts BETWEEN 0 AND 5),
 ADD CONSTRAINT valid_email_expiry CHECK(expires_at>created_at);
CREATE UNIQUE INDEX one_pending_email_per_user ON email_challenges(user_id) WHERE consumed_at IS NULL AND invalidated_at IS NULL;
ALTER TABLE entitlement_grants ADD CONSTRAINT pro_grant_only CHECK(plan='PRO'),
 ADD CONSTRAINT valid_entitlement_window CHECK(ends_at>starts_at);
ALTER TABLE action_presets ADD CONSTRAINT preset_name_length CHECK(length(btrim(name)) BETWEEN 1 AND 80),
 ADD CONSTRAINT preset_schema_v1 CHECK(schema_version=1),
 ADD CONSTRAINT bounded_preset_rules CHECK(jsonb_typeof(actions)='array' AND jsonb_array_length(actions)<=100),
 ADD CONSTRAINT positive_preset_revision CHECK(revision>0),
 ADD CONSTRAINT bounded_db_preset_size CHECK(octet_length(actions::text)<=1048576);
ALTER TABLE account_settings ADD CONSTRAINT allowed_theme CHECK(theme IN ('dark','light')),
 ADD CONSTRAINT allowed_language CHECK(language IN ('th','en','es')),
 ADD CONSTRAINT nonnegative_settings_revision CHECK(revision>=0);

CREATE FUNCTION protect_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='action_presets' THEN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
   RAISE EXCEPTION 'Immutable preset ID' USING ERRCODE='23514';
  END IF;
 END IF;
 IF NEW.user_id <> OLD.user_id OR NEW.created_at <> OLD.created_at OR NEW.revision <> OLD.revision+1 THEN
   RAISE EXCEPTION 'Immutable owner/creation or non-monotonic revision' USING ERRCODE='23514';
 END IF;
 NEW.updated_at := clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER preset_revision_guard BEFORE UPDATE ON action_presets FOR EACH ROW EXECUTE FUNCTION protect_revision();
CREATE TRIGGER settings_revision_guard BEFORE UPDATE ON account_settings FOR EACH ROW EXECUTE FUNCTION protect_revision();
CREATE FUNCTION bump_preset_collection() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=judytik,pg_temp AS $$
BEGIN
 UPDATE users SET presets_revision=presets_revision+1 WHERE id=COALESCE(NEW.user_id,OLD.user_id);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION bump_preset_collection() FROM PUBLIC;
CREATE TRIGGER preset_collection_change AFTER INSERT OR UPDATE OR DELETE ON action_presets
 FOR EACH ROW EXECUTE FUNCTION bump_preset_collection();

ALTER TABLE action_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_presets FORCE ROW LEVEL SECURITY;
CREATE POLICY own_presets ON action_presets USING (user_id=request_user_id()) WITH CHECK (user_id=request_user_id());
ALTER TABLE account_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY own_settings ON account_settings USING (user_id=request_user_id()) WITH CHECK (user_id=request_user_id());


-- Runtime role has no owner/BYPASSRLS, DDL, audit UPDATE/DELETE or direct collection-counter UPDATE grants.

COMMIT;
