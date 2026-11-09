# API รายการ TikTok LIVE อัตโนมัติ

ทุกเส้นทางใช้ prefix `/v1` และ `Authorization: Bearer <desktop session access token>` ใช้ได้ทุกแผน บริการนี้รายงานช่องที่แอปเชื่อมต่อ LIVE อยู่จริง ไม่ใช่การยืนยันว่าเจ้าของบัญชี JudyTik เป็นเจ้าของช่อง TikTok และไม่เรียก TikTok/Euler เพิ่มเติม

- `POST /me/live-presence` รับ `{connectionId,username,roomId,displayName,avatarUrl,viewers}` แบบ strict: UUID ใหม่ต่อการเชื่อมต่อ, username ตัวพิมพ์เล็ก ASCII 2–24 (`a-z0-9_.`), roomId ตัวเลข 8–30 หลักและไม่เป็นศูนย์ทั้งหมด, displayName ไม่ว่าง 1–80 ตัวอักษร ไม่มี control/bidi characters, avatarUrl เป็น null หรือ HTTPS TikTok CDN, viewers เป็น null หรือจำนวนเต็ม 0–1,000,000,000
- สำเร็จ `200 {connectionId,expiresAt,heartbeatAfterMs:30000}` อายุ lease 90 วินาที ส่ง POST ซ้ำ ID เดิมขณะ active ได้ผลเดิมและไม่ต่ออายุ/เปลี่ยนข้อมูล ID ที่ stop แล้วตอบ `409 PRESENCE_LEASE_CLOSED` เริ่ม ID ใหม่แทนที่ lease เดิมของ session
- `PUT /me/live-presence/{connectionId}` รับ strict `{sequence,displayName,avatarUrl,viewers}` sequence เป็นจำนวนเต็ม 1–MAX_SAFE_INTEGER ต้องตรง lease ที่ active และยังไม่หมดอายุ จึงต่ออายุ 90 วินาที sequence เก่าหรือเท่ากันได้ผลเดิมโดยไม่ต่ออายุ/เขียนทับ lease ที่หมดอายุหรือถูกแทนที่ตอบ `404 PRESENCE_LEASE_EXPIRED`
- `DELETE /me/live-presence/{connectionId}` ตอบ `204` ปิดเฉพาะ ID ที่ตรงกัน ID เก่าไม่กระทบ lease ใหม่ หาก DELETE มาก่อน POST จะจอง tombstone ID นั้นเพื่อป้องกัน POST ที่มาช้าทำให้ LIVE กลับมา เก็บประวัติ ID ที่เคยใช้ใน live_presence_connections ตลอดอายุ session แม้เริ่ม connection ใหม่แล้ว POST ของ ID ที่ stop หรือถูกแทนที่ตอบ 409 โดยไม่กระทบ lease ใหม่
- `GET /live/active` ตอบ `{items,serverTime,refreshAfterMs:30000}` แต่ละ item มีเฉพาะ `{username,roomId,displayName,avatarUrl,viewers,lastSeenAt}` สูงสุด 50 ช่อง เลือกรายงานล่าสุดต่อ username โดยไม่รวมจำนวนคนดู เรียง viewers มากไปน้อย, null สุดท้าย, username เป็นลำดับคงที่เมื่อเสมอกัน

การยกเลิก/หมดอายุ session, ปิดบัญชี หรือรวมบัญชีต้นทาง ทำให้ช่องหายจากผลลัพธ์ทันที โดยไม่ต้องรอ lease หมดอายุ การขาด heartbeat ทำให้หายเมื่อครบ 90 วินาที ไม่มี user ID, session ID, email, token หรือ connection ID ใน directory

ฐานข้อมูล `live_presences` มี primary key เป็น session_id และ FK ไป Session เพียงแห่งเดียว จึงไม่มี owner ซ้ำซ้อนที่ผิดหลังรวมบัญชี ใช้ CLOCK ใน service, transaction lock ของ session เพื่อจัดลำดับ start/heartbeat/stop และ RLS ตรวจ Session.user_id สำหรับการเขียน อ่านข้าม session ได้เฉพาะใน user context ของ runtime เพื่อให้ service สร้าง projection ที่ปลอดภัย ไม่อนุญาต DELETE แถวให้ runtime role ตาราง live_presence_connections เก็บเฉพาะ session_id/connection_id แบบ append-only (runtime อ่าน/เพิ่มได้เฉพาะเจ้าของผ่าน RLS ไม่มี UPDATE/DELETE) และลบตาม Session ด้วย ON DELETE CASCADE จึงไม่ต้องมี global cleanup job

Deploy: ใช้ migration role รัน `npm run db:migrate` แล้ว `npm run db:grants` ด้วย runtime role ที่จำกัดสิทธิ์ตามคู่มือ server เดิม สร้าง Prisma client ด้วย `npm run prisma:generate` เอกสาร routes/schema สร้างจาก `npm run api:generate` (server/openapi.json) ทดสอบด้วย disposable PostgreSQL เท่านั้นผ่าน `npm run test:database` รวมชุด `test/live-presence.integration.ts` และ `npm test`/`npm run typecheck` ไม่มีการเผยแพร่ release/tag ในงานนี้



## การแสดงผลใน JudyTik

แสดงอัตโนมัติทุกช่องที่เชื่อมต่อ LIVE ผ่านโปรแกรม บนหน้าภาพรวม ทั้ง FREE/PRO ไม่มีปุ่มสมัครแสดงช่อง รายการมีรูปช่อง ชื่อ @username และยอดผู้ชมจากข้อมูลการเชื่อมต่อเดิม กดช่องเพื่อเปิด TikTok LIVE ได้ ช่องเดียวกันหลายเครื่องจะแสดงเพียงรายการเดียว ไม่รวมยอดผู้ชมซ้ำ

รายการรีเฟรชทุก 30 วินาทีเฉพาะเมื่อเปิดหน้าภาพรวม โปรแกรมยังส่ง heartbeat ขณะย่อหน้าต่าง หยุด LIVE แล้วจะหายในการรีเฟรชครั้งถัดไป หากเครื่องดับหรือเน็ตขาดจะหมดอายุใน 90 วินาทีและหายเมื่อหน้าจอรีเฟรช (รวมสูงสุดประมาณ 120 วินาที) หาก API ใช้ไม่ได้จะซ่อนแถบและลองใหม่โดยหน่วงเวลา ไม่กระทบ LIVE หรือ Actions

## Deploy บน Windows Server

ต้องใช้ Node.js 24 และ DATABASE_URL/DIRECT_URL ของระบบเดิมใน server/.env รอบนี้มี migration และ runtime grants ใหม่ ต้องรันก่อน restart ไม่ต้องเพิ่ม Euler key หรือค่า environment ใหม่

```powershell
Set-Location C:\JudyTikServer

git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull ไม่สำเร็จ' }

npm --prefix server ci
if ($LASTEXITCODE -ne 0) { throw 'ติดตั้ง dependencies ไม่สำเร็จ' }

npm --prefix server run prisma:generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate ไม่ผ่าน' }

npm --prefix server run db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migration ไม่ผ่าน' }

npm --prefix server run db:grants
if ($LASTEXITCODE -ne 0) { throw 'อัปเดตสิทธิ์ฐานข้อมูลไม่ผ่าน' }

npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน' }

pm2 restart judytik-backend --update-env
if ($LASTEXITCODE -ne 0) { throw 'Restart ไม่สำเร็จ' }

pm2 status
Invoke-RestMethod http://127.0.0.1:4300/v1/health
```

ถ้า pull ติดการแก้ server/package-lock.json ในเครื่อง ให้ตรวจ git diff แล้วเก็บการแก้นั้นด้วย git stash push -m "server lockfile backup before deploy" -- server/package-lock.json จากนั้นเริ่มคำสั่งด้านบนใหม่ เก็บ stash ไว้เป็นสำรอง ไม่ต้องนำ lockfile เก่ากลับมาทับเวอร์ชันใหม่
