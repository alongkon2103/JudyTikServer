# JudyTik Admin API: นำเข้าพรีเซตเกมพร้อมรูปปก

อัปเดต 9 พฤศจิกายน 2569 — สำหรับหลังบ้าน Admin สร้างเกมจากไฟล์ที่ Export จากหน้า Actions ใน JudyTik รองรับรูปปก ชื่อเกม คำอธิบาย และ slug โดยยังไม่มีการล็อกสิทธิ์ซื้อเกมหรือ FREE/PRO

Base URL: `https://judytik.judygamestudio.com/v1` หรือ `http://127.0.0.1:4300/v1` สำหรับทดสอบในเครื่อง

## ขั้นตอนใช้งาน

1. Admin สร้างพรีเซต Actions ใน JudyTik แล้ว Export เป็นไฟล์ `.judytik.json`
2. ในหลังบ้าน เลือกไฟล์พรีเซตและรูปปก กรอกชื่อเกม คำอธิบาย และ slug
3. ส่ง `POST /admin/games/import` เป็น `multipart/form-data` ผ่าน Server หลังบ้าน พร้อม Admin API key
4. เก็บ `game.id`, `game.slug`, `preset.id` และ `revision` จากผลตอบกลับไว้ใช้งานต่อ
5. ถ้าต้องการให้ปรากฏในรายการเกมทันที ส่ง `status=published` ตอนนำเข้า ถ้าไม่ระบุจะเป็น `draft`

API นี้สร้าง **เกมใหม่** พร้อมพรีเซตหนึ่งชุดและรูปปกใน transaction เดียว ไม่เพิ่มวันใช้งาน ไม่ให้สิทธิ์ซื้อ และไม่แทนที่เกมเดิมเมื่อ slug ซ้ำ

ใช้ `game.id` เป็นรหัสอ้างอิงถาวรภายในระบบ และใช้ `slug` เป็นรหัสสินค้าภายนอกที่คุณกำหนดเอง เช่น `judy-run` เมื่อเริ่มเชื่อมคำสั่งซื้อแล้วควรรักษา slug เดิม ระบบปัจจุบันยังไม่บังคับความสัมพันธ์ระหว่าง slug กับการซื้อ

## การยืนยันตัวตน

```http
Authorization: Bearer <ADMIN_API_KEY>
```

ใช้ `ADMIN_API_KEY` เดิมของ JudyTikServer เก็บเฉพาะฝั่ง Server หลังบ้าน ห้ามส่ง key นี้ให้ผู้ใช้ทั่วไปหรือฝังในหน้า Browser ไม่ใช้ Google/Discord access token

ให้ HTTP client สร้าง `Content-Type` พร้อม boundary เอง อย่าตั้ง `Content-Type: application/json` หรือ `multipart/form-data` แบบไม่มี boundary

## POST `/admin/games/import`

| Field | ชนิดใน form-data | จำเป็น | รายละเอียด |
| --- | --- | --- | --- |
| `presetFile` | File | ใช่ | ไฟล์ Export จาก JudyTik ขนาดสูงสุด 1 MiB |
| `coverFile` | File | ใช่ | PNG / JPG / JPEG / WebP แบบภาพนิ่ง สูงสุด 2 MiB และ 16 ล้านพิกเซล |
| `name` | Text | ใช่ | ชื่อเกม 1–80 ตัวอักษร ตัดช่องว่างหัวท้าย |
| `slug` | Text | ใช่ | 1–80 ตัวอักษร ใช้ `a-z`, `0-9` และ `-` คั่นคำ เช่น `judy-run` ห้ามช่องว่าง/ภาษาไทย/ขีดซ้อน |
| `description` | Text | ไม่ | คำอธิบายเกม สูงสุด 16,000 ตัวอักษรและต้องไม่เกินขนาด UTF-8 ของ text field 16 KiB; ค่าเริ่มต้นว่าง |
| `platform` | Text | ไม่ | เช่น `pc` / `roblox` สูงสุด 80 ตัวอักษร ค่าเริ่มต้น `pc` |
| `categoryId` | Text | ไม่ | UUID ของหมวดที่ยัง active ถ้าไม่มีหมวดให้ละ field นี้ ไม่ส่งค่าว่างหรือข้อความ `null` |
| `status` | Text | ไม่ | `draft` หรือ `published` ค่าเริ่มต้น `draft` |
| `presetName` | Text | ไม่ | ชื่อชุดพรีเซต 1–80 ตัวอักษร ถ้าไม่ระบุใช้ชื่อจากไฟล์ |

แต่ละ field ส่งได้ครั้งเดียว ไม่รับ field อื่น ไม่รับหลายพรีเซตหรือหลายรูปในคำขอเดียว ชื่อไฟล์ไม่ถูกนำไปใช้เป็น path บน Server

ไฟล์พรีเซตต้องมี wrapper `format: "judytik-actions-preset"`, `version: 1`, `preset: {...}` ตามที่ JudyTik export จริง รองรับ UTF-8 และ UTF-8 BOM เนื้อหา preset ภายในสูงสุด 256 KiB, 100 Actions และต้องผ่านกฎตรวจสอบ Actions เดิม ระบบไม่รันคำสั่งในพรีเซตระหว่างนำเข้า

รูปจะถูกถอดรหัสและแปลงเป็น WebP ลบ metadata และย่อด้านยาวไม่เกิน 1,600 px โดยรักษาสัดส่วน ไฟล์ที่เก็บสูงสุด 1 MiB ไม่รับ SVG / GIF / รูปเคลื่อนไหว เก็บข้อมูลรูปใน PostgreSQL จึงไม่ต้องตั้งโฟลเดอร์ upload เพิ่ม

### ผลลัพธ์ `201 Created`

```json
{
  "game": {
    "id": "09315aa1-3038-4c3d-bec3-82aebcb02d26",
    "slug": "judy-run",
    "name": "Judy Run",
    "description": "พรีเซตสำหรับเล่น Judy Run",
    "categoryId": null,
    "platform": "pc",
    "coverUrl": "https://judytik.judygamestudio.com/v1/games/09315aa1-3038-4c3d-bec3-82aebcb02d26/cover",
    "url": null,
    "status": "published",
    "sortOrder": 0,
    "metadata": {},
    "revision": "1",
    "createdAt": "2026-11-09T03:00:00.000Z",
    "updatedAt": "2026-11-09T03:00:00.000Z"
  },
  "preset": {
    "id": "30a67041-0376-46d4-996a-10b03f3df985",
    "gameId": "09315aa1-3038-4c3d-bec3-82aebcb02d26",
    "slug": "default",
    "name": "Judy Run Actions",
    "description": "",
    "format": "action-preset-v1",
    "payload": {
      "schemaVersion": 1,
      "name": "Judy Run Actions",
      "actions": []
    },
    "isDefault": true,
    "status": "published",
    "version": 1,
    "revision": "1",
    "createdAt": "2026-11-09T03:00:00.000Z",
    "updatedAt": "2026-11-09T03:00:00.000Z"
  },
  "warnings": []
}
```

ตัวอย่างแสดงชุด Actions ว่างเพื่อให้เห็นโครงสร้าง ผลลัพธ์จริงเก็บ Actions จากไฟล์ครบ ไม่เปลี่ยน trigger, combo mode, ปุ่ม หรือค่าคำสั่ง และมี header `ETag: "1"` ของเกม พรีเซตมี revision แยกของตนเอง

เมื่อ `status=published` ทั้งเกมและพรีเซตจะ published พร้อม `isDefault=true` เมื่อ `status=draft` ทั้งคู่จะ draft พร้อม `isDefault=false` ทุกครั้งที่สร้างจะมีเวอร์ชันพรีเซตที่ 1 และ audit สองรายการใน transaction เดียว ถ้าขั้นตอนใดล้มเหลวจะไม่มีเกมหรือรูปค้าง

### ไฟล์เสียง/วิดีโอ

ไฟล์ Export ปัจจุบันเก็บค่าตั้งค่าและชื่ออ้างอิงสื่อ ไม่ได้บรรจุไฟล์เสียงหรือวิดีโอ เมื่อพบการอ้างอิงสื่อ API จะเก็บคำสั่งเดิมและส่งคำเตือนใน `warnings` ผู้ใช้ที่นำชุดนี้ไปใช้ต้องเลือกไฟล์สื่อบนเครื่องใหม่ ไม่ควรนำพรีเซตลักษณะนี้ไปขายโดยอ้างว่าแถมไฟล์สื่อครบ

## ตัวอย่างเรียกจาก Server หลังบ้าน (Node.js 24)

```js
import { readFile } from 'node:fs/promises';

const baseUrl = process.env.JUDYTIK_API_BASE_URL;
const apiKey = process.env.JUDYTIK_ADMIN_API_KEY;
if (!baseUrl || !apiKey) throw new Error('ตั้งค่า JudyTik API ก่อน');

const form = new FormData();
form.set('slug', 'judy-run');
form.set('name', 'Judy Run');
form.set('description', 'พรีเซตสำหรับเล่น Judy Run');
form.set('status', 'published');
form.set('presetFile', new Blob([await readFile('./JudyTik-Run.judytik.json')]), 'JudyTik-Run.judytik.json');
form.set('coverFile', new Blob([await readFile('./cover.png')], { type: 'image/png' }), 'cover.png');

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/admin/games/import`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: form,
  signal: AbortSignal.timeout(30000),
});
const result = await response.json();
if (!response.ok) throw new Error(`${response.status}: ${result.error?.code}`);
console.log(result.game.id, result.preset.id, result.warnings);
```

API นี้ไม่ใช้ `Idempotency-Key` แบบ API เพิ่มวัน ถ้าคำขอหมดเวลาหรือการเชื่อมต่อขาดหลังส่งแล้ว ให้ค้นชื่อเกมด้วย `/admin/games?q=...` แล้วตรวจ `slug` ในผลลัพธ์ก่อน retry (`q` ค้นชื่อ/คำอธิบาย ไม่ได้ค้น slug โดยตรง) การส่งซ้ำ slug เดิมจะได้ 409 และไม่ทับข้อมูลเดิม ตรวจสอบว่าข้อมูลที่พบตรงกับคำขอ ไม่ควรสร้าง slug ใหม่อัตโนมัติทุกครั้งที่ timeout

## การอ่านและแก้ไขหลังนำเข้า

| Method | Path | ใช้ทำอะไร |
| --- | --- | --- |
| GET | `/admin/games?q=Judy&page=1&pageSize=25&status=draft` | รายการ Admin ค้นชื่อ/คำอธิบาย แบ่งหน้า กรองสถานะ |
| GET | `/admin/games/{gameId}` | อ่านเกมรวม draft/archived |
| GET | `/admin/games/{gameId}/presets` | อ่านพรีเซตของเกม |
| GET | `/admin/games/{gameId}/presets/{presetId}/versions` | ประวัติเวอร์ชันพรีเซต |
| GET | `/admin/games/{gameId}/cover` | ดูรูปแบบ Admin แม้ยัง draft ต้องแนบ Admin key |
| GET | `/games/{gameId}/cover` | รูปสาธารณะ ต้องเป็นเกม published ในหมวด active หรือไม่มีหมวด |
| PUT | `/admin/games/{gameId}` | แทนที่ค่าตั้งค่าเกม ส่ง GameWrite และ `If-Match` revision ล่าสุด |
| PUT | `/admin/games/{gameId}/presets/{presetId}` | แทนที่พรีเซต ส่ง GamePresetWrite และ `If-Match` ของพรีเซต |
| DELETE | `/admin/games/{gameId}` | archive เกมด้วย `If-Match` ไม่ลบรูป/ประวัติ |

รายละเอียด JSON ของ CRUD ใช้ schema ใน [OpenAPI](../server/openapi.json) การอัปเดตด้วย PUT ต้องส่งค่าครบตามที่ต้องการเก็บ ไม่ใช่ PATCH และ revision เกมกับพรีเซตเป็นคนละค่า

หากนำเข้าเป็น draft แล้วจะเผยแพร่ภายหลัง ต้องอัปเดตพรีเซตเป็น `status=published,isDefault=true` และอัปเดตเกมเป็น `status=published` ด้วย การเปลี่ยนสถานะเกมอย่างเดียวไม่เปลี่ยนสถานะพรีเซตอัตโนมัติ

`coverUrl` เป็น URL สาธารณะที่ Server สร้างจาก `API_ORIGIN` ไม่อ่าน Host header ของคำขอ รูปเกม draft จะ 404 ที่ URL สาธารณะ หลังบ้านใช้ endpoint Admin ผ่าน fetch แล้วแสดงเป็น Blob URL เพื่อแนบ Authorization ได้

เดสก์ท็อปรุ่นที่อ่านรูปเฉพาะ `metadata.coverPath` ของเกมที่แถมมากับโปรแกรม ยังต้องอัปเดตตัวแสดงรูปให้รองรับ `coverUrl` ก่อนจึงจะเห็นรูปที่อัปโหลดใหม่นี้ งาน API นี้ยังไม่ได้ออกตัวติดตั้ง Desktop ใหม่

## ข้อผิดพลาด

ทุกข้อผิดพลาดอยู่ใน `{"error":{"code":"...","message":"...","requestId":"..."}}`

| HTTP | Code | ความหมาย |
| --- | --- | --- |
| 401 | `ADMIN_UNAUTHORIZED` | ไม่ส่ง Admin key หรือ key ไม่ตรง |
| 400 | `INVALID_REQUEST` | ข้อมูลเกม/slug ไม่ถูก ฟิลด์ซ้ำ/เกิน หรือ multipart ไม่ถูก |
| 400 | `PRESET_FILE_REQUIRED` | ไม่ได้ส่ง presetFile |
| 400 | `GAME_COVER_REQUIRED` | ไม่ได้ส่ง coverFile |
| 400 | `PRESET_FILE_INVALID` | ไม่ใช่ JudyTik export หรือ Actions ไม่ผ่าน validation |
| 400 | `PRESET_FILE_VERSION` | เวอร์ชันไฟล์ไม่รองรับ |
| 400 | `GAME_COVER_INVALID` | รูปเสีย ไม่ใช่ชนิดที่รองรับ เคลื่อนไหว หรือเกิน 16 ล้านพิกเซล |
| 400 | `GAME_CATEGORY_UNAVAILABLE` | ไม่มีหมวดนี้หรือหมวด archived |
| 404 | `GAME_NOT_FOUND` / `GAME_COVER_NOT_FOUND` | ไม่พบเกมที่มองเห็นได้/ไม่มีรูปอัปโหลด |
| 409 | `GAME_SLUG_OR_DEFAULT_CONFLICT` | slug ใช้แล้ว ไม่เขียนทับ |
| 413 | `PRESET_FILE_TOO_LARGE` | ไฟล์พรีเซตเกิน 1 MiB หรือเนื้อหาภายในเกิน 256 KiB |
| 413 | `GAME_COVER_TOO_LARGE` | รูปหลังแปลงยังใหญ่เกินกำหนด |
| 413 | `REQUEST_TOO_LARGE` | multipart parser ปฏิเสธไฟล์เกิน 2 MiB |
| 429 | `RATE_LIMITED` | เกิน rate limit ให้รอตาม Retry-After ไม่ยิงซ้ำถี่ |

ใช้ rate limit เดิมของ Server: Admin 30 คำขอต่อนาที/IP และ API รวม 120 คำขอต่อนาที/IP การเปิดรูปปกผ่าน API ก็นับเป็นคำขอ รูปตอบ `Cache-Control: no-store` เพื่อให้สถานะ archive มีผลทันที

## Postman

นำเข้า [JudyTik-Admin-Games.postman_collection.json](../server/postman/JudyTik-Admin-Games.postman_collection.json) กับ [Environment เดิม](../server/postman/JudyTik-Admin.postman_environment.json) ตั้ง `adminApiKey` แล้วเปิด request `01 - Import native preset and cover` เลือกไฟล์จริงใน Body > form-data ของ `presetFile` และ `coverFile` เปลี่ยน slug ก่อนส่ง

Collection ตั้งสถานะเริ่มต้นเป็น draft และเก็บ gameId/presetId/revision หลังส่งสำเร็จ มี request ดูเกม รายการพรีเซต และรูป Admin ให้ทดสอบต่อ ไม่มี API แก้สิทธิ์ซื้ออยู่ในชุดนี้

## Deploy บน Windows Server

มี dependency Sharp และ migration ตาราง `game_covers` ใหม่ ต้องติดตั้ง dependencies, migrate และ grants ก่อนเปิด Backend รุ่นนี้ ใช้ Node.js 24 ขึ้นไป ค่า `API_ORIGIN` ใน `server/.env` ต้องเป็น origin สาธารณะที่ถูกต้อง เช่น `https://judytik.judygamestudio.com` ไม่ต่อท้าย `/v1`

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
pm2 stop judytik-backend
if ($LASTEXITCODE -ne 0) { throw 'Stop failed' }
npm --prefix server ci --include=dev
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
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
Invoke-RestMethod http://127.0.0.1:4300/v1/health/ready
```

หากมี Reverse proxy ให้รองรับ request body อย่างน้อย 4 MiB (เกณฑ์รวมไฟล์สองชนิดและ multipart overhead) และอย่าแปลงเนื้อหา multipart สำรอง PostgreSQL ตามปกติเพื่อเก็บรูปปกพร้อมเกมด้วย
