# Backend package

ใช้คู่มือ [Windows Server + Cloudflare Tunnel](../deploy/windows/README.md) สำหรับการติดตั้งจริง โฟลเดอร์นี้ต้องอยู่คู่กับ `../shared` และ root package.json ที่กำหนด ESM

## คำสั่ง

- `npm ci --include=dev`: ติดตั้งจาก lockfile รวม Prisma/TypeScript ที่ใช้จัดเตรียมระบบ
- `npm run prisma:generate`: สร้าง client (ต้องมี DIRECT_URL ใน env)
- `npm run typecheck` / `npm test`: ตรวจโค้ดและ unit/HTTP tests
- `npm run build` / `npm start`: สร้างและรัน `dist/main.js`
- `npm run db:migrate`: ใช้ Prisma migrate deploy เท่านั้น ไม่ใช้ migrate dev/db push บนฐานจริง
- `npm run test:database`: สร้าง/ลบ PostgreSQL ชั่วคราว ไม่ชี้ฐานจริง; build ก่อนเพื่อทดสอบ production start
- `npm run api:generate`: สร้าง openapi.json จาก contracts ใน repository นี้
- `npm run gifts:sync`: เรียก admin sync ผ่าน Backend ที่เปิดอยู่บน loopback
- `node scripts/import-judy-game-catalog.mjs --apply`: นำเข้าข้อมูลต้นฉบับ 19 เกมผ่าน admin API แบบไม่เขียนทับรายการที่ไม่ตรงกัน

## API

- `/v1/health`, `/v1/health/ready`: process/database readiness
- `/v1/auth/*`, `/v1/me*`: Discord OAuth, device sessions, account/settings
- `/v1/presets*`: Actions presets พร้อม ETag, ownership และ autosave conflict detection
- `/v1/gifts*`: gift catalog จาก Euler public API; admin sync/overrides แยกสิทธิ์
- `/v1/games*`, `/v1/game-categories`: รายการเกมและพรีเซต
- `POST /v1/games/:gameId/presets/:presetId/import`: `{targetId?,revision?,name?}` → `{preset,warnings,skippedActions}`
- `/v1/me/win`, `/v1/me/soundpad`, `/v1/me/tts`, `/v1/me/overlays`, `/v1/me/live-history*`: account-scoped workspaces/history ตาม OpenAPI

พรีเซตเกม 19 ชุดมี 239 source Actions; เมื่อเทียบกับแค็ตตาล็อกที่ตรวจใน dev นำเข้าได้ 234 Actions / 238 keypress effects โดยแจ้งข้ามวงล้อว่าง 2 และรหัสของขวัญเก่าที่ไม่มี 3 รายการ การจับคู่ของขวัญอ้างแค็ตตาล็อกของฐานปลายทาง จึงต้อง sync ของขวัญก่อนทดสอบ import ไม่เดาเปลี่ยน explicit gift ID และไม่แก้ต้นฉบับ ไม่มีการเชื่อม Tikkies ระหว่าง runtime

Runtime ต้องไม่มีสิทธิ์เป็นเจ้าของ schema/tables ตัว production ตรวจและปฏิเสธ role ที่ไม่ปลอดภัย กรณีเพิ่ม migration ใหม่ต้องใช้ `prisma/runtime-grants.sql` อัปเดตสิทธิ์ตามคู่มือ

## Admin API จัดการ FREE/PRO และวันหมดอายุ (5 พ.ย. 2569)

ใช้ `Authorization: Bearer <ADMIN_API_KEY>` เดิม ทุกเส้นทางอยู่ใต้ `/v1/admin/entitlements` ไม่ใช้ access token ของผู้ใช้ และไม่เปลี่ยนข้อจำกัดหน้าหรือฟังก์ชัน Desktop ในรอบนี้

| Method | Path | การทำงาน |
| --- | --- | --- |
| GET | `/v1/admin/entitlements?userId=UUID` | อ่านสิทธิ์ปัจจุบัน เปลี่ยนไปใช้ `?email=...` ได้ |
| POST | `/v1/admin/entitlements/adjust` | เพิ่มหรือลดวันด้วย `days` จำนวนเต็มที่ไม่เป็น 0 |
| POST | `/v1/admin/entitlements/set-expiry` | กำหนด `expiresAt` เป็น ISO timestamp พร้อม timezone |
| POST | `/v1/admin/entitlements/revoke` | ถอน PRO ทั้งปัจจุบันและที่ตั้งเวลาไว้ |
| GET | `/v1/admin/entitlements/history?userId=UUID&limit=25` | ประวัติ API พร้อม `nextCursor`; ส่ง `before=nextCursor` เพื่ออ่านหน้าถัดไป |

ทุกคำขอระบุ **อย่างใดอย่างหนึ่งเท่านั้น** ระหว่าง `userId` กับ `email` อีเมลต้องเป็นอีเมลที่ยืนยันแล้วของบัญชีที่มีอยู่ ไม่สร้างบัญชีหรือ Whitelist ล่วงหน้าให้ผู้ที่ยังไม่เคยล็อกอิน API แก้สิทธิ์ไม่รับบัญชีที่ถูกปิด แต่แอดมินยังดูสถานะ/ประวัติได้ อีเมลใน query ต้อง URL encode โดยเฉพาะเครื่องหมาย `+` (Collection จัดการให้แล้ว)

ตัวอย่างเพิ่ม 30 วัน:

```http
POST /v1/admin/entitlements/adjust
Authorization: Bearer <ADMIN_API_KEY>
Idempotency-Key: order:your-system-12345
Content-Type: application/json
```

```json
{"userId":"USER_UUID","days":30,"source":"admin-panel","reason":"Order 12345 confirmed"}
```

`source` เป็นรหัสระบบ 1–80 ตัวอักษร (A-Z/a-z/0-9/จุด/ขีด/ขีดล่าง/colon) และ `reason` เป็นข้อความ 1–300 ตัวอักษร ต้องส่งทั้งสองค่าทุกครั้ง ถ้ากำหนดวันหมดอายุให้เปลี่ยน `days` เป็น `expiresAt` เช่น `2026-12-05T23:59:59+07:00`; ถอนสิทธิ์ส่งเฉพาะผู้ใช้/source/reason

- เพิ่มวันต่อจากวันหมดอายุเดิมถ้ายังเป็น PRO ถ้าหมดแล้วเริ่มนับจากเวลาปัจจุบันของเซิร์ฟเวอร์
- ลดวันต้องมี PRO ที่ยังไม่หมด ถ้าลดจนหมดจะหยุดที่เวลาปัจจุบันและกลายเป็น FREE
- 1 วัน = 24 ชั่วโมง; `days` อยู่ระหว่าง -36500 ถึง 36500 และผลลัพธ์ห้ามเกินปัจจุบัน + 36500 วัน
- ตั้งวันที่ในอดีต (ตั้งแต่ปี 2000) ได้เพื่อให้หมดสิทธิ์ การแก้ไขแทนที่ grants ที่ยังไม่ถูกถอนทั้งหมด รวม grants ที่ตั้งไว้ในอนาคต เก็บข้อมูลเดิมไว้พร้อม `revokedAt`
- ทุก POST ต้องมี `Idempotency-Key` 8–128 ตัวอักษร `[A-Za-z0-9._:-]` ใช้รหัสเดิมเมื่อ retry **รายการธุรกิจเดิม** และใช้รหัสใหม่สำหรับรายการใหม่ ฐานข้อมูลเก็บรหัสถาวรจนกว่าเจ้าของระบบจะกำหนดนโยบาย retention เพิ่มเติม
- คำขอซ้ำด้วยเนื้อหาเดิมคืน `replayed: true` และ snapshot เดิม โดยไม่แก้สิทธิ์ปัจจุบันซ้ำ ถ้าใช้รหัสซ้ำกับข้อมูล/ผู้ใช้อื่นตอบ 409 `IDEMPOTENCY_KEY_CONFLICT` ต้อง GET อีกครั้งหากต้องการสถานะปัจจุบัน
- สิทธิ์ ประวัติ และ audit บันทึกใน transaction เดียวกัน; ส่งหลายรายการพร้อมกันไม่ทำให้จำนวนวันหาย `requestId` ใช้อ้างอิงรายการได้
- ประวัตินี้ครอบคลุมรายการผ่าน API ใหม่ ไม่สามารถสร้างเหตุผล/source ย้อนหลังให้ grants ที่เคยแก้ด้วย SQL ก่อนหน้านี้
- เกินเวลาแล้ว `/me/entitlements` และ API แอดมินจะอ่านเป็น FREE อัตโนมัติ ไม่ต้องรอ cron; ฝั่ง Desktop เห็นข้อมูลใหม่เมื่อ refresh สิทธิ์ รอบนี้ยังไม่เพิ่มการตัดการใช้งานระหว่าง LIVE หรือข้อจำกัดแต่ละหน้า

รหัสหลัก: 400 `INVALID_REQUEST`/`ENTITLEMENT_EXPIRY_OUT_OF_RANGE`, 401 `ADMIN_UNAUTHORIZED`, 404 `ENTITLEMENT_USER_NOT_FOUND`, 409 `ENTITLEMENT_NOT_ACTIVE`/`ENTITLEMENT_USER_DISABLED`/`IDEMPOTENCY_KEY_CONFLICT`, 428 `IDEMPOTENCY_KEY_REQUIRED`, 429 `RATE_LIMITED` (แอดมิน 30 requests/min/IP และ quota รวม API 120/min/IP)

### ลองด้วย Postman

นำเข้าสองไฟล์ใน `server/postman/`:

- `JudyTik-Admin-Entitlements.postman_collection.json`
- `JudyTik-Admin.postman_environment.json`

เลือก Environment แล้วกรอก `adminApiKey` ด้วยค่า `ADMIN_API_KEY` ของเซิร์ฟเวอร์ และ `email` ของบัญชีทดสอบที่ยืนยันแล้ว `baseUrl` ตั้งไว้เป็น `https://judytik.judygamestudio.com/v1` หรือเปลี่ยนเป็น `http://127.0.0.1:4300/v1`

ส่ง 01 เพื่อค้นหาบัญชีและบันทึก `userId` อัตโนมัติ จากนั้นเลือกส่งคำขอที่ต้องการ ถ้ารู้อยู่แล้วสามารถกรอก `userId` และข้าม 01 ได้ `addDays` เริ่มต้น 30, `subtractDays` -7 ส่วน `expiresAt` ว่างจะตั้งเป็นอีก 30 วันเมื่อส่ง 06 ครั้งแรก เปลี่ยนค่าเองได้ POST เปลี่ยนสิทธิ์จริง จึงควรลองกับบัญชีทดสอบก่อน

03 สร้างรหัสรายการใหม่ทุกครั้งที่กด Send; **04** ใช้รหัสและ payload ของ 03 ครั้งก่อนเพื่อทดสอบ retry โดยไม่บวกวันซ้ำ ต้องมีประวัติอย่างน้อย 3 รายการจึงจะลองหน้าถัดไปของประวัติ (10) ได้ ไฟล์ Environment ที่แจกไม่มี API Key อยู่ภายใน

### Deploy บน Windows Server

ต้องใช้ Node 24 และ `DIRECT_URL` ของ migration owner พร้อม `DATABASE_URL` ของ runtime role เดิมใน `server/.env` เพิ่ม migration `20261105000000_entitlement_management` และอัปเดต grants ก่อน restart:

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
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

`db:grants` อ่านชื่อ runtime role จาก DATABASE_URL หากใช้ pooler username ที่ไม่ตรงกับชื่อ role จริง ให้ตั้ง `RUNTIME_DB_ROLE=judytik_runtime` (หรือชื่อจริง) ใน `server/.env` สคริปต์จะปฏิเสธ owner/superuser/BYPASSRLS และไม่พิมพ์รหัสผ่าน ไม่ต้องเพิ่ม API key ใหม่ ใช้ ADMIN_API_KEY เดิมได้ การเชื่อมต่อ runtime บังคับ timezone UTC เพื่อให้ timestamp ตรงกันบน Windows/ฐานข้อมูลที่ตั้งเขตเวลาท้องถิ่น
