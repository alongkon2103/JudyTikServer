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
