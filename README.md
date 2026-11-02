# JudyTik Backend

Backend แยกสำหรับ JudyTik: NestJS / Node.js 24 / Prisma 7 / PostgreSQL ไม่รวม React หรือ Electron และไม่ต้องติดตั้ง dependencies ของโปรแกรม Desktop

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

## พัฒนาและทดสอบ

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
