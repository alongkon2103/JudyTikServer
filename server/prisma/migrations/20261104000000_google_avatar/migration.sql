-- Preserve existing avatars while allowing the verified Google profile CDN.
BEGIN;
ALTER TABLE judytik.users DROP CONSTRAINT trusted_avatar_origin;
ALTER TABLE judytik.users ADD CONSTRAINT trusted_avatar_origin CHECK (
  avatar_url IS NULL OR
  avatar_url ~ '^https://cdn[.]discordapp[.]com/(avatars/[0-9]+/(a_)?[0-9a-f]{32}[.]png[?]size=128|embed/avatars/[0-5][.]png)$' OR
  avatar_url ~ '^https://lh[0-9]+[.]googleusercontent[.]com/(a|a-)/[^[:space:]]+$'
);
COMMIT;
