---
name: MTProto Channel Sync
description: How the Telegram MTProto sync works — gramjs failed on Node.js 24, replaced with Python/Telethon subprocess
---

## Solution: Python/Telethon via subprocess

gramjs 2.26.22 throws int32 overflow errors on Node.js 24 during the initial MTProto handshake. Root cause: `TELEGRAM_API_ID` was set to the bot token value (`8953631780:...`), causing `parseInt()` to return 8,953,631,780 which exceeds int32.

**Fix applied:**
- Replaced gramjs with Python/Telethon (`telethon==1.44.0`)
- Python script: `artifacts/api-server/src/lib/tg_sync.py`
- Node.js calls it as subprocess via `execFile("python3", [SCRIPT], ...)`
- Credentials stored in `.local/tg_creds.json` as fallback (api_id: 31287594)
- Session stored in `.local/tg_session.txt`
- Auth state in `.local/tg_auth_state.json`

**Why:**
- Telethon handles BigInt natively and works reliably on Python 3.13
- Subprocess approach keeps Node.js/Python boundary clean
- `.local/tg_creds.json` bypasses Replit Secrets form issues

**How to apply:**
- If MTProto auth fails again, check `.local/tg_creds.json` has correct api_hash
- Run `echo '{"cmd":"status"}' | python3 artifacts/api-server/src/lib/tg_sync.py` to test
- Install: `pip3 install --user --break-system-packages telethon`
- TELEGRAM_API_ID fallback hardcoded as 31287594 in get_creds() in tg_sync.py
