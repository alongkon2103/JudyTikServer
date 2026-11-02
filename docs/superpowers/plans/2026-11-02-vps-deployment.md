# JudyTikServer VPS Deployment Implementation Plan

> **For agentic workers:** Use executing-plans for this approved deployment scope. The user explicitly authorized implementation and publication to alongkon2103/JudyTikServer.

**Goal:** Publish a standalone Backend + shared repository, verified build and deployment guide for judytik.judygamestudio.com with PostgreSQL on the VPS.

**Architecture:** Retain server/ and shared/ relative imports, root ESM package boundary, independent server lockfile. Node 24 runs as an Windows LocalService account on loopback:4300 behind a local cloudflared Tunnel. Migration and runtime database credentials remain separate; runtime trusts only an explicitly configured loopback proxy.

**Tech stack:** Existing Nest/Express, Prisma 7, PostgreSQL; Windows Server deployment reference; Cloudflare Tunnel/WinSW. No Electron build, VPS login, production database mutation, website change or new application dependencies.

## Review focus
- A clean checkout must build/start without the Desktop checkout or its node_modules.
- Forged forwarded headers must not bypass IP limits through the documented proxy topology.
- No .env, private keys, existing Git history or development credentials may be published.
- Migration role may own schema/tables; runtime must have neither ownership nor BYPASSRLS.
- Persistent auth keys, backups, first-time gift/game data, OAuth callbacks and restart/update commands must be documented.

## Tasks
- [x] Inventory and copy only Backend runtime/source/test/contracts/migrations/data/scripts and shared dependencies into a clean Git repository.
- [x] Add failing proxy regression tests; implement opt-in TRUST_PROXY=loopback before rate limiting, preserving direct mode by default.
- [x] Build and launch from an isolated checkout; fix backend packaging/assets without Electron changes.
- [x] Prepare runtime/migration environment examples, secret generator with no-overwrite behavior, Windows service configuration and Cloudflare Tunnel instructions, environment runner and Thai deploy guide.
- [x] Run server unit, PostgreSQL integration, clean build/start/readiness and configuration/secret-safety checks; independently review.
- [ ] Review exact staged files, commit and push to the requested GitHub repository; verify remote commit matches.

Ruling: User clarified Windows Server and Cloudflare Tunnel during implementation; Linux/systemd/Caddy assets are superseded and will not be published as the primary deployment path.

Verification: Node 24 independent npm ci/Prisma generate/typecheck/build passed. Server unit/HTTP 114 passed; deploy env tests 4 passed; disposable PostgreSQL 108 passed including generated database bootstrap, migrate, grants and real built production readiness. Reviewer P1 on precreated Windows env directory fixed by rejecting existing directories; Windows CI covers ACL regression. Native service/tunnel/reboot remain target-host acceptance.
