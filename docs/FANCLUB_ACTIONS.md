# Fan-club Actions (2026-11-03)

Desktop trigger `fanclub` is separate from paid subscription trigger `subscribe`. `threshold` is the inclusive minimum fan-club level, evaluated once per eligible event; levels never accumulate. Existing saved triggers keep their meanings. No database migration is required because preset Actions are JSON data.

## Installed SDK evidence

Inspected `tiktok-live-connector` 2.4.0 `processDecodedData`, its event map, and `tiktok-live-proto` 0.2.3 v3 definitions. The code reads active `User.fansClub.data.level` or non-sleeping `User.fansClubInfo.fansLevel` on `member` entrance messages (action 0/1 only, excluding admin changes). It handles `barrage` types 10 (`FANS_LEVEL_UPGRADE`) and 11 (`FANS_LEVEL_ENTRANCE`) via `fansLevelParam.currentGrade` and its nested user. It never reads gifting `payGrade`/`userGradeParam`, subscriber months, or another club in `preferData`. Missing/inactive/invalid level data does not run a fan-club Action. TikTok may omit fan-club metadata; there is no inferred membership.

Message-ID deduplication remains in place. Entrance messages for the same viewer/level from the other raw channel within two seconds are suppressed to avoid running both member and barrage announcements. Same-channel new messages and fan-level upgrades remain independent events; configured cooldown still applies.

The editor uses the same Lucide SVG icon maps as the Actions list, with plain accessible labels and typeahead text.

## Deployment

Update Backend contracts before using fan-club presets on VPS. Prepared files are also in the local `JudyTikServer` checkout. Before releasing Desktop 0.1.3, deploy the matching Backend contracts, build and restart the Backend. The fan-club trigger itself needs no database migration. Google profile photos separately require `20261104000000_google_avatar`; that migration was applied successfully on VPS on 2026-11-04. No `.env` change or `prisma db push` is needed for fan-club Actions. Older desktop versions cannot load a preset containing an unknown trigger; use the updated Desktop for fan-club presets.

## Verification

Desktop: 551 tests passed, including actual installed protobuf encode/decode → SDK event mapping → protocol → eligible Actions. Backend: 131 unit tests passed. Native Electron editor check passed four size/theme cases (1024/1280px, dark/light), SVG-only menu icons, Lv5 input/save and separate paid subscriptions. These fixtures do not connect to a real live channel or execute native keys.

Primary reference: https://ttlc.docs.isaackogan.com/events/chat-and-audience/
