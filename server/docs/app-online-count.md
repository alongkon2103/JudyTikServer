# JudyTik app online count

The header eye pill shows the number of unique signed-in JudyTik accounts with an active desktop lease. Multiple sessions, devices and processes for one account count once. It is independent of TikTok LIVE, plan, Euler, and TikTok network requests. Signed-out installations and old app versions without this reporter cannot be counted. The visual count is refreshed every 60 seconds; abrupt closure or connectivity loss may leave a lease visible for up to 150 seconds. Successful shutdown, logout and system suspend stop the process lease immediately when the service is reachable.

No profile, TikTok username, room, identity list or device list is returned. `GET /v1/app-presence/count` requires a valid desktop session and returns only `count`, `serverTime` and `refreshAfterMs`. Revoked or expired sessions and disabled or merged accounts are excluded immediately. A stopped connection ID cannot be restarted; server-side tombstones also protect a DELETE that reaches the server before its delayed POST. Tombstones are removed when their owning session is deleted.

Desktop lifecycle: `AppPresenceReporter.start()` after account initialization; `accountChanged()` on auth state changes; `pause()` before logout or system suspend; `resume()` after logout completes or system resumes; `close()` on final shutdown. It polls and reports from the main process. Each request has a two second abort deadline; pause aborts current work and then attempts bounded lease retirement. Renderer IPC can only read the current aggregate snapshot. The header shows an em dash when signed out, the service is absent, a request fails, or an account changes; a successful zero remains zero.

## Deployment

Deploy the backend before distributing a desktop build containing the reporter. Using the existing migration owner and restricted runtime role, run from the backend repository:

```
npm ci
npm run prisma:generate
npm run db:migrate
npm run db:grants
npm run api:generate
npm run build
```

The migration `20261111010000_app_presence` creates the private `judytik.app_presences` table and aggregate function. Applying migrations alone is insufficient: reapply `prisma/runtime-grants.sql` with `npm run db:grants` so the restricted runtime role has table writes and function execution. Restart the service after deployment. No new credential or application setting is required.

The table enables owner-scoped RLS. It intentionally does not FORCE RLS: the separate migration owner owns a fixed `SECURITY DEFINER` SQL function which bypasses RLS only to return the distinct eligible account count. Its search path is fixed to `pg_catalog,pg_temp`, every application relation is schema qualified, and PUBLIC execution is revoked. The runtime role must not own the table/function, inherit the migration owner, be a superuser, or have BYPASSRLS. The existing production startup role check enforces this separation.

Verification: `node --test tests/app-presence.test.ts`, `npx electron electron/app-presence-ui-smoke.cjs`, backend `npm test`, and backend `npm run test:database` (disposable local database only). The database suite includes account/device deduplication, lease expiry, sequence ordering, stop tombstones, authorization, RLS, and immediate session/account eligibility changes. Header screenshots are generated under `previews/app-presence/`.
