# JudyTik Admin API สำหรับจัดการสิทธิ์และวันใช้งาน

อัปเดต 9 พฤศจิกายน 2569 สำหรับนำไปเชื่อมหลังบ้าน Admin หรือระบบคำสั่งซื้อ ใช้ API ที่มีอยู่แล้ว ไม่ต้องเพิ่ม endpoint ใหม่

ระบบนำเข้าเกมพร้อมไฟล์พรีเซต รูปปก และ slug ดู [Admin Game Presets API](ADMIN_GAME_PRESETS_API.th.md) เป็น multipart API แยกจาก API จัดการสิทธิ์ด้านล่าง และยังไม่ล็อกสิทธิ์ซื้อเกม

## เริ่มเชื่อมต่อ

Base URL:

```text
https://judytik.judygamestudio.com/v1
```

สำหรับรัน Backend ในเครื่องใช้ `http://127.0.0.1:4300/v1`

ทุก endpoint ในเอกสารนี้ต้องส่ง:

```http
Authorization: Bearer <ADMIN_API_KEY>
```

ใช้ค่า `ADMIN_API_KEY` ของ JudyTikServer ไม่ใช่ access token ของผู้ใช้ Google/Discord เก็บ key ใน environment ของ Server หลังบ้าน แล้วให้หน้า Admin เรียก Server ของตนเอง อย่าใส่ key ใน JavaScript ฝั่ง Browser หรือ environment ที่ขึ้นต้นด้วย `NEXT_PUBLIC_` / `VITE_`

คำขอ POST ต้องส่งเพิ่ม:

```http
Content-Type: application/json
Idempotency-Key: order:JUDYTIK-10001:grant:v1
```

## Endpoint ทั้งหมด

| Method | Path ต่อจาก Base URL | ใช้ทำอะไร |
| --- | --- | --- |
| GET | `/admin/users` | ดึงรายชื่อบัญชี ค้นหาอีเมล กรอง FREE/PRO และแบ่งหน้า |
| GET | `/admin/entitlements` | ค้นหาบัญชีและอ่านสิทธิ์ปัจจุบัน |
| POST | `/admin/entitlements/adjust` | เพิ่มหรือลดวัน PRO |
| POST | `/admin/entitlements/set-expiry` | ตั้งวันและเวลาหมดอายุโดยตรง |
| POST | `/admin/entitlements/revoke` | ถอนสิทธิ์ PRO ให้กลับเป็น FREE |
| GET | `/admin/entitlements/history` | อ่านประวัติการจัดการสิทธิ์ |

คำขอจัดการสิทธิ์และประวัติใต้ `/admin/entitlements` ต้องระบุ **อย่างใดอย่างหนึ่งเท่านั้น** ระหว่าง:

| ฟิลด์ | รูปแบบ | หมายเหตุ |
| --- | --- | --- |
| `userId` | UUID | แนะนำให้ใช้ ID ที่ได้จากการค้นหาบัญชี |
| `email` | อีเมล สูงสุด 254 ตัวอักษร | ต้องเป็นอีเมลที่ยืนยันแล้วและผูกอยู่กับบัญชี JudyTik |

API ไม่สร้างบัญชีหรือ Whitelist ล่วงหน้าให้ผู้ที่ยังไม่มีบัญชี ส่วนรายชื่อบัญชีและค้นหาอีเมลบางส่วนใช้ `/admin/users` ตามหัวข้อถัดไป

บัญชี Google/Discord ที่รวมกันแล้วจะถูกค้นไปยังบัญชีหลัก ให้ใช้ `userId` จากผล GET ล่าสุด ไม่อ้างอิงชื่อแสดงผลของ Google/Discord แทน ID

## รายชื่อทุกบัญชีสำหรับหน้า Admin

```http
GET /v1/admin/users?page=1&pageSize=25
Authorization: Bearer <ADMIN_API_KEY>
```

ไม่ต้องส่ง `Idempotency-Key` เพราะเป็นการอ่านข้อมูล ไม่มีการเปลี่ยนสิทธิ์

| Query | ค่าเริ่มต้น | เงื่อนไข |
| --- | --- | --- |
| `email` | ไม่กรอง | อีเมลบางส่วน สูงสุด 254 ตัวอักษร ไม่แยกพิมพ์เล็ก–ใหญ่ ตัดช่องว่างหัวท้าย; ค่าว่างหมายถึงไม่กรอง |
| `plan` | ทุกแพลน | `FREE` หรือ `PRO` เท่านั้น ถ้าต้องการทุกแพลนให้ไม่ส่งพารามิเตอร์นี้ ไม่ส่ง `ALL` หรือค่าว่าง |
| `page` | 1 | จำนวนเต็ม 1–1000000 |
| `pageSize` | 25 | จำนวนรายการต่อหน้า 1–100 |

ตัวอย่างค้นหาผู้ใช้ PRO ที่มี `creator` อยู่ในอีเมล:

```http
GET /v1/admin/users?email=creator&plan=PRO&page=1&pageSize=25
```

ตัวอย่างค้นหาอีเมลที่มี `+`:

```js
const query = new URLSearchParams({
  email: 'creator+live@example',
  plan: 'FREE',
  page: '1',
  pageSize: '25',
});
// GET https://judytik.judygamestudio.com/v1/admin/users?${query}
// ส่ง Authorization: Bearer <ADMIN_API_KEY> จาก Server หลังบ้าน
```

ตัวอย่าง Response `200 OK`:

```json
{
  "items": [
    {
      "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
      "displayName": "Creator",
      "avatarUrl": null,
      "email": "creator@example.com",
      "providers": ["google", "discord"],
      "createdAt": "2026-11-01T03:00:00.000Z",
      "disabledAt": null,
      "entitlement": {
        "plan": "PRO",
        "state": "active",
        "expiresAt": "2026-12-09T03:00:00.000Z",
        "serverTime": "2026-11-09T03:00:00.000Z"
      }
    }
  ],
  "page": 1,
  "pageSize": 25,
  "total": 1,
  "totalPages": 1,
  "serverTime": "2026-11-09T03:00:00.000Z"
}
```

- `total` เป็นจำนวนบัญชีทั้งหมดที่ตรงตัวกรอง ไม่ใช่จำนวนรายการในหน้านี้; `totalPages` คำนวณจากจำนวนที่กรองแล้ว
- ไม่มีผลลัพธ์: `items: []`, `total: 0`, `totalPages: 0` ถ้าเกินหน้าสุดท้ายคืน `items: []` แต่ยังคืน `total` จริง
- เรียงบัญชีใหม่ก่อนตาม `createdAt` แล้วใช้ `userId` เรียงมากไปน้อยเมื่อเวลาสร้างเท่ากัน
- ถ้าเพิ่มบัญชีใหม่ระหว่างเปิดหน้าต่าง ๆ ตำแหน่งแบบเลขหน้าอาจเลื่อนได้ ให้โหลดหน้าหนึ่งใหม่เพื่อรีเฟรช ไม่ใช้การแบ่งหน้านี้เป็นระบบส่งออก snapshot
- แสดงเฉพาะบัญชีหลักที่ยังไม่ถูกรวมเข้าบัญชีอื่น จึงไม่ซ้ำสำหรับ Google/Discord ที่รวมแล้ว; บัญชีที่ยังไม่ได้รวมถือเป็นคนละบัญชีตามข้อมูลจริง
- บัญชีที่ไม่มีอีเมลยืนยันมี `email: null` และยังปรากฏเมื่อไม่กรองอีเมล
- บัญชีที่ถูกปิดยังแสดงอยู่ โดยมี `disabledAt` เป็นเวลา ไม่ปะปนการปิดบัญชีกับแพลน FREE/PRO
- PRO หมายถึงมี grant ที่ไม่ถูกถอน เริ่มมีผลแล้ว และยังไม่หมดอายุ ณ `serverTime`; grant ที่ยังไม่เริ่ม ถูกถอน หรือหมดอายุไม่นับเป็น PRO
- FREE รวมบัญชีที่ไม่มี PRO ใช้งานอยู่และบัญชีที่หมดอายุแล้ว `entitlement.state` ช่วยแยก `free` กับ `expired`
- การค้นหาใช้ข้อความจริง `%` และ `_` ไม่ใช่ wildcard และค้นเฉพาะอีเมลที่ยืนยันแล้ว ไม่ค้นชื่อ Google/Discord
- GET นี้ใช้ Admin key และ quota Admin เดิม ส่งเฉพาะข้อมูลในตัวอย่าง ไม่มี token/session secret และยังไม่เพิ่มสถานะออนไลน์

หน้า Admin สามารถใช้ `items[].userId` เรียก API เพิ่ม–ลดวันในหัวข้อด้านล่างต่อได้ เมื่อเปลี่ยนคำค้นหรือแพลน ควรเริ่มที่ `page=1` ใหม่

## 1. ค้นหาบัญชีและอ่านสิทธิ์

```http
GET /v1/admin/entitlements?email=creator%40example.com
Authorization: Bearer <ADMIN_API_KEY>
```

หรือค้นด้วย ID:

```http
GET /v1/admin/entitlements?userId=93ced232-99b5-43a4-9f05-cb0296778e54
```

ตัวอย่าง Response `200 OK`:

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "entitlement": {
    "plan": "FREE",
    "state": "free",
    "expiresAt": null,
    "serverTime": "2026-11-09T03:00:00.000Z"
  }
}
```

ใช้ `URLSearchParams` สร้าง query โดยเฉพาะอีเมลที่มี `+` เช่น `creator+live@example.com` ต้องเข้ารหัส `+` เป็น `%2B` อย่าส่ง `{{email}}` หรือชื่อตัวแปรที่ยังไม่ได้แทนค่าไปเป็นอีเมลจริง

## 2. เพิ่มสิทธิ์ PRO หรือเพิ่มวัน

```http
POST /v1/admin/entitlements/adjust
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
Idempotency-Key: order:JUDYTIK-10001:grant:v1
```

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "days": 30,
  "source": "admin-panel",
  "reason": "ชำระคำสั่งซื้อ JUDYTIK-10001 แล้ว"
}
```

ส่ง `email` แทน `userId` ได้ แต่ห้ามส่งทั้งสองค่า

| ฟิลด์ | เงื่อนไข |
| --- | --- |
| `days` | JSON number จำนวนเต็ม ตั้งแต่ -36500 ถึง 36500 ห้ามเป็น 0 ห้ามเป็นข้อความ `"30"` |
| `source` | รหัสระบบ 1–80 ตัวอักษร ใช้เฉพาะ `A-Z a-z 0-9 . _ : -` เช่น `admin-panel` หรือ `judyshop` |
| `reason` | ข้อความเหตุผล 1–300 ตัวอักษร ใช้ภาษาไทยได้ ห้ามขึ้นบรรทัดใหม่หรือมี control characters |

กติกาการคำนวณ:

- บัญชี FREE หรือ PRO ที่หมดอายุแล้ว: เริ่มนับจากเวลาปัจจุบันของ Server และเปลี่ยนเป็น PRO
- บัญชี PRO ที่ยังไม่หมดอายุ: ต่อจากวันหมดอายุเดิม ไม่ทิ้งวันที่เหลือ
- 1 วัน = 24 ชั่วโมง ไม่ใช่การปัดไปเที่ยงคืน และ `days: 30` ไม่ใช่เดือนปฏิทิน
- วันหมดอายุที่คำนวณได้ต้องไม่เกินเวลาปัจจุบัน + 36500 วัน

ตัวอย่าง Response `200 OK` สำหรับบัญชี FREE ที่เพิ่ม 30 วัน ณ เวลาตัวอย่าง:

```json
{
  "replayed": false,
  "operation": {
    "id": "7355f358-28ba-43ae-acfe-1f7400bf24cf",
    "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
    "idempotencyKey": "order:JUDYTIK-10001:grant:v1",
    "operation": "adjust",
    "days": 30,
    "source": "admin-panel",
    "reason": "ชำระคำสั่งซื้อ JUDYTIK-10001 แล้ว",
    "before": {
      "plan": "FREE",
      "state": "free",
      "expiresAt": null,
      "serverTime": "2026-11-09T03:00:00.000Z"
    },
    "after": {
      "plan": "PRO",
      "state": "active",
      "expiresAt": "2026-12-09T03:00:00.000Z",
      "serverTime": "2026-11-09T03:00:00.000Z"
    },
    "requestId": "239b740f-e71d-456f-aa56-ce122a95cc13",
    "createdAt": "2026-11-09T03:00:00.000Z"
  },
  "entitlement": {
    "plan": "PRO",
    "state": "active",
    "expiresAt": "2026-12-09T03:00:00.000Z",
    "serverTime": "2026-11-09T03:00:00.000Z"
  }
}
```

**ไม่ต้องส่ง `plan: "PRO"`** การเพิ่มวันเป็นบวกจะให้ PRO ตามกติกาข้างต้นอยู่แล้ว ฟิลด์นอก schema จะถูกปฏิเสธ

## 3. ลดวัน

ใช้ endpoint `/admin/entitlements/adjust` เดิม แต่ส่ง `days` เป็นลบ และใช้ Idempotency-Key ของรายการลดวันใหม่:

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "days": -7,
  "source": "admin-panel",
  "reason": "ปรับลดสิทธิ์ตามรายการแก้ไข ADJ-10002"
}
```

ลดได้เฉพาะบัญชี PRO ที่ยังไม่หมดอายุ ถ้าลดมากกว่าวันที่เหลือ จะกำหนดหมดอายุที่เวลาปัจจุบันและได้ `plan: "FREE", state: "expired"` บัญชี FREE จะตอบ `409 ENTITLEMENT_NOT_ACTIVE`

## 4. ตั้งวันหมดอายุโดยตรง

```http
POST /v1/admin/entitlements/set-expiry
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
Idempotency-Key: admin:expiry:ADJ-10003
```

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "expiresAt": "2026-12-31T23:59:59+07:00",
  "source": "admin-panel",
  "reason": "กำหนดวันหมดอายุใหม่ตามข้อตกลง"
}
```

`expiresAt` ต้องเป็น ISO 8601 ที่ระบุ timezone เช่น `Z` หรือ `+07:00` ห้ามส่งเฉพาะวันที่ `2026-12-31` รับวันที่ตั้งแต่ปี 2000 และไม่เกินเวลาปัจจุบัน + 36500 วัน

ตั้งเป็นอนาคตจะได้ PRO; ตั้งเป็นอดีตหรือเวลาปัจจุบันจะได้ FREE/expired เป็นการแทนวันเดิม ไม่ใช่การบวกวันเพิ่ม Response ใช้โครงสร้างเดียวกับข้อ 2 แต่ `operation.operation` เป็น `set-expiry` และ `operation.days` เป็น `null`

## 5. ถอนสิทธิ์ให้กลับเป็น FREE

```http
POST /v1/admin/entitlements/revoke
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
Idempotency-Key: admin:revoke:ADJ-10004
```

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "source": "admin-panel",
  "reason": "ยกเลิกสิทธิ์ตามคำขอ"
}
```

ถอนไปยัง `plan: "FREE", state: "free", expiresAt: null` ยกเลิก PRO ทั้งที่ใช้งานอยู่และที่ตั้งเวลาไว้ ไม่ลบบัญชีหรือข้อมูลผู้ใช้ Response ใช้โครงสร้างเดียวกับข้อ 2 แต่ `operation.operation` เป็น `revoke` และ `operation.days` เป็น `null`

ทุกการแก้สิทธิ์จะเก็บ grant เดิมไว้เป็นประวัติการเพิกถอน แล้วสร้างผลลัพธ์ใหม่เมื่อจำเป็น ไม่ใช่การลบประวัติเก่าทิ้ง

## 6. ประวัติการเปลี่ยนสิทธิ์

```http
GET /v1/admin/entitlements/history?userId=93ced232-99b5-43a4-9f05-cb0296778e54&limit=25
Authorization: Bearer <ADMIN_API_KEY>
```

```json
{
  "userId": "93ced232-99b5-43a4-9f05-cb0296778e54",
  "items": [],
  "nextCursor": null
}
```

- `items` แต่ละรายการมีโครงสร้างเหมือน `operation` ในข้อ 2 เรียงใหม่ไปเก่า
- `limit` ค่าเริ่มต้น 25 รับได้ 1–100
- ถ้า `nextCursor` ไม่เป็น `null` ให้ส่งค่าใน `before` เช่น `...?userId=UUID&limit=25&before=NEXT_CURSOR` โดยใช้บัญชีเดิม
- ประวัติรวมรายการของบัญชีที่ถูกรวมเข้าบัญชีหลักด้วย `items[].userId` เก่าจึงอาจต่างจาก `userId` ด้านนอก
- ประวัตินี้เป็นรายการที่ทำผ่าน Admin API ไม่ได้สร้างรายการย้อนหลังให้การแก้ฐานข้อมูลด้วย SQL เดิม

## สถานะสิทธิ์

| `plan` | `state` | ความหมาย |
| --- | --- | --- |
| FREE | free | ไม่มี PRO ที่มีผลอยู่ เช่น บัญชีใหม่หรือเพิ่งถอนสิทธิ์ |
| FREE | expired | เคยมีวันหมดอายุและหมดอายุแล้ว |
| PRO | active | ยังใช้งานได้และเหลือมากกว่า 72 ชั่วโมง |
| PRO | expiring | ยังใช้งานได้ แต่เหลือไม่เกิน 72 ชั่วโมง |

`expiresAt` และ `serverTime` ในผลลัพธ์เป็นเวลา UTC (`Z`) หน้า Admin แสดงเป็นเวลาไทยได้ด้วย timezone `Asia/Bangkok` ใช้เวลาของ Server ตัดสินสิทธิ์ หมดอายุแล้ว GET จะคืน FREE โดยไม่ต้องรอ cron

## ป้องกันเพิ่มวันซ้ำด้วย Idempotency-Key

POST ทุกคำขอต้องมี key ยาว 8–128 ตัวอักษร ใช้เฉพาะ `A-Z a-z 0-9 . _ : -` key เป็นรหัสรายการทางธุรกิจและไม่ใช่ API Key

1. สร้าง key สำหรับรายการใหม่ แล้วบันทึก key กับ payload ไว้ในฐานข้อมูลหลังบ้านก่อนส่ง
2. ถ้าเครือข่ายขาดหรือคำตอบไม่กลับมา ให้ retry ด้วย **key เดิมและ payload เดิม** อย่าสร้าง key ใหม่ทุกครั้งที่ retry
3. คำขอเดิมจะได้ `replayed: true` ไม่เพิ่มวันซ้ำ และคืนผลของรายการเดิม
4. ถ้าใช้ key เดิมกับข้อมูล ผู้ใช้ หรือ endpoint คนละรายการ จะได้ `409 IDEMPOTENCY_KEY_CONFLICT` การเปลี่ยน `source` หรือ `reason` ก็ถือว่าเปลี่ยน payload
5. key ต้องไม่ชนกันทั้งระบบ ไม่ใช่แค่ภายในบัญชีเดียว เช่น `order:JUDYTIK-10001:grant:v1` สำหรับคำสั่งซื้อหนึ่งรายการ ส่วนการแก้ไขมือใช้ UUID ของรายการที่บันทึกไว้

ผล replay เป็น snapshot ณ เวลาทำรายการเดิม อาจไม่ตรงกับสิทธิ์ปัจจุบันถ้ามีการแก้ไขภายหลัง ให้ GET สิทธิ์ใหม่หลังทำรายการเพื่ออัปเดตหน้าจอ

## ตัวอย่างเรียกจาก Server หลังบ้านด้วย Node.js

```js
const baseUrl = 'https://judytik.judygamestudio.com/v1';

async function judyTikAdmin(path, { method = 'GET', body, key } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.JUDYTIK_ADMIN_API_KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error?.code ?? `HTTP_${response.status}`);
    error.status = response.status;
    error.requestId = result.error?.requestId;
    throw error;
  }
  return result;
}

// ทำงานเฉพาะใน Server ที่ตรวจสิทธิ์ Admin/สถานะชำระเงินแล้ว
const query = new URLSearchParams({ email: 'creator@example.com' });
const account = await judyTikAdmin(`/admin/entitlements?${query}`);
const result = await judyTikAdmin('/admin/entitlements/adjust', {
  method: 'POST',
  key: 'order:JUDYTIK-10001:grant:v1', // ใช้ key ที่บันทึกไว้กับคำสั่งซื้อนี้
  body: {
    userId: account.userId,
    days: 30,
    source: 'admin-panel',
    reason: 'ชำระคำสั่งซื้อ JUDYTIK-10001 แล้ว',
  },
});
console.log(result.replayed, result.operation.id);

// อ่านสถานะปัจจุบันอีกครั้ง รวมกรณี result.replayed === true
const current = await judyTikAdmin(
  '/admin/entitlements?' + new URLSearchParams({ userId: account.userId }),
);
console.log(current.entitlement);
```

ตั้ง `JUDYTIK_ADMIN_API_KEY` ใน Server หลังบ้านให้ตรงกับ `ADMIN_API_KEY` ของ JudyTikServer ตัวอย่างนี้ไม่ได้ retry อัตโนมัติ ถ้าจัดคิว retry ให้ใช้ key/payload ที่เก็บไว้กับรายการเดิม

## ข้อผิดพลาด

```json
{
  "error": {
    "code": "ENTITLEMENT_USER_NOT_FOUND",
    "message": "ENTITLEMENT_USER_NOT_FOUND",
    "requestId": "239b740f-e71d-456f-aa56-ce122a95cc13"
  }
}
```

| HTTP | `error.code` | การจัดการใน Admin |
| --- | --- | --- |
| 400 | INVALID_REQUEST | ตรวจชนิดข้อมูล ฟิลด์เกิน schema เลือก userId/email อย่างเดียว และรูปแบบ key/timestamp |
| 400 | ENTITLEMENT_EXPIRY_OUT_OF_RANGE | วันหมดอายุเกินขอบเขตที่รับได้ |
| 400 | INVALID_CURSOR | cursor ไม่ถูกต้องหรือไม่ได้เป็นของบัญชีนี้ |
| 401 | ADMIN_UNAUTHORIZED | ตรวจ Bearer key ฝั่ง Server ไม่ใช้ token ผู้ใช้หรือ placeholder ที่ยังไม่แทนค่า |
| 404 | ENTITLEMENT_USER_NOT_FOUND | ไม่พบบัญชี หรืออีเมลยังไม่ยืนยัน/ไม่ผูกกับบัญชี |
| 409 | ENTITLEMENT_USER_DISABLED | บัญชีถูกปิด แก้สิทธิ์ไม่ได้ แต่ยังอ่านสถานะ/ประวัติได้ |
| 409 | ENTITLEMENT_NOT_ACTIVE | กำลังลดวันของบัญชีที่ไม่มี PRO ใช้งานอยู่ |
| 409 | IDEMPOTENCY_KEY_CONFLICT | key ซ้ำแต่ข้อมูลไม่ตรง ตรวจรายการเดิมก่อนส่งใหม่ |
| 428 | IDEMPOTENCY_KEY_REQUIRED | POST ขาด header Idempotency-Key |
| 429 | RATE_LIMITED | พักตาม Retry-After เมื่อมี แล้วค่อยลองใหม่ด้วย key เดิม |

มี quota Admin 30 requests/minute/IP และ quota รวม API 120 requests/minute/IP แยกกัน Server หลังบ้านที่ใช้ IP เดียวกันจะแชร์ quota หลีกเลี่ยง polling ถี่หรือเรียกประวัติใหม่ทุกครั้งที่พิมพ์ค้นหา

## ลำดับหน้าจอ Admin ที่นำไปใช้ได้

1. ใช้ `/admin/users` โหลดรายการและกรองอีเมล/แพลน → เลือก `userId` → ใช้ GET `/admin/entitlements` อ่านสิทธิ์ล่าสุดของบัญชีที่เลือก
2. เลือกเพิ่มวัน ลดวัน ตั้งวันหมดอายุ หรือถอนสิทธิ์ พร้อมกรอกเหตุผล
3. สร้างและบันทึกรหัสรายการ → เรียก POST → เก็บ `operation.id` / `requestId`
4. โหลดสิทธิ์และประวัติใหม่เพื่อแสดงผล

API ชุดนี้จัดการข้อมูลสิทธิ์เท่านั้น ข้อจำกัดฟังก์ชัน FREE/PRO และการตัดงานที่กำลัง LIVE ระหว่างหมดอายุยังเป็นงานแยก Desktop อ่านสิทธิ์ใหม่เมื่อ refresh สถานะบัญชี จึงไม่ควรใช้เพียงป้าย FREE/PRO ที่ค้างบนหน้าจอตัดสินว่าการเพิ่มวันสำเร็จหรือไม่

## ไฟล์สำหรับทีมพัฒนา

- [Postman Collection](../server/postman/JudyTik-Admin-Entitlements.postman_collection.json)
- [Postman Environment](../server/postman/JudyTik-Admin.postman_environment.json) — กรอก `baseUrl`, `adminApiKey`, `email` หรือ `userId` ไม่มี key จริงรวมอยู่ในไฟล์
- [OpenAPI ของ Backend](../server/openapi.json) — มี schema และ endpoint Admin entitlements
- [Validation ของ request](../server/src/entitlements/contracts.ts)
- [กติกาการเพิ่มวันและการ retry](../server/src/entitlements/admin.service.ts)

Postman: ส่งรายการ 01 เพื่อค้นหาบัญชีและรับ `userId` จากนั้น 03 เพิ่มวัน, 04 retry รายการเพิ่มเดิมโดยไม่บวกซ้ำ, 05 ลดวัน, 06 ตั้งหมดอายุ, 07 ถอนสิทธิ์ และ 08–10 ตรวจประวัติ/สถานะตามชื่อรายการใน Collection

รายการ **11 - List all accounts** สำหรับ `/admin/users`: ตั้ง `usersPage`, `usersPageSize`; เปิด query `email` หรือ `plan` ในแท็บ Params เมื่อต้องการกรอง โดยตั้งค่าที่ `usersEmail` / `usersPlan` ตามลำดับ ค่าเริ่มต้นปิดตัวกรองไว้เพื่อดึงทุกบัญชี

## อัปเดต Server เพื่อใช้ API รายชื่อบัญชี

ดึงโค้ด JudyTikServer รุ่นที่มี `/admin/users` แล้ว build และ restart ใช้ `ADMIN_API_KEY` เดิม ไม่ต้อง migration หรือเพิ่ม environment variable สำหรับ endpoint นี้

```powershell
Set-Location C:\JudyTikServer
git pull --ff-only
if ($LASTEXITCODE -ne 0) { throw 'Pull ไม่สำเร็จ' }
npm --prefix server run build
if ($LASTEXITCODE -ne 0) { throw 'Build ไม่ผ่าน' }
pm2 restart judytik-backend --update-env
if ($LASTEXITCODE -ne 0) { throw 'Restart ไม่สำเร็จ' }
pm2 status
Invoke-RestMethod http://127.0.0.1:4300/v1/health
```
