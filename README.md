# OCR Pro — Chrome Extension

Chrome Extension สำหรับ OCR ข้อความจากรูปภาพ/หน้าเว็บ พร้อม AI แก้ไขข้อความ

## วิธีติดตั้ง (Developer Mode)

1. เปิด Chrome แล้วไปที่ `chrome://extensions`
2. เปิด **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** → เลือกโฟลเดอร์ `OCR/` นี้
4. Extension จะปรากฏพร้อมใช้งาน

### สร้าง Icon จริง (ครั้งแรก)
เปิดไฟล์ `generate-icons.html` ใน Chrome → มันจะดาวน์โหลด icon 3 ไฟล์ → ย้ายไปโฟลเดอร์ `icons/` → ลบ `generate-icons.html`

## วิธีใช้งาน

### OCR แบบต่างๆ
| วิธี | ทำยังไง |
|------|---------|
| **ลากเลือกพื้นที่** | กด `Ctrl+Shift+U` (Mac: `Cmd+Shift+U`) → ลากกรอบ → ปล่อย |
| **OCR ทั้งหน้า** | กด `Ctrl+Shift+Y` หรือกดปุ่ม "Full Page" ใน popup |
| **คลิกขวารูปภาพ** | คลิกขวาที่รูปใดก็ได้ → "OCR this image" |
| **อัพโหลดไฟล์** | เปิด popup → ลากไฟล์รูปมาวาง หรือกด browse |
| **วาง URL** | เปิด popup → วาง URL รูปภาพ → กด OCR |

### ดูผลลัพธ์
- **Floating Widget** — ขึ้นมาบนหน้าเว็บหลัง OCR เสร็จ (copy ได้เลย)
- **Side Panel** — คลิกขวาที่ icon extension → "Open side panel" เพื่อดูผลละเอียด

### AI แก้ข้อความ
1. ไปที่ **Options** (กดเกียร์ใน popup)
2. ตั้งค่า AI:
   - **API URL**: เช่น `https://api.openai.com/v1/chat/completions`
   - **API Key**: key ของคุณ
   - **Model**: เช่น `gpt-4o`, `claude-sonnet-4-6`
3. กด **Test Connection** ดูว่าเชื่อมต่อได้
4. หลัง OCR ไปที่ Side Panel → กดปุ่ม **AI Enhance**

### Export
- **Copy** — คัดลอกไปที่ clipboard
- **TXT** — ดาวน์โหลดเป็นไฟล์ .txt
- **MD** — ดาวน์โหลดเป็นไฟล์ .md

## โครงสร้างไฟล์

```
OCR/
├── manifest.json          ← ตั้งค่า extension
├── background/
│   └── service-worker.js  ← สมองหลัก: จัดการ OCR, AI, ข้อมูล
├── popup/                 ← หน้า popup (กดที่ icon)
├── sidepanel/             ← แถบข้าง (ดูผลลัพธ์/ประวัติ)
├── options/               ← หน้าตั้งค่า
├── content/               ← ทำงานบนหน้าเว็บ (ลากเลือก/widget)
├── lib/                   ← โมดูลหลัก
│   ├── messaging.js       ← ส่งข้อความระหว่างส่วนต่างๆ
│   ├── history-db.js      ← เก็บประวัติใน IndexedDB
│   ├── image-preprocessor.js ← ปรับภาพก่อน OCR
│   ├── ocr-engine.js      ← จัดการ Tesseract.js
│   ├── ai-processor.js    ← เรียก AI แก้ข้อความ
│   └── export-manager.js  ← ดาวน์โหลด TXT/MD
├── offscreen/
│   ├── offscreen.html     ← Offscreen document สำหรับรัน Tesseract.js
│   └── offscreen.js       ← OCR logic ทำงานใน offscreen context
├── vendor/
│   └── tesseract/         ← Tesseract.js v5 bundled (WASM + worker)
├── styles/
│   └── shared.css         ← สไตล์กลาง + dark/light theme
└── icons/                 ← ไอคอน extension
```

## เทคโนโลยี

- **Manifest V3** — มาตรฐาน Chrome Extension ล่าสุด
- **Tesseract.js v5** — OCR engine bundled ในตัว (ไม่โหลดจาก CDN)
- **Offscreen Document API** — รัน OCR ใน offscreen context (MV3 compatible)
- **Vanilla JS** — ไม่ใช้ framework, เบา, เร็ว
- **IndexedDB** — เก็บประวัติ OCR แบบ local
- **OpenAI-compatible API** — รองรับ ChatGPT, Claude, Gemini, Ollama ฯลฯ

## ภาษาที่รองรับ

รองรับ 100+ ภาษา ตัวเลือกหลัก:
English, Thai, Japanese, Chinese (Simplified/Traditional), Korean, French, German, Spanish, Russian, Arabic, Hindi

เปลี่ยนได้ใน popup หรือ Options

## หมายเหตุสำหรับ Developer

- **Tesseract.js** bundled ในตัวแล้ว (vendor/tesseract/) ไม่โหลดจาก CDN
- **Language data** (.traineddata) จะดาวน์โหลดจาก CDN ครั้งแรกที่ใช้ (~1-15MB ต่อภาษา) OCR ครั้งแรกจะช้าหน่อย
- **AI API** รองรับทุก endpoint ที่ใช้รูปแบบ OpenAI (ChatGPT, Claude via proxy, Ollama, LM Studio, vLLM)
- Content scripts ใช้ IIFE (ไม่ใช้ ES modules) เพราะ Manifest V3 ไม่รองรับ module ใน content scripts
- Service worker ใช้ ES modules (`"type": "module"` ใน manifest)
