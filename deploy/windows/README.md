# Deploy JudyTik บน Windows Server + Cloudflare Tunnel

คู่มือนี้ใช้ Windows Server 2022/2025 x64, PowerShell 5.1 ขึ้นไป, Node.js **24**, PostgreSQL บน VPS เดียวกัน และโดเมน **judytik.judygamestudio.com** ใน Cloudflare ตัว Backend ไม่เปิด public port และไม่ต้องติดตั้ง Nginx/Caddy หรือ build Electron

ตัวอย่างตำแหน่ง:

- โค้ด: `C:\apps\JudyTikServer`
- ความลับ: `C:\ProgramData\JudyTik` (นอก repository)
- Service: `JudyTikBackend` รันเป็น LocalService
- Logs: `C:\ProgramData\JudyTik\logs`
- PostgreSQL ตัวอย่าง: `C:\Program Files\PostgreSQL\17\bin` ปรับตามรุ่นที่ติดตั้ง

## ถ้าใช้ PM2 อยู่แล้ว

ถ้าสร้างฐานข้อมูล ตั้ง `server/.env` และรัน dependencies/build/migrations/grants เรียบร้อยแล้ว ให้ใช้ PM2 ตามนี้ได้เลย ไม่ต้องรัน Initialize-Environment, deploy/start.mjs หรือติดตั้ง WinSW สำหรับ Backend นี้ ส่วนคู่มือถัดไปเป็นวิธีติดตั้งด้วย WinSW แยกต่างหาก

```cmd
cd C:\JudyTikServer
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs judytik-backend
```

ถ้า clone ไว้ตำแหน่งอื่นให้เปลี่ยน cd ตามจริง `cwd` ใน ecosystem อ้างอิงตำแหน่งไฟล์เองจึงไม่ต้องแก้ path ใน config หลังแก้ .env ใช้ `pm2 restart ecosystem.config.cjs --update-env` ดูขั้น PM2 แบบสั้นที่ root README

## 1. เตรียมเครื่องและโค้ด

ติดตั้ง Git, [Node.js 24](https://nodejs.org/en/download), [PostgreSQL สำหรับ Windows](https://www.postgresql.org/download/windows/) และ cloudflared ตามขั้น Tunnel ด้านล่าง ติดตั้ง Node.js แบบ machine-wide ที่ `C:\Program Files\nodejs` เพื่อให้ LocalService ใช้ได้ (ไม่ใช้ Node ที่อยู่เฉพาะใน profile ของผู้ดูแล)

เปิด **PowerShell as Administrator** ใช้บัญชีผู้ดูแลที่เข้าถึง GitHub repo ได้ หาก repo private ให้ใช้ credential manager/SSH deploy key ไม่ฝัง token ลง URL หรือไฟล์ใน repo

```powershell
New-Item -ItemType Directory -Force C:\apps | Out-Null
Set-Location C:\apps
git clone https://github.com/alongkon2103/JudyTikServer.git
if ($LASTEXITCODE -ne 0) { throw 'Clone failed' }
Set-Location C:\apps\JudyTikServer
node --version
```

ต้องได้ `v24.x` โฟลเดอร์ C:\apps และโค้ดต้องอยู่ภายใต้การควบคุมของผู้ดูแล ไม่ให้บัญชีทั่วไปแก้ไขหรือลบ ถ้ามี repo อยู่แล้วอย่า clone ทับ ดูขั้นอัปเดต ห้ามคัดเฉพาะ server: ต้องมี shared และ root package.json ด้วย

## 2. สร้างไฟล์ลับเพียงครั้งแรก

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Initialize-Environment.ps1
```

สร้าง `runtime.env`, `migrate.env` และ `.pg-bootstrap.sql` ใน `C:\ProgramData\JudyTik` โดยไม่พิมพ์ secret ลงหน้าจอ สร้างรหัสฐานข้อมูลสองชุด, Ed25519 signing key, encryption/browser/pepper keys และ admin key ให้อัตโนมัติ

ACL อนุญาต Administrator/SYSTEM เข้าถึงไฟล์ทั้งหมด ส่วน LocalService อ่านได้เฉพาะ runtime.env และเขียน logs ได้ ไม่ได้สิทธิ์อ่าน migrate.env หรือ SQL รหัสผ่านฐานข้อมูล โฟลเดอร์ปลายทางต้องยังไม่มีอยู่ script ปฏิเสธโฟลเดอร์เดิมแม้ว่างอยู่ เพื่อไม่รับ owner/ACL ที่บัญชีอื่นเตรียมไว้ หากเคยติดตั้งหรือเตรียมไม่สำเร็จให้ตรวจและเก็บไฟล์เดิมก่อน ไม่ลบหรือสร้างกุญแจใหม่ทับ ให้เก็บไฟล์เหล่านี้ข้ามการอัปเดตเสมอ

เปิดแก้ runtime.env ด้วย editor ที่รันเป็น Administrator:

```powershell
notepad.exe C:\ProgramData\JudyTik\runtime.env
```

เติม `DISCORD_CLIENT_ID` และ `DISCORD_CLIENT_SECRET`; Google/SMTP เว้นไว้ได้ ถ้าใช้ Euler signing ให้เติมทั้ง `EULER_API_KEY` และ `EULER_ACCOUNT_ID` ไม่ต้องใส่ key เพื่อใช้แค่ gift catalog

ค่าหลักสร้างให้แล้ว:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=4300
TRUST_PROXY=loopback
API_ORIGIN=https://judytik.judygamestudio.com
```

อย่าสร้าง `server/.env` บน VPS และอย่าใส่ DIRECT_URL ใน runtime.env ค่าจากไฟล์ที่เลือกเป็นค่าหลัก ตัว production starter ปฏิเสธ migration credentials

## 3. สร้าง PostgreSQL database/roles

ตัวอย่างใช้ PostgreSQL 17 ถ้าติดตั้งรุ่นอื่นให้เปลี่ยน `$PgBin`:

```powershell
$PgBin = 'C:\Program Files\PostgreSQL\17\bin'
& "$PgBin\psql.exe" -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -f C:\ProgramData\JudyTik\.pg-bootstrap.sql
if ($LASTEXITCODE -ne 0) { throw 'Database bootstrap failed; inspect before continuing' }
```

psql จะถามรหัส postgres ที่ตั้งตอนติดตั้ง สร้างเฉพาะ roles `judytik_migrator`/`judytik_runtime` และฐาน `judytik` ใช้รหัสที่ตรงกับ env ที่สร้างให้ **สำหรับครั้งแรกเท่านั้น** หากชื่อเหล่านี้มีอยู่แล้วให้หยุดตรวจ ห้าม reset ฐานเดิมหรือเปลี่ยนรหัสทับ

ให้ PostgreSQL รับจาก loopback และไม่มี inbound firewall rule เปิด 5432 สู่ Internet หากเป็น PostgreSQL ที่ใช้งานร่วมกับระบบอื่น อย่าเปลี่ยน listen_addresses/firewall ของระบบอื่นโดยไม่ตรวจผลกระทบ ค่าตัวอย่างทั้งหมดของ JudyTik ใช้ 127.0.0.1

## 4. ติดตั้ง dependencies และ build เฉพาะ Backend

```powershell
Set-Location C:\apps\JudyTikServer\server
npm ci --include=dev
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
Set-Location ..
node .\deploy\run-with-env.mjs C:\ProgramData\JudyTik\migrate.env node node_modules/prisma/build/index.js generate
if ($LASTEXITCODE -ne 0) { throw 'Prisma generate failed' }
Set-Location server
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Backend build failed' }
Set-Location ..
```

ใช้ include=dev เพราะการจัดเตรียม/อัปเดตนี้ใช้ Prisma CLI, TypeScript และเครื่องมือ admin ที่ติดตั้งจาก lockfile ไม่มี Electron dependencies

## 5. ใช้ migrations และให้สิทธิ์ runtime

สำรองก่อนขั้นนี้ถ้าเป็นฐานที่มีข้อมูลแล้ว คำสั่งไม่ reset ฐาน:

```powershell
node .\deploy\run-with-env.mjs C:\ProgramData\JudyTik\migrate.env node node_modules/prisma/build/index.js migrate deploy
if ($LASTEXITCODE -ne 0) { throw 'Migration failed' }
& "$PgBin\psql.exe" -h 127.0.0.1 -U postgres -d judytik -v ON_ERROR_STOP=1 -v runtime_role=judytik_runtime -f .\server\prisma\runtime-grants.sql
if ($LASTEXITCODE -ne 0) { throw 'Runtime grants failed' }
```

migration role เป็นเจ้าของ schema/tables แต่ runtime ไม่เป็น owner/superuser/BYPASSRLS ห้ามใช้ postgres เป็น DATABASE_URL ตัว production จะตรวจและหยุดด้วย DATABASE_ROLE_UNSAFE

หลัง bootstrap สำเร็จและ migrations/grants ผ่านแล้ว ลบไฟล์ SQL ที่มีรหัสผ่านซ้ำ เก็บ runtime.env และ migrate.env พร้อม backup ที่เข้ารหัส:

```powershell
Remove-Item C:\ProgramData\JudyTik\.pg-bootstrap.sql
```

ไม่ต้องรัน Initialize-Environment ซ้ำแม้ลบ SQL แล้ว script ตรวจ env เดิมและปฏิเสธอยู่

## 6. ทดลองเปิดก่อนติดตั้ง Service

```powershell
node .\deploy\start.mjs C:\ProgramData\JudyTik\runtime.env
```

เปิดอีก PowerShell แล้วตรวจ:

```powershell
Invoke-RestMethod http://127.0.0.1:4300/v1/health/ready
```

ต้องได้ `status: ok` แล้วกด Ctrl+C ในหน้ารันชั่วคราวก่อนติดตั้ง Service ถ้าพบ EADDRINUSE ให้ตรวจโปรเซสเดิม ไม่เปิด Backend สองตัวบนพอร์ตเดียวกัน

## 7. ติดตั้ง Windows Service

ใช้ [WinSW stable 2.12.0](https://github.com/winsw/winsw/releases/tag/v2.12.0) x64 จากผู้พัฒนาโดยตรง script ตรวจ SHA-256 ก่อนวาง exe ไม่มี binary ที่ดาวน์โหลดหรือ secrets อยู่ใน Git

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deploy\windows\Download-WinSW.ps1
if ($LASTEXITCODE -ne 0) { throw 'WinSW download/verification failed' }
icacls.exe C:\apps\JudyTikServer /grant '*S-1-5-19:(OI)(CI)(RX)'
if ($LASTEXITCODE -ne 0) { throw 'Service cannot read application files' }
.\deploy\windows\JudyTikService.exe install
if ($LASTEXITCODE -ne 0) { throw 'Service install failed' }
Start-Service JudyTikBackend
Get-Service JudyTikBackend
Invoke-RestMethod http://127.0.0.1:4300/v1/health/ready
```

JudyTikService.xml รันด้วย LocalService, เริ่มอัตโนมัติ, restart เมื่อ crash, รอ graceful stop 30 วินาที และหมุน logs สูงสุด 5 ไฟล์/ชุดที่ 10 MB ตรวจว่า PostgreSQL Service ตั้ง Automatic ด้วย (ชื่อขึ้นกับรุ่นที่ติดตั้ง) ไม่มี service dependency ชื่อ PostgreSQL ตายตัวเพราะแต่ละเครื่องใช้ชื่อไม่เหมือนกัน

## 8. ตั้ง Cloudflare Tunnel

ถ้ามี cloudflared service/Tunnel เดิมอยู่แล้ว ให้ **เพิ่ม route ใน Tunnel เดิม** ไม่ install service ซ้ำหรือทับ routes ของเว็บอื่น

1. ใน Cloudflare dashboard ไป **Networking → Tunnels** สร้างหรือเลือก Tunnel บน VPS นี้
2. เลือก Windows/x64 แล้วใช้คำสั่งติดตั้ง service จาก dashboard ที่มี token ของ Tunnel ตัวเอง ไม่เก็บ token ใน repo/ภาพหรือ logs ที่เผยแพร่
3. รอ Tunnel เป็น Healthy แล้วเพิ่ม **Published application route**:
   - Hostname: `judytik.judygamestudio.com`
   - Service URL: **`http://127.0.0.1:4300`**
   - ไม่เติม `/v1`, ไม่ใช้ `https://127.0.0.1:4300` เพราะ HTTPS จบที่ Cloudflare
4. ให้ Cloudflare สร้าง DNS ของ Tunnel สำหรับ hostname นี้ ถ้ามี A/CNAME ชื่อเดียวกันอยู่แล้วให้ตรวจว่าเป็นของบริการใดก่อนแก้ ห้ามชี้ A record ไป VPS เพิ่มสำหรับ Tunnel
5. VPS ต้องออกไป Cloudflare ได้ (Tunnel ใช้ 7844 TCP/UDP; HTTPS/DNS สำหรับบริการอื่น) ไม่ต้องเปิด inbound 80/443/4300/5432 เพราะเชื่อมผ่าน Tunnel

Cloudflare ส่ง X-Forwarded-For และ X-Forwarded-Proto; Backend เชื่อเฉพาะ proxy ที่ต่อจาก loopback และเลือก IP ใกล้สุดที่ไม่ได้เชื่อถือ ไม่อ่าน CF-Connecting-IP จากผู้เรียกโดยตรง ไม่เปิด trust proxy=true หรือเปิด Backend รับจาก public interface

เส้นทาง API และหน้า OAuth ต้องใช้งานจาก native Desktop/browser ได้ อย่าใส่ Cloudflare Access login หรือ interactive challenge ครอบ API นี้โดยไม่มีการรองรับใน Desktop และอย่าทำ Cache Everything สำหรับ hostname นี้ คง cache-control: no-store จาก Backend หากเปิด Managed Transform ที่ลบ visitor IP ให้ปิดสำหรับ API นี้ ตรวจ rate limit จากผู้ใช้สอง IP หลังขึ้นจริง

ตรวจ public readiness:

```powershell
Invoke-RestMethod https://judytik.judygamestudio.com/v1/health/ready
```

## 9. Discord และข้อมูลเริ่มต้น

เพิ่ม Redirect ใน Discord Developer Portal โดยเก็บ dev redirects เดิมได้:

```text
https://judytik.judygamestudio.com/v1/auth/oauth/discord/callback
```

ตรวจว่า runtime.env เติม Discord ทั้งสองค่าแล้วและ restart service หากมีการแก้:

```powershell
Restart-Service JudyTikBackend
node .\deploy\run-with-env.mjs C:\ProgramData\JudyTik\runtime.env node --import tsx scripts/sync-gifts.ts
if ($LASTEXITCODE -ne 0) { throw 'Gift sync failed' }
node .\deploy\run-with-env.mjs C:\ProgramData\JudyTik\runtime.env node scripts/import-judy-game-catalog.mjs --dry-run
node .\deploy\run-with-env.mjs C:\ProgramData\JudyTik\runtime.env node scripts/import-judy-game-catalog.mjs --apply
if ($LASTEXITCODE -ne 0) { throw 'Game catalog import failed' }
```

ต้อง sync ของขวัญก่อนลองนำเข้าพรีเซตเกม ข้อมูลเกมนำเข้าจาก snapshot ใน repo เท่านั้น ไม่ติดต่อ Tikkies ไฟล์นำเข้าเคารพ admin rate limit และหยุดหากเจอข้อมูลที่ไม่ตรงกัน ไม่ overwrite รายการอื่น บัญชี/พรีเซตส่วนตัวจากฐาน dev ไม่ได้ย้ายมาเอง

## 10. ให้โปรแกรม Desktop ทดลองกับ VPS

บนเครื่องพัฒนา Windows (โฟลเดอร์โปรแกรม JudyTik เดิม):

```powershell
$env:JUDYTIK_API_ORIGIN = 'https://judytik.judygamestudio.com'
npm run desktop
```

บน Mac ใช้ `JUDYTIK_API_ORIGIN=https://judytik.judygamestudio.com npm run desktop` ไม่มี /v1 ต่อท้าย และยังไม่ต้อง build Electron

ตรวจ Discord login/avatar → gifts → import เกม/แก้ Actions → ปิดเปิดโปรแกรมให้ข้อมูลตามบัญชีกลับมา → LIVE จริง → WIN/TTS/Soundpad/Overlay/ประวัติ → logout หาก API ตอบ 200 แต่เป็นหน้า HTML ของ Cloudflare จะล็อกอิน/โหลดข้อมูลไม่ได้ ต้องแก้ routing/Access/challenge ให้คืน API JSON จริง

## อัปเดตภายหลัง

สำรองฐานและ env ก่อนอัปเดต ดู backup ด้านล่าง เก็บ migration เก่าครบและไม่แก้ย้อนหลัง ขั้นตอนนี้มี downtime สั้น ๆ และไม่เปลี่ยน secrets:

```powershell
Set-Location C:\apps\JudyTikServer
Stop-Service JudyTikBackend
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Git update failed; inspect before continuing' }
```

ทำขั้น 4 และ 5 ใหม่ (ไม่ทำ bootstrap หรือ Initialize-Environment) แล้ว `Start-Service JudyTikBackend` และตรวจ local/public readiness ถ้าแก้ XML ให้ใช้ `JudyTikService.exe refresh` ตาม WinSW ก่อนเปิดใหม่ ถ้า migration ล้มเหลวให้หยุดตรวจ ไม่ใช้ reset/db push หากถอยโค้ดต้องตรวจ schema compatibility หรือ restore backup ที่ทดสอบแล้ว ไม่ย้อนไฟล์ migration หรือบังคับลด schema เอง

## Backup และการตรวจปัญหา

ตัวอย่าง backup ใช้ psql admin credentials แบบถามรหัส ไม่ใส่รหัสลงคำสั่ง:

```powershell
$Backup = 'D:\JudyTikBackups' # เปลี่ยนเป็นดิสก์/ตำแหน่งสำรองของเครื่อง
New-Item -ItemType Directory -Force $Backup | Out-Null
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
& "$PgBin\pg_dump.exe" -h 127.0.0.1 -U postgres -d judytik -Fc -f "$Backup\judytik-$Stamp.dump"
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
```

ป้องกัน ACL ของ backup ให้ Administrator/SYSTEM เท่านั้น เก็บสำเนา runtime.env/migrate.env ที่เข้ารหัสนอก VPS และทดสอบ restore ลงฐานแยกก่อนใช้จริง การ restore ต้องมี roles/ownership เดิมและ auth encryption/signing keys เดิม ข้อมูลในฐานอย่างเดียวไม่พอสำหรับกู้ระบบล็อกอิน

| อาการ | จุดตรวจ |
|---|---|
| Tunnel 502 | local readiness, Windows Service, service URL ใช้ HTTP:4300 |
| Service เปิดแล้วดับ | logs ใน ProgramData, Node machine-wide, ACL runtime.env, PostgreSQL พร้อม |
| DATABASE_ROLE_UNSAFE | runtime URL ใช้ role ผิดหรือมี ownership/BYPASSRLS |
| permission denied for table | รัน runtime-grants.sql หลัง migration และตรวจชื่อ role |
| API ใช้พร้อมกันแล้ว 429 | TRUST_PROXY=loopback, visitor headers ไม่ถูกลบ, ไม่เปิด public bypass |
| Discord redirect_uri / CSRF error | API_ORIGIN, exact Discord callback, hostname/HTTPS และ Cloudflare Access |
| Cloud account เดิมไม่เห็นข้อมูล | ฐานใหม่ต้องย้ายข้อมูลตามแผน ไม่ใช่ใช้ env dev key อย่างเดียว |

## หลักฐานและข้อจำกัด

Repository มี unit/HTTP tests, env generator tests และ PostgreSQL integration ซึ่งเปิดไฟล์ production ที่ build แล้วจริงด้วย restricted role GitHub Actions ตรวจ Windows/Linux install/build/unit และ syntax ของ PowerShell/XML โดยไม่ติดตั้ง service

การติดตั้ง WinSW Service, ACL ของ LocalService, Cloudflare Tunnel, Discord callback และการ reboot **ต้องตรวจบน Windows VPS ของผู้ใช้จริง** ไม่อ้างว่าผ่านจนกว่าจะรันที่ปลายทาง ไม่มีการเปิด Tunnel หรือแก้ฐานจริงโดยชุดทดสอบใน repo

แหล่งอ้างอิง: [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/), [Cloudflare headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/), [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/), [WinSW 2.12 XML](https://github.com/winsw/winsw/blob/v2.12.0/doc/xmlConfigFile.md), [Prisma 7 migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
