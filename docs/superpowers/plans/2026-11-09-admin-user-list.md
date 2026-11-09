# Admin User List Implementation Plan

> **For agentic workers:** Implement inline using the existing NestJS and Prisma patterns. Do not change feature entitlement enforcement.

**Goal:** Add a read-only Admin account list with partial email search, current FREE/PRO filtering, and pagination, and update the Thai integration documentation.

**Architecture:** `GET /v1/admin/users` uses the existing AdminGuard and CLOCK. Count and page rows share a RepeatableRead transaction and one time snapshot. Merged source accounts are excluded; disabled accounts remain inspectable. Explicit DTO selection excludes credential and session secrets.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Zod, node:test, existing OpenAPI generator and Postman collection.

**Spec:** User request in this chat; existing Admin entitlement semantics in `server/src/entitlements/admin.service.ts` and `contracts.ts`.

## Global Constraints

- Do not lock or change FREE/PRO capabilities, LIVE, Actions or any Desktop runtime.
- Keep the existing `ADMIN_API_KEY` authorization and Admin rate limits.
- No production database queries or mutations for verification.
- `email` is an optional literal, case-insensitive substring; `%`, `_`, and `\` must not act as SQL wildcard operators.
- `plan` accepts FREE/PRO only. PRO requires an unrevoked grant already started and expiring after the captured Server time.
- `page` defaults to 1 and is bounded at 1000000; `pageSize` defaults to 25 and accepts 1–100.
- Return canonical accounts once, newest first with ID as a stable tie-breaker. No online status is introduced.

## Review Focus

- Expiry exactly equal to now is FREE; future or revoked grants do not confer PRO.
- Accounts without a verified email still appear in unfiltered results.
- Google/Discord identities merged into one account must not create duplicate rows.
- Filtered total and page rows must use the same transaction/time boundary.
- Response must never contain provider subjects, tokens, password hashes or session IDs.

## Tasks

1. Add failing contract, HTTP authorization and service mapping tests in `server/test/admin-users.test.ts`, plus database coverage for filtering and paging.
2. Add `server/src/accounts/admin.contracts.ts`, `admin.service.ts` and `admin.controller.ts`; register them in `server/src/app.module.ts`.
3. Add OpenAPI definitions through `server/src/accounts/admin.openapi.ts` and `server/scripts/generate-openapi.ts`. Add a Postman GET request without changing existing mutation request ordering.
4. Expand `docs/ADMIN_ENTITLEMENTS_API.th.md` with query fields, response, search examples, error behavior, pagination and account merge semantics.
5. Verify focused tests, Server typecheck/build/full tests, generated OpenAPI and documentation examples. Sync the scoped Server change to its separate repository; leave deployment to the user.
