"""Fix Codex+DeepSeek: enable local routing and point config.toml to CC Switch proxy."""
import json
import os
import re
from pathlib import Path

PROXY_URL = "http://127.0.0.1:15721/v1"
PLACEHOLDER = "PROXY_MANAGED"
home = Path(os.environ["USERPROFILE"])
settings_path = home / ".cc-switch" / "settings.json"
config_path = home / ".codex" / "config.toml"
auth_path = home / ".codex" / "auth.json"
db_path = home / ".cc-switch" / "cc-switch.db"

settings = json.loads(settings_path.read_text(encoding="utf-8"))
settings["enableLocalProxy"] = True
settings_path.write_text(json.dumps(settings, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

import sqlite3

conn = sqlite3.connect(db_path)
conn.execute(
    "UPDATE proxy_config SET enabled = 1, proxy_enabled = 1, live_takeover_active = 1 WHERE app_type = 'codex'"
)
conn.commit()
conn.close()

text = config_path.read_text(encoding="utf-8")
text = re.sub(
    r"base_url\s*=\s*\"[^\"]*\"",
    f'base_url = "{PROXY_URL}"',
    text,
    count=1,
)
if "wire_api" not in text or "wire_api = \"responses\"" not in text:
    pass
else:
    text = re.sub(r"wire_api\s*=\s*\"[^\"]*\"", 'wire_api = "responses"', text)
config_path.write_text(text, encoding="utf-8")

auth_path.write_text(
    json.dumps({"OPENAI_API_KEY": PLACEHOLDER}, indent=2) + "\n",
    encoding="utf-8",
)

print("Fixed:")
print("  settings.json enableLocalProxy = true")
print("  proxy_config codex enabled = true")
print(f"  config.toml base_url = {PROXY_URL}")
print("  auth.json -> PROXY_MANAGED (key kept in CC Switch DB)")
print("Next: restart CC Switch app, then restart Codex desktop app.")
