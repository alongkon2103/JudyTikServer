# อัปเดต TTS, จำนวนผู้ใช้ออนไลน์ และฟอนต์ WIN

Backend รองรับค่าตั้งค่า TTS `pitch` (0.5–2) และ `messageDelayMs` (0–10000) แบบ optional พร้อมเก็บค่าของโปรแกรมใหม่เมื่อโปรแกรมเก่าบันทึกค่า โปรแกรมใหม่ส่ง feature `voice-controls` ร่วมกับ `audience` ส่วนฟอนต์ WIN ใช้รหัส `custom:<UUID>` และ feature `custom-fonts` โดยไม่ส่งไฟล์หรือพาธฟอนต์ขึ้น Backend

ไฟล์ฟอนต์เก็บในเครื่องและแยกตามบัญชี รองรับ TTF/OTF/WOFF/WOFF2 สูงสุด 8 MB ต่อไฟล์ ถ้าใช้เครื่องอื่นต้องนำเข้าฟอนต์บนเครื่องนั้นด้วย

ตัวนับออนไลน์แยกจากรายชื่อช่อง LIVE นับบัญชีที่ลงชื่อเข้าใช้โปรแกรมและส่ง heartbeat ไม่ซ้ำกัน แม้เปิดหลายเครื่อง โปรแกรมรุ่นเก่าที่ยังไม่มี heartbeat จะยังไม่ถูกนับ อัปเดตทุก 60 วินาที และข้อมูลที่หลุดโดยไม่แจ้งปิดจะหมดอายุภายใน 150 วินาที API คืนเฉพาะจำนวนรวม:

- `POST /v1/me/app-presence` เริ่มสถานะ `{ "connectionId": "UUID" }`
- `PUT /v1/me/app-presence/:connectionId` ต่ออายุ `{ "sequence": 1 }` (เพิ่มขึ้นทุกครั้ง)
- `DELETE /v1/me/app-presence/:connectionId` จบสถานะ
- `GET /v1/app-presence/count` อ่าน `{ "count": 12, "serverTime": "…", "refreshAfterMs": 60000 }`

ทุก endpoint ต้องใช้ desktop session ที่ตรวจสอบแล้ว ไม่มีรายชื่อบัญชีหรือข้อมูลส่วนตัวในผลจำนวนรวม

## Deploy บน Windows Server

รอบนี้ต้องรัน migration และ grants เพิ่มสำหรับตารางสถานะออนไลน์ก่อนเปิด Backend ใหม่ ไม่มี API key ใหม่ ใช้ตัวแปรฐานข้อมูล owner/runtime เดิมที่ตั้งไว้บนเซิร์ฟเวอร์

```powershell
& {
    Set-Location C:\JudyTikServer
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'Pull ไม่สำเร็จ' }

    pm2 stop judytik-backend
    if ($LASTEXITCODE -ne 0) { throw 'หยุด Backend ไม่สำเร็จ' }

    npm --prefix server run prisma:generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma generate ไม่ผ่าน' }

    npm --prefix server run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration ไม่ผ่าน' }

    npm --prefix server run db:grants
    if ($LASTEXITCODE -ne 0) { throw 'Grants ไม่ผ่าน' }

    npm --prefix server run build
    if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน ให้ตรวจ error ก่อน restart' }

    pm2 restart judytik-backend --update-env
    if ($LASTEXITCODE -ne 0) { throw 'Restart ไม่สำเร็จ' }

    $healthy = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
        try {
            Invoke-RestMethod http://127.0.0.1:4300/v1/health -TimeoutSec 3
            $healthy = $true
            break
        } catch { Start-Sleep -Seconds 2 }
    }
    pm2 status
    if (-not $healthy) {
        pm2 logs judytik-backend --lines 50 --nostream
        throw 'Health check ไม่ผ่าน'
    }
}
```

โปรแกรมรุ่นเดิมยังใช้ API ได้ การเลือกเสียง Windows, ประมวลผล pitch, เว้นช่วงอ่าน, แสดงจำนวนออนไลน์ และโหลดฟอนต์ต้องใช้ Desktop ที่มีการแก้ครั้งนี้ด้วย
