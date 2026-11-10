# Rate limits และเครือข่ายที่ใช้ IP ร่วมกัน

Backend ใช้สองชั้นเพื่อให้ผู้ใช้หลายบัญชีหลัง NAT เดียวกันใช้งานพร้อมกันได้:

| ขอบเขต | โควตาต่อนาที ต่อ process |
| --- | --- |
| ทุก request ใต้ `/v1` | 1,200 ต่อ IP รวมทั้ง public และ auth ที่ไม่ผ่าน |
| Route ที่ใช้ `SessionGuard` หลัง authenticate สำเร็จ | 120 ต่อ user ID ที่เซิร์ฟเวอร์ตรวจแล้ว รวมทุก route, device และ session ของบัญชีนั้น |
| `/v1/auth/desktop/attempts` | 10 ต่อ IP |
| `/v1/auth/token` | 30 ต่อ IP |
| `/v1/admin` | 30 ต่อ IP |

แต่ละชั้นยังนับร่วมกัน เช่น request ที่ถูกปฏิเสธโดย account quota ยังนับใน IP ceiling ด้วย การใช้ IP ร่วมกันจึงมี headroom มากขึ้น แต่ไม่ได้รับโควตาไม่จำกัด ผู้ใช้บัญชีเดียวกันเปิดหลาย session จะใช้ 120 ครั้งร่วมกัน โควตา account เริ่มช่วงเวลา 60 วินาทีเมื่อรับ request แรก ไม่คิดจากนาทีบนหน้าปัดนาฬิกา

`SessionGuard` เรียก `AuthService.authenticate` ก่อนใช้ user ID เป็น key เสมอ ไม่ใช้ JWT payload ที่ยังไม่ตรวจ, `x-user-id` หรือ header ที่ผู้เรียกกำหนดเอง Token ปลอม/หมดอายุยังถูกปฏิเสธและไม่สร้าง account bucket; IP ceiling ยังป้องกันการหมุน token ปลอมเพื่อเลี่ยงโควตา

เมื่อเกินโควตา HTTP 429 ยังคงใช้ error envelope `RATE_LIMITED` พร้อม `x-request-id` และ `Retry-After` (จำนวนวินาทีที่ควรรอก่อนลองใหม่) เพิ่ม `x-judytik-rate-limit-policy` เพื่อบอกชั้นที่ปฏิเสธ: `ip`, `account`, `auth` หรือ `admin` ค่า header ไม่เปิดเผย user ID, token หรือ IP ใน account policy ค่า `RateLimit` ของ IP middleware อาจยังปรากฏอยู่ ให้ใช้ policy header นี้ระบุสาเหตุ 429

Trust proxy ยังรับได้เฉพาะ `false` หรือ `loopback` ตาม configuration เดิม ต้องให้ local reverse proxy เขียน forwarded headers ใหม่อย่างถูกต้อง ไม่ตั้ง `trust proxy=true` เพื่อแก้ปัญหา NAT

## Deploy รุ่นแก้ rate limit

ไม่มี schema migration, grants ใหม่, environment variable ใหม่ หรือ dependency ใหม่จากการแก้ครั้งนี้ ใช้ Node 24 และ PM2 หนึ่ง process ตาม configuration เดิม ตรวจ commit ที่จะนำขึ้นให้เรียบร้อยก่อนรัน ตัวอย่างจาก backend repository บน Windows Server:

```powershell
& {
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
npm --prefix server run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm --prefix server test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
pm2 stop judytik-backend
if ($LASTEXITCODE -ne 0) { throw 'Stop failed' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; keep the process stopped until resolved' }
pm2 restart judytik-backend --update-env
if ($LASTEXITCODE -ne 0) { throw 'Restart failed' }
$healthy = $false
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    try {
        Invoke-RestMethod http://127.0.0.1:4300/v1/health -TimeoutSec 3
        $healthy = $true
        break
    } catch { Start-Sleep -Seconds 2 }
}
if (-not $healthy) { throw 'Health check failed; inspect pm2 logs judytik-backend' }
pm2 status
}
```

การ build เขียนทับ `dist` จึงหยุด process ก่อน build; ถ้า build ไม่ผ่าน ให้แก้หรือ rollback ไป commit ก่อนหน้าแล้ว build ใหม่ก่อน restart ทดสอบพฤติกรรม burst ด้วย isolated HTTP tests ใน `test/rate-limits-http.test.ts` ไม่ยิงคำขอจำนวนมากใส่ production

โควตาเก็บใน memory ของ process และเริ่มใหม่เมื่อ restart ถ้าจะเปิดหลาย PM2 workers/replicas ต้องเปลี่ยนทั้ง IP และ account limiter เป็น shared store เช่น Redis ก่อน โควตาปัจจุบันไม่รวมข้าม process และการเปลี่ยนนี้ยังไม่ได้เพิ่ม Redis
