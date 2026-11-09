# Admin game file import implementation plan

> Execute inline with superpowers:executing-plans and test-driven-development.

**Goal:** An admin uploads a native JudyTik export and cover with game name, description and stable slug in one request; no purchase restrictions.

**Architecture:** POST /v1/admin/games/import accepts multipart presetFile and coverFile plus metadata. Validate the native version-1 wrapper and existing PresetWrite contract, decode/re-encode a bounded raster cover as WebP, then atomically create game, cover, preset, version and audit records. Store bounded image bytes separately from catalogue DTOs. Existing published catalogue/import APIs remain compatible. Public cover requests check publication/category visibility; admin preview uses the admin key.

**Design decisions:** Required cover upload per user confirmation. PostgreSQL storage avoids orphan files and new Windows storage configuration. Native actions are preserved; references to local media produce a warning. Draft by default; status=published creates a published default preset. Duplicate slug returns 409 and never overwrites. No desktop UI redesign or entitlement enforcement.

**Tech stack:** NestJS multipart interceptor, Prisma/PostgreSQL, Sharp, Zod.

## Tasks

- [x] Write failing native-export validation, multipart/auth/limits and image tests.
- [x] Implement bounded parser and cover normalization; add atomic database import and public/admin image reads with migration and restricted grants.
- [x] Verify real PostgreSQL rollback, duplicate concurrency, image persistence, draft/archive visibility and copying into an account.
- [x] Update OpenAPI, Thai Markdown and Postman; run typecheck, unit/HTTP tests, database tests and production build.
- [x] Review final diff and synchronize the separate JudyTikServer checkout without disturbing existing work.

## Verification and review ledger

Authoritative separate server checkout: PostgreSQL integration 128 passed, typecheck and production build passed. Unit/HTTP suite includes native files, multipart limits, raster decode/resize, APNG, auth-independent origin and OpenAPI schema resolution. Thai JSON example validated against generated response schema; Node and Postman examples syntax checked. Native fixture compared byte-for-byte with the real desktop encoder.

Review corrections: extract shared public origin validation so uploaded covers do not depend on optional OAuth settings; explicitly detect APNG acTL chunks because the decoder can omit page count. Both reproduced failing tests before fixes. Generated games OpenAPI references also needed component-scoped recursive definitions and input-mode schemas to describe optional defaulted request fields correctly; covered by a failing-to-passing schema test. Final corrective review found no further actionable issues.

## Review focus

Reject unknown file fields, oversized/invalid images and unsupported export versions. Never trust client MIME or filenames as paths. Do not expose cover bytes in list responses. Keep source rules intact. Preserve runtime role isolation, transactional audit/version history, and existing CRUD semantics.
