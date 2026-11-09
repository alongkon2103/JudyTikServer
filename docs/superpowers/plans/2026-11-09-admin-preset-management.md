# Complete native game preset administration

**Goal:** Make listing, reading, creating, editing and archiving the imported game/preset catalogue usable from the admin backend and Postman; continue without purchase restrictions.

**Existing:** Admin GET/POST/PUT/DELETE game and nested preset routes already exist, with pagination, strong ETags, archive/history and admin authentication. Public GET /games intentionally lists published games only. Initial import creates draft by default. Do not duplicate this API or replace archival with destructive deletes.

**Gaps:** Replace an uploaded cover; upload replacement native preset JSON without losing ID/metadata/history; add another native file preset to an existing game; complete concrete CRUD examples and collection requests.

## Plan

- [x] Add failing HTTP/native-file CRUD tests and database CAS/rollback/visibility tests.
- [x] POST /admin/games/:id/presets/import: native presetFile + slug, optional presetName/description/status/isDefault. Reuse existing preset save transaction.
- [x] PUT /admin/games/:id/presets/:presetId/file: native presetFile, optional presetName; If-Match of preset required. Preserve existing ID/slug/description/status/default, version and audit updated atomically.
- [x] PUT /admin/games/:id/cover: coverFile + If-Match of game. Normalize image, upsert separately stored cover and increment/audit game revision in one transaction. Restrict runtime UPDATE grant to cover data column.
- [x] Document and test existing list/detail/metadata-edit/archive paths; distinguish public and admin visibility, omitted PUT fields, stale revision errors and archived history.
- [x] Update Thai MD/OpenAPI/Postman, run unit/HTTP and real PostgreSQL suites/build, review and push the separate server repo. Synchronize backend files into desktop workspace without including unrelated desktop fixes.

## Verification ledger

Authoritative server: typecheck and production build passed; 163 unit/HTTP tests and 132 PostgreSQL integration tests passed. CRUD scenario covers listing/details, metadata edits, native file replacement retaining IDs/history, extra preset creation, cover replacement, stale writes and archive/public visibility. Concurrent native replacements permit one winner. Injected audit failure rolls back cover bytes/revision. Runtime data-column grant allows cover replacement while identity/creation-time updates remain denied.

Thai JSON examples validated against OpenAPI; all Postman methods/paths match documented operations; If-Match headers and script syntax checked. Review found missing binary properties in three generated multipart schemas; regression reproduced failure, helper corrected, schemas regenerated and corrective review confirmed no outstanding findings. No purchase restrictions added. Reapply runtime grants on deployment.
