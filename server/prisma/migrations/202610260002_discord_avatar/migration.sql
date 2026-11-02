BEGIN;
ALTER TABLE judytik.users ADD COLUMN avatar_url VARCHAR(512);
ALTER TABLE judytik.users ADD CONSTRAINT trusted_avatar_origin CHECK(avatar_url IS NULL OR avatar_url ~ '^https://cdn[.]discordapp[.]com/(avatars/[0-9]+/(a_)?[0-9a-f]{32}[.]png[?]size=128|embed/avatars/[0-5][.]png)$');
COMMIT;
