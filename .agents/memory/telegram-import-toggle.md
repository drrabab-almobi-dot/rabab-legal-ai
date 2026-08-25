---
name: Telegram Import Toggle
description: How Telegram sync is disabled/enabled at runtime without code changes; how Telegram docs are hidden from search.
---

## Toggle Mechanism
- DB: `platform_settings` table, key `telegram_import`, value `{"enabled": false}` (default = disabled)
- Admin route: `PUT /api/admin/telegram-import` (requireAdmin) → updates DB + busts 1-min cache
- Read function: `getTelegramImportEnabled()` in `routes/platform-settings.ts` — 1-min in-memory cache

## Startup Enforcement
- `index.ts` calls `restoreAutoSync()` (now async) which checks DB before starting any interval
- Log on disabled: `⏸ مزامنة تيليجرام معطّلة من لوحة الإدارة — لن تُستعاد الجدولة`
- If DB says disabled, the local `tg_auto_sync.json` file is also set to `enabled: false`

## Upload Guard (telegram-bot.ts)
- `handleDocumentUpload()` calls `isTelegramImportEnabled()` (inline DB check) at the start
- If disabled: sends Arabic message to Telegram admin and returns early — no file indexed
- All new Telegram-imported docs tagged with `sourceType: 'telegram'` via `createAndIndexDocument(..., { sourceType: 'telegram' })`

## RAG Filtering
- `retrieveRelevantChunks()` in `rag.ts` accepts `excludeTelegramDocs?: boolean` option
- When `true`: adds SQL WHERE clause `source_type != 'telegram'`
- `chat.ts` reads `getTelegramImportEnabled()` per request and passes `excludeTelegramDocs: !telegramEnabled`

## DB schema
- `knowledge_documents.source_type` (text, NOT NULL, default 'unknown')
- Values: `telegram`, `official`, `lawyer_upload`, `unknown`
- Migration: run via psql July 2026 (additive ALTER TABLE — no drizzle push needed)
- Existing docs tagged: lawyer_upload=42, unknown=19 (no telegram docs existed at migration time)

## Admin UI
- Page: `/admin/source-status` — shows per-source: status, doc count, quality %, last update
- Toggle only on telegram source; official + lawyer_upload are always-on
- Quality gate: if telegram quality < threshold (70%), the enable toggle is blocked
- Sidebar menu entry: "حالة المصادر" (above section-control)

## Approved Sources Policy
- Official: بوابة الأنظمة السعودية (هيئة الخبراء) — always enabled
- Lawyer uploads: always enabled
- Telegram: disabled by default, admin toggle, quality-gated

**Why:** Telegram content quality is uncertain; it must be reviewed/repaired before being served to users. Keeping the data in DB (not deleting) allows future repair and re-enabling.
