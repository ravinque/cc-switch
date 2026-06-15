"""Check DeepSeek balance for Codex provider in CC Switch DB (no key printed)."""
import json
import os
import sqlite3
import urllib.request
from pathlib import Path

db = Path(os.environ["USERPROFILE"]) / ".cc-switch" / "cc-switch.db"
conn = sqlite3.connect(db)
row = conn.execute(
    "SELECT id, name, is_current, settings_config FROM providers "
    "WHERE app_type = 'codex' AND is_current = 1"
).fetchone()
conn.close()

if not row:
    print("No current Codex provider found")
    raise SystemExit(1)

pid, name, is_current, settings = row
print(f"Current Codex provider: {name} ({pid})")

cfg = json.loads(settings or "{}")
auth = cfg.get("auth") or {}
api_key = auth.get("OPENAI_API_KEY") or cfg.get("apiKey") or cfg.get("api_key") or ""
print(f"api_key present: {bool(api_key)} (len={len(api_key)})")

req = urllib.request.Request(
    "https://api.deepseek.com/user/balance",
    headers={"Authorization": f"Bearer {api_key}", "Accept": "application/json"},
)
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = json.loads(resp.read().decode())
        print("is_available:", body.get("is_available"))
        for info in body.get("balance_infos") or []:
            print(
                f"  {info.get('currency')}: total={info.get('total_balance')} "
                f"(granted={info.get('granted_balance')}, topped_up={info.get('topped_up_balance')})"
            )
except urllib.error.HTTPError as e:
    print(f"Balance API HTTP {e.code}: {e.read().decode()[:300]}")
