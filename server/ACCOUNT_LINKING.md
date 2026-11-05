# Verified Google / Discord account linking

Google and Discord identities now share one JudyTik account when a **fresh provider callback supplies the same verified email**. An unverified email, display name or an email supplied by the Desktop client cannot link accounts. No new environment variables are required.

## Existing accounts

The existing owner of the verified email remains the primary account. A different existing provider account is linked on its next successful sign-in with that verified email. Merely deploying, refreshing an old session or opening the account screen cannot prove the missing Google email and does not merge it. After deploying, sign out and sign in with Google once; subsequently either provider opens the same user ID. A linked source session is revoked and must sign in again.

The merge is one database transaction. It locks users and the verified email, archives both original states before changes, copies active action presets with new IDs, combines cloud LIVE history and Soundpad pads, and copies grant windows. Existing PRO uses the latest valid expiry; remaining days are **not added together**. Future admin API calls using an old user ID resolve to the primary account, and historical admin operations remain visible without replaying grants.

Both original users and their original records remain in the database. Identities point to the primary account. Current primary settings, WIN, TTS and Overlay configurations stay active when both sides have that module; the other configuration is available from backups. A missing primary module is copied from the source. Conflicting Soundpad shortcuts are cleared on the added copy. Soundpad's 100-pad limit still applies: overflow remains in the source backup and original rows. Deleted presets remain in the original snapshot rather than being reactivated.

## Backups and Desktop files

The updated Desktop account page shows both providers and a backup section after a merge. Users can download the full original JSON snapshot or restore one settings/WIN/Soundpad/TTS/Overlay module. Restoring checks the current revision, asks for confirmation, and archives the current state first. It does not replace presets, history or rights. A revision conflict requires reloading the module before retrying. Settings such as language/theme may require reopening the app.

Only server-authorized linked account IDs can be used to resolve old media bindings on the same computer. Colliding binding IDs are remapped with explicit aliases so both original files remain usable. No media bytes are uploaded to the server. Unsynced local LIVE history is imported once while keeping source files; local WIN recovery remains intact and is included in downloaded source backups on that computer. Another computer still requires the media files to be selected/copied locally.

Snapshots contain original settings, workspaces, all presets (including tombstones), history, grants and device metadata; no OAuth secrets, session credentials or refresh tokens. Each captured state is limited to 24 MiB. Excess returns `ACCOUNT_MERGE_TOO_LARGE` and rolls back instead of truncating records. Native history capacity remains 1,000 records / 16 MiB; original local source files are retained if an import reaches that limit. Take the normal database backup before deployment; keep existing Desktop user-data folders.

## Session-authenticated endpoints

- `GET /v1/me/account-merges`: backup metadata, authorized linked owners and media aliases.
- `GET /v1/me/account-merges/:id`: download an immutable original cloud snapshot.
- `POST /v1/me/account-merges/:id/restore`: JSON `{ "module": "overlaysWorkspace", "revision": "5" }`. Modules: `settings`, `winWorkspace`, `soundpadWorkspace`, `ttsWorkspace`, `overlaysWorkspace`. Read the current revision from the corresponding settings/workspace GET endpoint; use `"0"` for a missing module.

These routes use the user's Desktop bearer session, not `ADMIN_API_KEY`. Backups are protected by ownership checks and PostgreSQL forced RLS. The runtime role may insert/read archive rows but cannot update/delete them. Invalid IDs return 400, another account's archive returns 404, incompatible backup 409, revision conflict 412. `openapi.json` documents all three endpoints.

## Windows Server deployment

Run in PowerShell from the backend repository. Stop at the first failure and inspect the error; do not paste an unfinished `if` statement.

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
npm --prefix server ci
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
pm2 stop judytik-backend
if ($LASTEXITCODE -ne 0) { throw 'Stop failed' }
npm --prefix server run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
npm --prefix server run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
npm --prefix server run db:grants
if ($LASTEXITCODE -ne 0) { throw 'Runtime grants failed' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
pm2 restart judytik-backend --update-env
if ($LASTEXITCODE -ne 0) { throw 'Restart failed' }
pm2 status
Invoke-RestMethod http://127.0.0.1:4300/v1/health
```

The new migration is `20261105010000_verified_account_linking`. `db:grants` is required after migration so the restricted runtime can set merge pointers and access archives. Use the updated Desktop build/restart its development process to load the new preload bridge, then sign in freshly with the previously separate Google account. Verify both providers, PRO expiry, both preset sets and backup entries before removing any personal backup copies.
