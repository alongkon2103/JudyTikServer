# ตัวเลือก Spin และอันดับ Overlay

รุ่นนี้เพิ่มการตั้งค่าแบบ optional ใน `GET/PUT /v1/me/overlays` โดยไม่เปลี่ยน schema ฐานข้อมูลหรือ grants:

| ฟิลด์ | ค่า |
| --- | --- |
| `spinGiftIds` | ของขวัญที่เรียก Spin วงเดียวกัน 1–100 ID ไม่ซ้ำ; ถ้าไม่ส่ง ใช้ `giftId` ตามเดิม |
| `spinSound` | เปิดเสียงสุ่ม; ค่าเริ่มต้น Spin ใหม่เป็น `true` |
| `spinVolume` | ความดัง 0–100; ค่าเริ่มต้น 80 |
| `rankLimit` | 5 หรือ 10 สำหรับ Leaderboard และอันดับในโหล |

Top Likers ใช้ `likerLimit` และ Big Gift ใช้ `bigGiftLimit` เหมือนเดิม โปรแกรมใหม่ให้เลือก Top 5/Top 10 และยังเก็บค่า Big Gift เดิมไว้จนกว่าผู้ใช้จะเปลี่ยน

โปรแกรมใหม่ส่ง `x-judytik-overlay-features` เพิ่ม `spin-multi-gifts,ranking-limit,spin-sound` ทั้งอ่านและบันทึก Backend ซ่อนฟิลด์ใหม่จากโปรแกรมเก่า และเก็บฟิลด์ใหม่เดิมไว้เมื่อโปรแกรมเก่าบันทึกค่า หากโปรแกรมใหม่เปลี่ยนกลับเป็นของขวัญทั้งหมด ให้ส่ง `giftId: "*"` และไม่ส่ง `spinGiftIds`

Deploy Backend ก่อนใช้งานโปรแกรมใหม่เพื่อให้บันทึกตัวเลือกเหล่านี้ได้ โปรแกรมเก่ายังใช้งาน API ได้ตามเดิม ใช้คำสั่ง pull/build/restart และรอ health check ตาม [คู่มือ deploy](RATE_LIMITS.th.md#deploy-รุ่นแก้-rate-limit) รอบนี้ไม่ต้องลง dependencies หรือรัน migration เพิ่ม

การนับ WIN ทีละหน่วย เสียงสุ่ม และรูปลักษณ์ป๊อปอัปเป็นการแก้ฝั่ง Desktop ต้องใช้โปรแกรมที่อัปเดตด้วย
