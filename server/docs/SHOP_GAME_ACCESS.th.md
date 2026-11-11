# เปิดระบบสิทธิ์พรีเซตเกมจาก JudyShop

อัปเดต 11 พฤศจิกายน 2569

ซื้อเกมหนึ่งครั้งใช้ได้ทุกพรีเซตที่เผยแพร่ของเกมนั้น รวมพรีเซตที่เพิ่มภายหลัง โดยจับคู่ `licenses[].gameSlug` กับ `Game.slug` แบบตรงตัว ไม่ใช้ slug ของพรีเซต และไม่ใช้ FREE/PRO แทนสิทธิ์ซื้อเกม

## ตั้งค่าบน JudyTikServer

เพิ่มใน `C:\JudyTikServer\server\.env`:

```dotenv
JUDYSHOP_BASE_URL=https://judygamestudio.com
JUDYTIK_SHOP_SERVICE_KEY=<คีย์เดียวกับฝั่งร้าน>
```

เก็บคีย์เฉพาะ Server ไม่ต้องใส่ใน JudyTik Desktop, Git หรือส่งในแชท ต้องมีทั้งสองค่า หากยังไม่ได้ตั้ง ระบบยังเปิด API ส่วนอื่นได้ แต่ไม่อนุญาตดึง/นำเข้าพรีเซตเกมใหม่ หากตั้งบางค่าแต่ไม่ครบหรือ URL/key ผิดรูปแบบ จะไม่เริ่ม Server จนกว่าจะแก้ค่า

ไม่มี migration, grants หรือ dependencies ใหม่สำหรับระบบสิทธิ์เกมรอบนี้

```powershell
& {
    Set-Location C:\JudyTikServer
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { throw 'Pull ไม่สำเร็จ' }

    pm2 stop judytik-backend
    if ($LASTEXITCODE -ne 0) { throw 'หยุด Backend ไม่สำเร็จ' }

    npm --prefix server run build
    if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน ห้ามเริ่มด้วย build ที่ไม่ครบ' }

    pm2 restart judytik-backend --update-env
    if ($LASTEXITCODE -ne 0) { throw 'Restart ไม่สำเร็จ' }
    pm2 status
    Invoke-RestMethod http://127.0.0.1:4300/v1/health
}
```

หาก build ไม่ผ่านหลังหยุดบริการ ให้แก้ error และ build ให้ผ่านก่อน restart ไม่ต้องล้างฐานข้อมูลหรือ checkout ทับไฟล์ .env

## การทำงาน

- JudyTikServer อ่านอีเมลที่ยืนยันแล้วจากตารางบัญชีตาม session ไม่รับอีเมลที่ Desktop กรอกมาแทน
- เรียก `POST https://judygamestudio.com/api/integrations/judytik/licenses/lookup` ด้วย service key
- ตรวจ schemaVersion, อีเมลที่ตอบกลับ, สถานะ, วันเวลา และ slug ซ้ำ ข้อมูลผิดรูปแบบไม่ปลดล็อก
- อนุญาตเฉพาะ `active` และ `expiresAt: null` หรือวันหมดอายุในอนาคต ตรวจวันหมดอายุทุกครั้งแม้ผลมาจาก cache
- Cache ผลสำเร็จต่ออีเมลไม่เกิน 60 วินาที รวมคำขอซ้อนกัน จำกัด cache 1,000 อีเมลและ lookup ที่กำลังรอ 20 รายการ ขีดจำกัดเรียกร้าน 120 ครั้ง/นาทีเป็นต่อ process; ถ้าขยายหลาย backend instance ควรใช้ shared limiter/cache
- ใช้ timeout 10 วินาที จำกัด response 1 MiB และไม่ตาม HTTP redirect หากร้านตอบ 429 จะพักคำขอใหม่ตาม Retry-After ไม่มี retry ยิงวน
- ร้านล่ม, timeout, key ผิด หรือ response ผิดรูปแบบ ตอบตรวจสิทธิ์ไม่สำเร็จ ไม่แปลงเป็นไม่มีสิทธิ์ และไม่ใช้ cache หมดอายุอนุญาตเข้า
- การเปลี่ยนอีเมลหรือบัญชีจะอ่านเจ้าของจาก Server ใหม่ ไม่ใช้ snapshot ของบัญชีก่อน
- ล็อกการเปลี่ยน `Game.slug` หลังสร้าง: `409 GAME_SLUG_IMMUTABLE` เพื่อไม่ให้ mapping การซื้อหลุด ชื่อ รูป คำอธิบาย และพรีเซตยังแก้ได้ตาม revision เดิม

## API ของ JudyTikServer

`GET /v1/me/game-licenses` ใช้ `Authorization: Bearer <desktop-session>` ไม่มี request body หรือฟิลด์อีเมลผู้ซื้อจาก client

```json
{
  "state": "ready",
  "licenses": [{"gameSlug":"judy-run","status":"active","expiresAt":null}],
  "checkedAt": "2026-11-11T00:00:00.000Z"
}
```

ถ้าบัญชียังไม่มีอีเมลยืนยัน ตอบ `200` พร้อม `state: "email_required"` และ `licenses: []` ไม่เรียกร้าน ถ้าร้านขัดข้องตอบ `503 GAME_LICENSE_UNAVAILABLE` ไม่ใช่รายการว่าง ไม่มีการส่ง customerId, อีเมลร้าน หรือ service key ให้ Desktop

เส้นทางที่บังคับ session และสิทธิ์เกม:

- `GET /v1/games/:id/presets`
- `GET /v1/games/:id/presets/:presetId`
- `POST /v1/games/:id/presets/:presetId/import`

อ่าน payload และนำเข้าตรวจที่ service ด้วย ไม่ใช่ซ่อนปุ่มอย่างเดียว รายการเกม หมวด ข้อมูลเกม และรูปปกยังเป็นสาธารณะ ส่วน admin routes ใช้ admin key เดิมและไม่ถูกล็อกตามการซื้อ

| HTTP / code | ความหมาย |
| --- | --- |
| 401 `AUTH_UNAUTHORIZED` | ยังไม่มี desktop session ที่ใช้ได้ |
| 403 `GAME_LICENSE_EMAIL_REQUIRED` | ต้องยืนยันอีเมลก่อน |
| 403 `GAME_LICENSE_REQUIRED` | ไม่ได้ซื้อ หมดอายุ หรือถูกถอนสิทธิ์ |
| 503 `GAME_LICENSE_UNAVAILABLE` | ร้าน/การตั้งค่า/ผลตอบกลับยังไม่พร้อมตรวจสิทธิ์ |

ผลอ่านสิทธิ์และ payload ที่ป้องกันใช้ `Cache-Control: no-store` ผล lookup ภายใน Server อาจสะท้อนการซื้อหรือคืนเงินช้าสูงสุดประมาณ 60 วินาที

## ทดสอบหลัง deploy

1. ตรวจว่าบัญชีร้านและ JudyTik ใช้อีเมลยืนยันตรงกัน และสินค้า map ไปยัง Game.slug ที่ถูกต้อง
2. บัญชีไม่มีสิทธิ์ยังเห็นเกม แต่ปุ่มดูพรีเซตถูกล็อก และเรียก payload/import ตรง ๆ ได้ 403
3. ซื้อเกมแล้วกด “โหลดล่าสุด” ต้องดูและนำเข้าได้ทุกพรีเซตของเกมนั้นโดยไม่ปลดล็อกเกมอื่น
4. ทดสอบหมดอายุ คืนเงิน และบัญชีไม่มีอีเมลยืนยัน
5. ทดสอบร้านปิด/คีย์ทดสอบผิด ต้องขึ้นตรวจสิทธิ์ไม่สำเร็จ ไม่ใช่ “ยังไม่ได้ซื้อ”
6. Desktop รุ่นเก่ายังคงดู catalog ได้ แต่การขอ payload/import จะถูกตรวจเช่นกัน อาจแสดงข้อความผิดพลาดทั่วไป จึงควรแจก Desktop รุ่นใหม่หลัง deploy backend และทดสอบร้านจริงแล้ว

ทดสอบอัตโนมัติครอบคลุม HTTP + session + PostgreSQL จริง และร้านจำลอง รวมการนำเข้าไปยัง Actions จริงผ่าน IPC ส่วนการยืนยันสิทธิ์กับร้าน production แบบ authenticated ต้องตรวจหลังตั้งคีย์และ deploy backend แล้ว ไม่มีการอ่านหรือเปิดเผยคีย์ production ในการทดสอบนี้

ขอบเขต: ไม่ลบ/ล็อก Actions ที่เคยนำเข้า ไม่ยึดไฟล์ export เดิมกลับ และไม่เพิ่ม DRM หรือการล็อกสิทธิ์ FREE/PRO
