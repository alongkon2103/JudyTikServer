-- Run using the migration role after separately creating a LOGIN role with a private password.
-- psql -v runtime_role=judytik_runtime -f prisma/runtime-grants.sql
-- Scope: this application's schema only; no ownership/BYPASSRLS or audit mutations.
GRANT USAGE ON SCHEMA judytik TO :"runtime_role";
GRANT SELECT ON judytik.users,judytik.identities,judytik.user_emails,judytik.devices,judytik.sessions,judytik.refresh_tokens,judytik.desktop_auth_attempts,judytik.email_challenges,judytik.entitlement_grants,judytik.action_presets,judytik.account_settings,judytik.audit_events,judytik.gifts,judytik.gift_regions,judytik.gift_catalog_state TO :"runtime_role";
GRANT INSERT ON judytik.users TO :"runtime_role";
GRANT UPDATE(display_name,avatar_url) ON judytik.users TO :"runtime_role";
GRANT INSERT,UPDATE ON judytik.identities,judytik.user_emails,judytik.devices,judytik.sessions,judytik.refresh_tokens,judytik.desktop_auth_attempts,judytik.email_challenges,judytik.action_presets,judytik.account_settings,judytik.gifts,judytik.gift_regions,judytik.gift_catalog_state TO :"runtime_role";
GRANT INSERT ON judytik.audit_events TO :"runtime_role";
GRANT USAGE ON SEQUENCE judytik.audit_events_id_seq TO :"runtime_role";
GRANT EXECUTE ON FUNCTION judytik.request_user_id() TO :"runtime_role";

GRANT SELECT,INSERT,UPDATE ON judytik.win_workspaces TO :"runtime_role";

GRANT SELECT,INSERT,UPDATE ON judytik.soundpad_workspaces TO :"runtime_role";

GRANT SELECT,INSERT,UPDATE ON judytik.tts_workspaces TO :"runtime_role";

GRANT SELECT,INSERT,UPDATE ON judytik.overlays_workspaces TO :"runtime_role";

-- Games catalog: archival API has no need for DELETE or version-history mutation.
GRANT SELECT,INSERT,UPDATE ON judytik.game_categories,judytik.games,judytik.game_presets TO :"runtime_role";
GRANT SELECT,INSERT ON judytik.game_preset_versions TO :"runtime_role";

-- History cannot be deleted, reassigned, or written from a different desktop device.
GRANT SELECT,INSERT,UPDATE ON judytik.live_history TO :"runtime_role";

-- Entitlement history is append-only to the runtime role. Mutations require the admin service key.
GRANT INSERT,UPDATE ON judytik.entitlement_grants TO :"runtime_role";
GRANT SELECT,INSERT ON judytik.entitlement_operations TO :"runtime_role";
GRANT UPDATE(merged_into_id,merged_at) ON judytik.users TO :"runtime_role";
GRANT SELECT,INSERT ON judytik.account_merge_archives TO :"runtime_role";
