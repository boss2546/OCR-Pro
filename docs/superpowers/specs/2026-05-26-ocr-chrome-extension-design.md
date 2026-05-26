# OCR Chrome Extension — Design Spec

## Overview

Chrome Extension (Manifest V3) ที่ทำ OCR ข้อความจากรูปภาพ, PDF, สกรีนช็อต, หน้าเว็บ ด้วย Tesseract.js บน client-side ทั้งหมด พร้อม AI post-processing เพื่อแก้ไขข้อความที่ OCR ได้ไม่สมบูรณ์ให้ถูกต้องขึ้น

## Architecture

**Full Client-Side** — ไม่ต้องมี backend server

```
┌─────────────────────────────────────────────────┐
│                  Chrome Extension                │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │  Popup   │  │Side Panel │  │ Options Page  │  │
│  │(Quick    │  │(Results & │  │(Settings &   │  │
│  │ Actions) │  │ History)  │  │ AI Config)   │  │
│  └────┬─────┘  └─────┬─────┘  └──────┬───────┘  │
│       │              │               │           │
│  ┌────▼──────────────▼───────────────▼────────┐  │
│  │          Service Worker (Background)        │  │
│  │  • OCR Engine Manager (Tesseract.js)       │  │
│  │  • AI Post-processor (LLM API)             │  │
│  │  • History Manager (IndexedDB)             │  │
│  │  • Export Manager (TXT/MD)                 │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                          │
│  ┌────────────────────▼───────────────────────┐  │
│  │          Content Script                     │  │
│  │  • Area Selector (drag to select)          │  │
│  │  • Image Click Detector                    │  │
│  │  • Full Page Capture                       │  │
│  │  • Floating Result Widget                  │  │
│  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Components

| Component | Role |
|-----------|------|
| **Popup** | Quick actions: 1-click OCR, upload file, paste URL |
| **Side Panel** | Display OCR results, edit text, history, export |
| **Options Page** | Language settings, AI API config, keyboard shortcuts |
| **Service Worker** | Core logic: OCR engine, AI processing, data management |
| **Content Script** | On-page interactions: area selection, image detection, floating widget |

## Features

### 1. Capture Methods

| Method | Trigger | How it works |
|--------|---------|-------------|
| **Area Select** | Keyboard shortcut | User drags a rectangle over the page → captures that region → OCR |
| **Right-click Image** | Context menu | Right-click any image → "OCR this image" → OCR |
| **Upload File** | Popup drag-drop or file picker | Accepts image files (PNG, JPG, WEBP, BMP, TIFF) and PDF |
| **Paste Image URL** | Popup input field | Paste a URL → fetch image → OCR |
| **Full Page OCR** | Popup button | Captures visible viewport → OCR all text |

### 2. OCR Engine

- **Tesseract.js v5** running in a dedicated **Web Worker** (non-blocking UI)
- Supports 100+ languages via Tesseract language packs
- User selects preferred languages in settings (downloads language data on first use)
- Auto-detect language when not specified
- **Image preprocessing pipeline** before OCR:
  - Grayscale conversion
  - Contrast enhancement
  - Noise reduction
  - Threshold adjustment
- Confidence score displayed alongside results

### 3. AI Post-Processing

Purpose: fix garbled/inaccurate OCR output to produce clean, correct text.

**Configuration (Options Page):**
- API URL field (e.g., `https://api.openai.com/v1/chat/completions`)
- API Key field (stored securely in `chrome.storage.local`, masked in UI)
- Model name field (e.g., `gpt-4o`, `claude-sonnet-4-6`)
- **Test API button** — sends a simple test request, shows success/failure

**How it works:**
- After OCR, user clicks "AI Enhance" button in Side Panel
- Extension sends OCR text to the configured LLM API with a system prompt:
  "Fix OCR errors in this text. Correct misspellings, fix broken characters, restore proper formatting. Do not change the meaning. Return only the corrected text."
- Shows diff view (before/after) so user can see what changed
- User can accept or reject AI corrections
- Supports any OpenAI-compatible API (works with Claude, GPT, Gemini, local LLMs like Ollama)

### 4. User Interface

#### Popup (400x500px)
- Header with extension logo and name
- **OCR buttons row:**
  - "Select Area" (opens area selector on page)
  - "Full Page" (OCR entire viewport)
- **Upload zone:** drag-and-drop area + file picker button
- **URL input:** paste image URL + "OCR" button
- **Quick language selector** (dropdown with recent languages)
- **Last result preview** (truncated, click to open Side Panel)
- Footer with settings gear icon

#### Side Panel
- **Result area:** editable text field showing OCR output
- **Toolbar:**
  - "AI Enhance" button (sends to AI for correction)
  - "Copy" button (copies to clipboard)
  - "Download TXT" button
  - "Download MD" button
- **Diff view toggle:** show before/after AI corrections
- **History tab:** list of past OCR results
  - Search bar
  - Each entry shows: thumbnail, date, preview text, language
  - Click to load, swipe/button to delete
- **Confidence indicator:** shows OCR confidence percentage

#### Options Page
- **Language Settings:**
  - Multi-select language picker
  - Download/remove language packs
  - Set default language
- **AI Configuration:**
  - API URL input
  - API Key input (masked)
  - Model name input
  - System prompt (editable, with default)
  - "Test Connection" button with status indicator
- **Keyboard Shortcuts:**
  - Customize shortcut for area select (default: Ctrl+Shift+O)
  - Customize shortcut for full page OCR (default: Ctrl+Shift+F)
- **Appearance:**
  - Dark/Light/System theme toggle
- **Data Management:**
  - Export all history
  - Clear history
  - Clear language packs cache

#### Floating Widget (Content Script)
- Small overlay on the page after OCR completes
- Shows first ~100 chars of result
- "Copy" button, "Open in Side Panel" button
- Auto-dismiss after 10 seconds or click to dismiss
- Draggable position

### 5. Output & Export

| Format | Details |
|--------|---------|
| **Clipboard** | 1-click copy, with toast notification |
| **TXT file** | Plain text download |
| **MD file** | Markdown with preserved formatting (headings, lists, paragraphs detected by AI) |

### 6. History (IndexedDB)

Each OCR record stores:
- `id`: auto-increment
- `timestamp`: when OCR was performed
- `sourceType`: "area" | "image" | "upload" | "url" | "fullpage"
- `sourceUrl`: page URL or file name
- `thumbnail`: small preview image (base64, max 200px wide)
- `rawText`: original OCR output
- `enhancedText`: AI-corrected text (if applied)
- `language`: detected/selected language
- `confidence`: OCR confidence score

Operations: search (full-text on rawText/enhancedText), filter by date/source, delete individual/all.

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Manifest V3** | Chrome Extension standard |
| **Vanilla JS (ES modules)** | No framework — simple, fast, maintainable |
| **HTML + CSS** | UI with CSS custom properties for theming |
| **Tesseract.js v5** | Client-side OCR engine |
| **Web Worker** | Run OCR without blocking UI |
| **IndexedDB** | Local history storage |
| **chrome.storage.local** | Settings and API key storage |
| **chrome.sidePanel API** | Side panel UI |
| **chrome.contextMenus API** | Right-click menu |
| **chrome.commands API** | Keyboard shortcuts |

## File Structure

```
OCR/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
├── background/
│   └── service-worker.js
├── content/
│   ├── content.js
│   ├── content.css
│   ├── area-selector.js
│   └── floating-widget.js
├── lib/
│   ├── ocr-engine.js
│   ├── ai-processor.js
│   ├── history-db.js
│   ├── export-manager.js
│   ├── image-preprocessor.js
│   └── messaging.js
├── worker/
│   └── ocr-worker.js
├── styles/
│   └── shared.css
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-05-26-ocr-chrome-extension-design.md
```

## Permissions Required

```json
{
  "permissions": [
    "activeTab",
    "contextMenus",
    "storage",
    "sidePanel",
    "clipboardWrite"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

- `activeTab`: capture visible tab for OCR
- `contextMenus`: right-click "OCR this image"
- `storage`: save settings and API keys
- `sidePanel`: side panel UI
- `clipboardWrite`: copy results to clipboard
- `<all_urls>`: content script injection and fetching image URLs

## UX Design Principles

1. **1-click workflow** — most common action (area OCR) is one shortcut away
2. **Progressive disclosure** — popup for quick use, side panel for detailed work, options for power users
3. **Instant feedback** — loading spinner during OCR, progress percentage, confidence score
4. **Non-destructive AI** — always show diff, never overwrite original without user consent
5. **Offline-first OCR** — Tesseract.js works without internet; AI enhancement is optional
6. **Dark/Light theming** — respects system preference, manual override available
7. **Accessibility** — keyboard navigable, proper ARIA labels, high contrast support

## Constraints & Decisions

- **No framework** — Vanilla JS keeps the extension lightweight and fast to load
- **No backend server** — everything runs on client, user provides their own AI API key
- **Export TXT/MD only** — per user request, no PDF/DOCX complexity
- **OpenAI-compatible API format** — covers Claude (via proxy), GPT, Gemini, Ollama, LM Studio, etc.
- **IndexedDB for history** — no size limits like localStorage, supports structured queries
- **Web Worker for OCR** — prevents UI freezing during heavy OCR processing
- **Personal use first** — no auth, no accounts, no telemetry
