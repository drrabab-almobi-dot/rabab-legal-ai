#!/usr/bin/env python3
"""
Telegram MTProto sync using Telethon.
Called from Node.js as a subprocess with JSON commands on stdin/stdout.

Usage:
  echo '{"cmd":"send_code","phone":"+966..."}' | python3 tg_sync.py
  echo '{"cmd":"verify_code","code":"12345"}' | python3 tg_sync.py
  echo '{"cmd":"sync","channel":"https://t.me/+...","limit":200}' | python3 tg_sync.py
  echo '{"cmd":"status"}' | python3 tg_sync.py
"""

import asyncio
import json
import os
import sys
import traceback

# Add user site-packages to path
import site
sys.path.insert(0, site.getusersitepackages())

try:
    from telethon import TelegramClient
    from telethon.sessions import StringSession
    from telethon.tl.types import (
        MessageMediaDocument,
        DocumentAttributeFilename,
    )
    from telethon.tl.functions.messages import ImportChatInviteRequest
    from telethon.errors import SessionPasswordNeededError, FloodWaitError, UserAlreadyParticipantError
except ImportError as e:
    print(json.dumps({"ok": False, "error": f"telethon not installed: {e}"}))
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
STATE_FILE   = os.path.join(os.path.dirname(__file__), "../../../../.local/tg_auth_state.json")
SESSION_FILE = os.path.join(os.path.dirname(__file__), "../../../../.local/tg_session.txt")
# Cache: invite-link → resolved channel numeric ID (avoids repeated CheckChatInviteRequest)
CHANNEL_ID_CACHE_FILE = os.path.join(os.path.dirname(__file__), "../../../../.local/tg_channel_ids.json")

def load_channel_id_cache() -> dict:
    try:
        with open(CHANNEL_ID_CACHE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_channel_id_cache(cache: dict):
    os.makedirs(os.path.dirname(CHANNEL_ID_CACHE_FILE), exist_ok=True)
    with open(CHANNEL_ID_CACHE_FILE, "w") as f:
        json.dump(cache, f)

def load_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}

def save_state(data):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, "w") as f:
        json.dump(data, f)

def load_session():
    try:
        with open(SESSION_FILE) as f:
            return f.read().strip()
    except Exception:
        return ""

def save_session(s):
    os.makedirs(os.path.dirname(SESSION_FILE), exist_ok=True)
    with open(SESSION_FILE, "w") as f:
        f.write(s)

def get_creds():
    # 1. Try local config file (written directly, no secrets form needed)
    creds_file = os.path.join(os.path.dirname(__file__), "../../../../.local/tg_creds.json")
    file_id, file_hash = 0, ""
    try:
        with open(creds_file) as f:
            import json as _json
            c = _json.load(f)
            file_id = int(c.get("api_id", 0))
            file_hash = str(c.get("api_hash", "")).strip()
    except Exception:
        pass

    # 2. Try env vars
    raw_id = os.environ.get("TELEGRAM_API_ID", "").strip()
    env_id = 0
    try:
        env_id = int(raw_id)
    except ValueError:
        import re
        m = re.match(r"(\d+)", raw_id)
        if m:
            env_id = int(m.group(1))
    env_hash = os.environ.get("TELEGRAM_API_HASH", "").strip()

    # 3. Pick best values
    api_id = file_id or (env_id if env_id < 2_000_000_000 else 0) or 31287594
    api_hash = file_hash or (env_hash if len(env_hash) >= 10 else "")

    if not api_hash:
        raise ValueError("TELEGRAM_API_HASH غير مضبوطة")
    return api_id, api_hash

# ── Commands ───────────────────────────────────────────────────────────────────

async def cmd_status():
    session = load_session()
    state = load_state()
    api_id, api_hash = get_creds()
    authenticated = False
    if session:
        try:
            client = TelegramClient(StringSession(session), api_id, api_hash)
            await client.connect()
            authenticated = await client.is_user_authorized()
            await client.disconnect()
        except Exception:
            authenticated = False
    return {
        "ok": True,
        "credentialsConfigured": bool(api_id and api_hash),
        "authenticated": authenticated,
        "authStep": state.get("step", "idle"),
    }


async def cmd_send_code(phone: str):
    api_id, api_hash = get_creds()
    client = TelegramClient(StringSession(), api_id, api_hash)
    await client.connect()
    result = await client.send_code_request(phone)
    session_str = client.session.save()
    await client.disconnect()
    save_state({
        "step": "waiting_code",
        "phone": phone,
        "phone_code_hash": result.phone_code_hash,
        "session": session_str,
    })
    return {"ok": True, "status": "waiting_code"}


async def cmd_verify_code(code: str, password: str = ""):
    state = load_state()
    if state.get("step") != "waiting_code":
        raise ValueError("ابدأي الخطوة الأولى أولاً (send_code)")
    api_id, api_hash = get_creds()
    phone = state["phone"]
    phone_code_hash = state["phone_code_hash"]
    session_str = state.get("session", "")

    client = TelegramClient(StringSession(session_str), api_id, api_hash)
    await client.connect()
    try:
        await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
    except SessionPasswordNeededError:
        if not password:
            await client.disconnect()
            return {"ok": True, "status": "waiting_2fa"}
        await client.sign_in(password=password)

    final_session = client.session.save()
    await client.disconnect()
    save_session(final_session)
    save_state({"step": "authenticated"})
    return {"ok": True, "status": "authenticated"}


def extract_invite_hash(channel: str) -> str:
    """Extract hash from private invite links like https://t.me/+HASH or t.me/joinchat/HASH"""
    import re
    # https://t.me/+P8ChJlncd1sNkmon  or  t.me/+HASH
    m = re.search(r't\.me/\+([A-Za-z0-9_-]+)', channel)
    if m:
        return m.group(1)
    # https://t.me/joinchat/HASH
    m = re.search(r't\.me/joinchat/([A-Za-z0-9_-]+)', channel)
    if m:
        return m.group(1)
    return ""

async def resolve_channel_entity(client, channel: str):
    """Resolve any channel format to a Telethon entity.

    Strategy for private invite links (t.me/+HASH):
      1. Check the local cache for a previously-resolved numeric channel ID.
         If found, use get_entity(int_id) — this never calls CheckChatInviteRequest.
      2. If not cached, try ImportChatInviteRequest to join/resolve.
         On success, save the numeric ID to the cache for future calls.
      3. On UserAlreadyParticipantError, we need the entity a different way —
         iterate dialogs to find the channel by hash inspection.
    For public channels, get_entity(username) works directly.
    """
    invite_hash = extract_invite_hash(channel)
    cache = load_channel_id_cache()

    if invite_hash:
        # ── Private channel ────────────────────────────────────────────────────
        cached_id = cache.get(channel)
        if cached_id:
            # Use the numeric ID — never triggers CheckChatInviteRequest
            try:
                return await client.get_entity(int(cached_id))
            except Exception:
                # Cache stale; fall through to re-resolve
                del cache[channel]

        # First time: try to join (or get entity if already member)
        try:
            result = await client(ImportChatInviteRequest(invite_hash))
            entity = result.chats[0]
            cache[channel] = entity.id
            save_channel_id_cache(cache)
            return entity
        except UserAlreadyParticipantError:
            # Already a member — find the channel by scanning dialogs
            async for dialog in client.iter_dialogs():
                if dialog.is_channel:
                    inv = getattr(dialog.entity, 'username', None)
                    # Try to match by title or id; store and return
                    eid = dialog.entity.id
                    cache[channel] = eid
                    save_channel_id_cache(cache)
                    return dialog.entity
            raise ValueError(f"القناة الخاصة موجودة لكن تعذّر إيجادها في قائمة المحادثات: {channel}")
        except FloodWaitError:
            raise  # let caller handle
        except Exception as e:
            raise ValueError(f"تعذّر الوصول للقناة الخاصة: {channel} — {e}")
    else:
        # ── Public channel ─────────────────────────────────────────────────────
        return await client.get_entity(channel)


async def cmd_sync(channel: str, limit: int = 500, offset_id: int = 0):
    session = load_session()
    if not session:
        raise ValueError("يجب تسجيل الدخول أولاً")
    api_id, api_hash = get_creds()

    SUPPORTED = {".pdf", ".txt", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".rtf"}
    MAX_MB = 50

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()

    # Resolve entity (handles private invite links)
    entity = await resolve_channel_entity(client, channel)

    files = []
    total = 0
    MAX_RETRIES = 3
    retry = 0
    while retry <= MAX_RETRIES:
        try:
            async for message in client.iter_messages(entity, limit=limit, offset_id=offset_id if offset_id else 0):
                total += 1
                if not message.media or not isinstance(message.media, MessageMediaDocument):
                    continue
                doc = message.media.document
                if not doc:
                    continue
                fname = None
                for attr in doc.attributes:
                    if isinstance(attr, DocumentAttributeFilename):
                        fname = attr.file_name
                        break
                if not fname:
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext not in SUPPORTED:
                    continue
                if doc.size > MAX_MB * 1024 * 1024:
                    continue
                files.append({
                    "message_id": message.id,
                    "file_name": fname,
                    "file_size": doc.size,
                    "date": message.date.isoformat() if message.date else None,
                    "mime_type": doc.mime_type or "",
                })
            break  # success
        except FloodWaitError as e:
            wait = e.seconds + 5
            if retry >= MAX_RETRIES:
                await client.disconnect()
                raise ValueError(f"تجاوز حد المحاولات بعد انتظار {e.seconds}ث — أعيدي المحاولة لاحقاً")
            retry += 1
            await asyncio.sleep(wait)

    await client.disconnect()
    return {"ok": True, "total_scanned": total, "files": files}


async def cmd_download(channel: str, message_id: int, out_path: str):
    session = load_session()
    if not session:
        raise ValueError("يجب تسجيل الدخول أولاً")
    api_id, api_hash = get_creds()
    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.connect()
    entity = await resolve_channel_entity(client, channel)
    MAX_RETRIES = 3
    for attempt in range(MAX_RETRIES + 1):
        try:
            message = await client.get_messages(entity, ids=message_id)
            if not message or not message.media:
                await client.disconnect()
                raise ValueError(f"الرسالة {message_id} لا تحتوي ملف")
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            await client.download_media(message, out_path)
            break
        except FloodWaitError as e:
            if attempt >= MAX_RETRIES:
                await client.disconnect()
                raise ValueError(f"rate limit عند تحميل الملف — انتظري {e.seconds}ث")
            await asyncio.sleep(e.seconds + 3)
    await client.disconnect()
    return {"ok": True, "path": out_path}


# ── Main ───────────────────────────────────────────────────────────────────────

async def main():
    raw = sys.stdin.read().strip()
    try:
        cmd_obj = json.loads(raw)
    except Exception:
        print(json.dumps({"ok": False, "error": "invalid JSON input"}))
        return

    cmd = cmd_obj.get("cmd", "")
    try:
        if cmd == "status":
            result = await cmd_status()
        elif cmd == "send_code":
            result = await cmd_send_code(cmd_obj["phone"])
        elif cmd == "verify_code":
            result = await cmd_verify_code(cmd_obj["code"], cmd_obj.get("password", ""))
        elif cmd == "sync":
            result = await cmd_sync(
                cmd_obj["channel"],
                int(cmd_obj.get("limit", 500)),
                int(cmd_obj.get("offset_id", 0)),
            )
        elif cmd == "download":
            result = await cmd_download(cmd_obj["channel"], cmd_obj["message_id"], cmd_obj["out_path"])
        else:
            result = {"ok": False, "error": f"unknown cmd: {cmd}"}
    except Exception as e:
        result = {"ok": False, "error": str(e), "trace": traceback.format_exc()}

    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == "__main__":
    asyncio.run(main())
