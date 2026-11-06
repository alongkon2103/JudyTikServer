# Spin, ติดตามซ้ำ, สี Slider และข้อความในหน้าตั้งค่า

- คืน WIN Spin และ Spin Overlay ให้ใช้ layout เดิม ไม่ขยายช่องตามความสูงของ Source การ fit ของ WIN Counter และ Widget อื่นยังอยู่
- เพิ่มแถบเลื่อนโอกาสออกทั้งสอง Spin พร้อมเปอร์เซ็นต์, ปุ่มเท่ากันทุกช่อง และ 0 เพื่อปิดโอกาสช่องนั้น อย่างน้อยหนึ่งช่องต้องมีโอกาสออก
- WIN เก็บ `slotWeights` ตามลำดับช่อง ส่วน Overlay เก็บ `spinOptions[].weight` ตาม ID รายการ ค่าเก่าไม่มี weight ใช้ 10 ทุกช่องเท่ากัน เลือกผลบน desktop main ด้วย integer ticket / crypto random ไม่มีการสุ่มผลจากแอนิเมชัน
- ติดตามผ่านตัวกรองก่อนส่งไป Actions/WIN/TTS/Overlay/สถิติ โดยจำแนกตามบัญชีและ TikTok room ID เก็บเฉพาะ hash ของ viewer ID บนเครื่องเพื่อกันเลิกตามแล้วตามใหม่ รวม reconnect และเปิดแอปใหม่ในไลฟ์เดิม ไลฟ์ใหม่ room ID ใหม่ใช้ได้ตามปกติ ถ้ายังไม่ทราบ room ID จะรอ handshake ก่อนส่ง follow และใช้ fallback แยก connection แทนการปะปนกับไลฟ์อื่น
- แชร์ไอคอนเหตุการณ์จาก Actions ให้ WIN, Overlay dropdown และ Alert checkbox ครบหกเหตุการณ์
- Slider เพิ่ม `sliderItems[].textColor` เป็น hex 6 หลัก รายการที่ไม่มีสีหรือเป็น `null` ใช้สีรวม ปุ่มใช้สีรวมบันทึก `null` ชัดเจนเพื่อให้ reset ได้ สีตาม ID รายการ และการเปลี่ยนสีไม่ remount/restart แถบเลื่อน
- ลดข้อความเกริ่นใต้หัวข้อ, คำอธิบายซ้ำ, footer เชิงเทคนิค และคำอธิบายควบคุมที่เดาได้แล้ว คงข้อความ error, สถานะ, ข้อจำกัดไฟล์, ตัวแปร template, การแก้ข้อมูลที่ยังไม่บันทึก และคำเตือนการคืน/ลบข้อมูล

## ฝั่ง Server

ต้อง deploy server ก่อนบันทึกเรท/สีใหม่ ไม่มี migration หรือ environment variable ใหม่

- `GET/PUT /v1/me/win`: client ใหม่ส่ง `x-judytik-win-features: spin-weights` เพื่อรับ slotWeights
- `GET/PUT /v1/me/overlays`: client ใหม่ส่ง `x-judytik-overlay-features: slider,spin-weights,slider-item-colors`
- response รุ่นเก่าไม่ส่งฟิลด์ใหม่ที่ validator เก่าไม่รู้จัก การบันทึกทั่วไปจากรุ่นเก่าคงค่าเรทและสีไว้ หากรายการยังเป็น ID/ลำดับเดิม
- Slider ใช้ `textColor: null` เพื่อกลับไปใช้สีรวม การไม่ส่งฟิลด์จาก client เก่าจะรักษาสีเดิม

PowerShell บน Windows Server:

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull ไม่สำเร็จ' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน' }
pm2 restart judytik-backend --update-env
pm2 status
```

## ตรวจสอบ

- Desktop build ผ่าน และ 610 tests ผ่าน
- Server build/typecheck ผ่าน และ 143 tests ผ่าน
- `desktop:spin-chances:test`: ปรับเรท, บันทึก/เปิดใหม่, คืนค่าเท่ากัน, เปอร์เซ็นต์ และไอคอน dropdown
- `desktop:slider-colors:test`: สีแต่ละรายการ, fallback สีรวม, reset ผ่าน null, serialize และ animation object ไม่เปลี่ยนเมื่อแก้สี
- `follow-once.test.ts`: follow ซ้ำ, handshake, reconnect ไลฟ์เดิม, ไลฟ์ใหม่, ผู้ชมอื่น และ persistence หลังสร้าง ledger ใหม่

ยังไม่ได้ออก Desktop release ชุดนี้
