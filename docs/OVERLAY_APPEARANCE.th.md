# การตั้งสี Overlay แบบกำหนดเอง

ใช้ endpoint เดิม `GET /v1/me/overlays` และ `PUT /v1/me/overlays` พร้อม Bearer token ของผู้ใช้ และ `If-Match` ตาม revision เดิมตอนบันทึก

โปรแกรมที่รองรับต้องเพิ่ม `custom-appearance` ในรายการ header `x-judytik-overlay-features` เดิม

แต่ละ widget สามารถมีฟิลด์ `appearance` เพิ่มได้ เช่น

```json
{
  "appearance": {
    "text": "#FFFFFF",
    "title": "#F58CBC",
    "detail": "#DDDDDD",
    "value": "#99E2C0",
    "rank": "#FFD166",
    "border": "#F58CBC",
    "outline": "#16121F",
    "outlineSize": 2
  }
}
```

ทุกสีต้องเป็น HEX 6 หลัก และ `outlineSize` เป็นจำนวนเต็ม 0–6 พิกเซล แต่ละช่องเป็น optional: ช่องที่ไม่ได้กำหนดยังคำนวณสีตามพื้นหลัง รวมถึงกรณีเปิด/ปิดพื้นหลังโปร่งใส ส่วนสีที่ผู้ใช้ระบุเองจะคงเดิม

- มี `appearance` แม้เป็น `{}`: แสดงสถานะ **กำหนดเอง / Custom** โดยคงลายตกแต่งของธีมฐานไว้
- เลือกธีมใหม่: ส่ง widget โดยไม่มี `appearance` เพื่อล้างสีที่กำหนดเอง
- โปรแกรมเก่าที่ไม่ส่ง capability นี้จะไม่เห็นฟิลด์ใหม่ และการบันทึกจากรุ่นเก่าจะเก็บสีเดิมไว้
- ข้อจำกัด FREE/PRO ยังบังคับเหมือนเดิม
- WIN และ WIN Spin ใช้ฟิลด์สีเดิม โดยเก็บชื่อธีมเป็น `custom:<ชื่อธีมฐาน>` เมื่อปรับเอง ไม่เพิ่มฟิลด์ในข้อมูล WIN

ต้อง deploy Backend รุ่นที่รองรับก่อนใช้ฟีเจอร์ใหม่ ไม่ต้องเพิ่ม migration หรือ grants เพราะเก็บในเอกสารตั้งค่า JSON เดิม
