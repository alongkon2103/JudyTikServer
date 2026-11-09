# JudyTik Backend

Backend แยกสำหรับ JudyTik: NestJS / Node.js 24 / Prisma 7 / PostgreSQL ไม่รวม React หรือ Electron และไม่ต้องติดตั้ง dependencies ของโปรแกรม Desktop

## นำเข้าพรีเซตเกมพร้อมรูปปกผ่าน Admin API

รองรับดูรายการ/รายละเอียด แก้ JSON และ archive ผ่าน Admin CRUD เดิม พร้อมเพิ่ม `POST /admin/games/:id/presets/import`, `PUT /admin/games/:id/presets/:presetId/file` และ `PUT /admin/games/:id/cover` สำหรับเพิ่มชุดจากไฟล์ แทนไฟล์เดิมและเปลี่ยนรูป ใช้ If-Match ของรายการที่แก้ เก็บ ID และประวัติเดิมไว้ ต้องรัน db:grants ใหม่เพื่อให้สิทธิ์ UPDATE(data) รูปปก Public API ยังแสดงเฉพาะ published ไม่มีการล็อกสิทธิ์ซื้อเกม

`POST /v1/admin/games/import` รับ multipart form-data: `presetFile` ที่ export จาก JudyTik, `coverFile`, `slug`, `name` และค่าประกอบ เช่น `description` / `status` ใช้ Admin key เดิม สร้างเกม รูป พรีเซต เวอร์ชันและ audit ใน transaction เดียว ค่าเริ่มต้นเป็น draft ยังไม่ล็อกสิทธิ์ซื้อเกม

ดู [เอกสารภาษาไทยพร้อมคำสั่ง deploy](docs/ADMIN_GAME_PRESETS_API.th.md), [OpenAPI](server/openapi.json) และ [Postman Games](server/postman/JudyTik-Admin-Games.postman_collection.json) รุ่นนี้เพิ่ม Sharp และตาราง `game_covers`: ติดตั้ง dependencies, generate Prisma, migrate และ grants ก่อนเริ่ม Backend

## รันด้วย PM2

ตั้ง `server/.env`, ติดตั้ง dependencies, generate Prisma, ใช้ migrations/grants และ build Backend ให้เรียบร้อยก่อน จากโฟลเดอร์ root ของ repository:

```cmd
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs judytik-backend
```

ไฟล์นี้ใช้ Node ตัวเดียวกับที่เปิด PM2 (ต้องเป็น Node 24), รัน `server/dist/main.js` หนึ่ง process และโหลด `.env` จาก cwd `server` โดยไม่ใส่ค่าลับลง ecosystem

หลังแก้ `.env`:

```cmd
pm2 restart ecosystem.config.cjs --update-env
```

หลังอัปเดตโค้ด ให้หยุด process, build/migrate/grant ตามคู่มือ แล้วเปิดใหม่ ไม่ใช้ watch ใน production ถ้ามี npm start หรือ Windows Service รัน Backend นี้อยู่ ให้หยุดตัวเดิมก่อนใช้ PM2 เพื่อไม่ให้ชนพอร์ต 4300 ใช้ PM2 เป็นตัวดูแล Backend นี้เพียงตัวเดียว

`pm2 save` เก็บรายการ process; การเปิด PM2 อัตโนมัติเมื่อ Windows reboot ต้องตั้งแยกในเครื่องที่ใช้งาน ไฟล์นี้ไม่ติดตั้ง startup service ให้

**คู่มือหลัก: [Windows Server + Cloudflare Tunnel](deploy/windows/README.md)** สำหรับ `https://judytik.judygamestudio.com` และ PostgreSQL บน VPS เดียวกัน

```text
JudyTik Desktop → Cloudflare HTTPS → cloudflared บน Windows
                                       ↓ 127.0.0.1:4300
                                  JudyTik Backend
                                       ↓ 127.0.0.1:5432
                                    PostgreSQL
```

- `server/`: API, lockfile, Prisma migrations, contracts, tests และข้อมูลเริ่มต้นของเกม
- `shared/`: schema/types/validators ที่ Backend ใช้ เก็บไว้ระดับเดียวกับ server ห้ามคัดเฉพาะ server
- `deploy/`: เครื่องมือสร้าง env แยกสิทธิ์, ตัวรัน production และ Windows Service
- `.github/workflows/backend.yml`: ตรวจ install/typecheck/build/unit tests บน Windows/Linux ไม่มีขั้น deploy หรือ build Electron

ระบบบัญชี Discord, Actions presets, WIN, Soundpad, TTS, Overlay settings, ประวัติ LIVE และรายการของขวัญอยู่ใน API นี้ การเชื่อม LIVE/คิว Actions/การกดปุ่มและสื่อยังทำงานใน Desktop ตามเดิม ไม่รันเกมหรือส่งปุ่มจาก VPS

## แพตช์ LIVE signing และเวลา VPS

LIVE signing ตรวจอายุสิทธิ์เทียบกับ `Date` ของคำตอบ HTTPS จาก Euler และใช้ monotonic timer วัดเวลารับส่ง จึงไม่ใช้เวลา Windows ในการตรวจวันหมดอายุของสิทธิ์นี้ ยังคงจำกัดอายุที่ประกาศไว้ไม่เกิน 60 วินาที และปฏิเสธเวลาที่ผิดรูปแบบ คำตอบที่ระบุว่าเก่าจาก cache และสิทธิ์ที่หมดอายุระหว่างรับส่ง

แพตช์นี้ไม่ซิงก์นาฬิกา Windows ทั้งเครื่อง ไม่เปลี่ยน auth clock ของระบบอื่น ไม่เปลี่ยน schema/ค่าลับ/dependencies และไม่ต้อง build Electron อัปเดตบน VPS ผ่าน PowerShell:

```powershell
Set-Location C:\JudyTikServer
git pull
if ($LASTEXITCODE -ne 0) { throw 'git pull ไม่สำเร็จ' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'build Backend ไม่สำเร็จ' }
pm2 restart judytik-backend
```

## พัฒนาและทดสอบ

### อัปเดต Slider และธีม Overlay

Backend รองรับ Slider รูป/ข้อความสูงสุด 20 รายการ ทั้งรูปของขวัญ HTTPS และ image binding ของรูปที่อัปโหลดบน Desktop พร้อมความเร็ว ขนาด ระยะห่าง ทิศทางและสีข้อความ รวมถึงธีมเทศกาลของโหลของขวัญแล้ว รุ่นเดิมจะตอบ `INVALID_REQUEST` เมื่อ Desktop ส่ง `widgets.slider` มา ทำให้บันทึก Overlay ไม่สำเร็จ

ไม่ต้องเปลี่ยน `.env`, dependencies หรือรัน migration ข้อมูล Overlay เดิมจะได้รับค่าเริ่มต้นของ Slider ตอนอ่าน และการบันทึกจาก Desktop รุ่นเก่าที่ไม่ส่ง Slider จะเก็บ Slider เดิมไว้ รูปอัปโหลดจริงยังอยู่บน Desktop; Backend เก็บเฉพาะ binding ID และชื่อไฟล์

อัปเดตจาก root ของ repository บน Windows Server (แก้ path ให้ตรงกับเครื่องจริง):

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'git pull ไม่สำเร็จ' }
pm2 stop judytik-backend
if ($LASTEXITCODE -ne 0) { throw 'หยุด Backend ไม่สำเร็จ' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build ไม่สำเร็จ ยังไม่ควรเปิด Backend ด้วย build ที่ไม่ครบ' }
pm2 restart judytik-backend
if ($LASTEXITCODE -ne 0) { throw 'Restart Backend ไม่สำเร็จ' }
Invoke-RestMethod http://127.0.0.1:4300/v1/health
```

Desktop รุ่นใหม่ส่ง header `x-judytik-overlay-features: slider` เพื่อขอข้อมูลครบ ส่วนรุ่นเก่าจะได้รับรูปแบบเดิมโดยไม่ลบ Slider ที่เก็บไว้

จากนั้นปิด/เปิด Desktop รุ่นใหม่ กดโหลดล่าสุดแล้วบันทึก Slider อีกครั้ง ตรวจว่าปิด/เปิดหน้าตั้งค่าแล้วยังเห็นรายการเดิม ถ้าใช้ Windows Service แทน PM2 ให้หยุด/เริ่ม service เดิมของเครื่องแทนคำสั่ง PM2 ไม่เปิด Backend สองตัวพร้อมกัน

ใช้ Node.js 24 รันจาก server:

```sh
npm ci --include=dev
npm run prisma:generate
npm run typecheck
npm test
npm run build
```

Prisma CLI ต้องมี `DIRECT_URL` ใน environment หรือ `server/.env` แม้ขั้น generate จะยังไม่เชื่อมฐานข้อมูล ดูตัวอย่าง `server/.env.example`; ห้ามใส่ค่าจริงใน Git

จาก root ใช้ `npm run test:deploy` ตรวจเครื่องมือ env โดยไม่เชื่อมฐานข้อมูล จาก server ใช้ `npm run test:database` สำหรับ PostgreSQL cluster ชั่วคราว (ต้องติดตั้ง PostgreSQL binaries/ตั้ง PG_BIN) ชุดนี้ตรวจ migration ซ้ำ, restricted role, account isolation, import เกม และการเปิดไฟล์ production ที่ build แล้ว จึงต้อง build ก่อน

ชุดทดสอบ Desktop/รับ LIVE จริงอยู่ใน repository โปรแกรมเดิม ไม่คัด Electron เข้ามาเพื่อให้ Backend ติดตั้งได้แยกจริง

## Deployment contract

- Runtime ใช้ `judytik_runtime` ที่ไม่มี ownership/superuser/BYPASSRLS; migration ใช้ `judytik_migrator`
- `TRUST_PROXY=false` เป็นค่าเริ่มต้น; ชุด Tunnel ใช้ `loopback` และ Backend bind เฉพาะ `127.0.0.1`
- Runtime env ไม่มี DIRECT_URL; เก็บ migration credentials แยกและไม่ให้ LocalService อ่าน
- ตัวสร้าง env ไม่ทับไฟล์เดิม กุญแจและรหัสฐานข้อมูลต้องเก็บข้าม restart/update
- ตัวโปรแกรมใช้ `JUDYTIK_API_ORIGIN=https://judytik.judygamestudio.com` ไม่มี `/v1` ต่อท้าย
- Google/SMTP เป็นทางเลือก เว้นทั้งคู่ของแต่ละบริการได้; Discord ต้องเติมก่อนทดสอบล็อกอิน

API paths ใช้ `/v1`; ดู `server/openapi.json` และ [ข้อมูล API](server/README.md)

เมื่อเปลี่ยน API contracts หรือ shared validators ใน repository นี้ ต้องตรวจ compatibility กับ Desktop และ sync เวอร์ชันที่เข้าคู่กันก่อนออก release ไม่คัดไฟล์ env ข้าม repository


## Google / Discord shared accounts

See [server/ACCOUNT_LINKING.md](server/ACCOUNT_LINKING.md) for verified-email linking, preserving both accounts, and the required Windows deployment steps.

## Admin account list and entitlement API

เพิ่ม `GET /v1/admin/users` สำหรับหลังบ้าน: ค้นหาอีเมลบางส่วน กรอง FREE/PRO ปัจจุบัน และแบ่งหน้า ใช้ `Authorization: Bearer <ADMIN_API_KEY>` เดิม ไม่เพิ่มการล็อกสิทธิ์หรือสถานะออนไลน์

ดู [เอกสาร API ภาษาไทย](docs/ADMIN_ENTITLEMENTS_API.th.md) และ Postman รายการ 11 ใน `server/postman/` ไม่ต้อง migration หรือเพิ่ม environment variable สำหรับ endpoint รายชื่อบัญชี

## Connected LIVE directory

Desktop reports actual TikTok LIVE connections using session-scoped 30-second heartbeats and 90-second leases. The authenticated directory contains only public channel details, deduplicates channels, and excludes expired/revoked sessions and merged/disabled accounts. No extra TikTok/Euler requests or plan enforcement. Apply all Prisma migrations and runtime grants before restarting. See [Thai LIVE directory API](docs/LIVE_DIRECTORY_API.th.md).

## จำนวนอันดับ Top Likers

Desktop เลือก Top 5 / Top 10 ได้ผ่าน widgets["top-likers"].likerLimit (5 หรือ 10 เท่านั้น; ค่าที่ไม่ได้ระบุใช้ Top 10) โดยส่ง X-JudyTik-Overlay-Features: top-likers-limit ร่วมกับ capabilities เดิม API ซ่อน field นี้จากไคลเอนต์เก่า และเก็บค่าที่ตั้งไว้เมื่อไคลเอนต์เก่าบันทึกโดยไม่ได้ส่ง field นี้ รอบนี้ไม่ต้อง migration หรือ grants เพิ่ม ให้ pull, npm --prefix server run build และ pm2 restart judytik-backend --update-env ตามปกติ

## รายการคำบล็อก TTS แบบยาว

เอาขีดจำกัด 100 รายการและ 60 ตัวอักษรต่อวลีออก รองรับหลายภาษาและข้อความยาว โดยขนาดคำขอรวมยังใช้เพดาน 256 KiB ของ API เดิม และข้อความ template อีเวนต์ยังสูงสุด 500 ตัวอักษร ตัวตรวจคำภาษาอังกฤษใช้การค้นหาข้อความพร้อมขอบเขต Unicode เพื่อรองรับรายการใหญ่โดยไม่สร้าง regex ขนาดใหญ่ ต้องอัปเดตทั้ง Desktop และ backend; รอบนี้ไม่ต้อง migration/grants เพิ่ม
