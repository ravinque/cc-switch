"""Add DeepSeek Codex provider, enable routing, switch live config. Key via env or prompt."""
import getpass
import json
import os
import sqlite3
import time
from pathlib import Path

PROVIDER_ID = "deepseek-codex"
PROXY_URL = "http://127.0.0.1:15721/v1"
PLACEHOLDER = "PROXY_MANAGED"

CONFIG_TOML = """model_provider = "custom"
model = "deepseek-v4-flash"
model_reasoning_effort = "high"
disable_response_storage = true

[model_providers.custom]
name = "deepseek"
base_url = "https://api.deepseek.com"
wire_api = "responses"
requires_openai_auth = true
"""

MODEL_CATALOG = {
    "models": [
        {
            "model": "deepseek-v4-flash",
            "displayName": "DeepSeek V4 Flash",
            "contextWindow": 1000000,
        },
        {
            "model": "deepseek-v4-pro",
            "displayName": "DeepSeek V4 Pro",
            "contextWindow": 1000000,
        },
    ]
}

META = {
    "apiFormat": "openai_chat",
    "codexChatReasoning": {
        "supportsThinking": True,
        "supportsEffort": True,
        "thinkingParam": "thinking",
        "effortParam": "reasoning_effort",
        "effortValueMode": "deepseek",
        "outputFormat": "reasoning_content",
    },
}


def load_api_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    key_file = Path(os.environ["USERPROFILE"]) / ".cc-switch" / "deepseek.key"
    if key_file.exists():
        key = key_file.read_text(encoding="utf-8").strip()
        key_file.unlink(missing_ok=True)
        if key:
            return key
    return getpass.getpass("DeepSeek API Key (input hidden): ").strip()


def main() -> None:
    api_key = load_api_key()
    if not api_key:
        raise SystemExit("No API key provided.")

    home = Path(os.environ["USERPROFILE"])
    cc_dir = home / ".cc-switch"
    codex_dir = home / ".codex"
    db_path = cc_dir / "cc-switch.db"
    settings_path = cc_dir / "settings.json"

    settings_config = {
        "auth": {"OPENAI_API_KEY": api_key},
        "config": CONFIG_TOML,
        "modelCatalog": MODEL_CATALOG,
    }

    conn = sqlite3.connect(db_path)
    now = int(time.time())
    conn.execute(
        "DELETE FROM providers WHERE id = ? AND app_type = 'codex'",
        (PROVIDER_ID,),
    )
    conn.execute(
        """
        INSERT INTO providers (
            id, app_type, name, settings_config, website_url, category,
            created_at, sort_index, notes, icon, icon_color, meta, in_failover_queue
        ) VALUES (?, 'codex', ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 0)
        """,
        (
            PROVIDER_ID,
            "DeepSeek",
            json.dumps(settings_config, ensure_ascii=False),
            "https://platform.deepseek.com",
            "cn_official",
            now,
            1,
            "deepseek",
            "#1E88E5",
            json.dumps(META, ensure_ascii=False),
        ),
    )
    conn.execute("UPDATE providers SET is_current = 0 WHERE app_type = 'codex'")
    conn.execute(
        "UPDATE providers SET is_current = 1 WHERE id = ? AND app_type = 'codex'",
        (PROVIDER_ID,),
    )
    conn.execute(
        "UPDATE proxy_config SET enabled = 1, proxy_enabled = 1, live_takeover_active = 1"
    )
    conn.commit()
    conn.close()

    settings = json.loads(settings_path.read_text(encoding="utf-8"))
    settings["enableLocalProxy"] = True
    settings["currentProviderCodex"] = PROVIDER_ID
    settings_path.write_text(
        json.dumps(settings, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    codex_dir.mkdir(parents=True, exist_ok=True)
    takeover_toml = CONFIG_TOML.replace(
        "base_url = \"https://api.deepseek.com\"",
        f"base_url = \"{PROXY_URL}\"",
    )
    catalog_path = codex_dir / "cc-switch-model-catalog.json"
    catalog_path.write_text(
        json.dumps(MODEL_CATALOG, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if "model_catalog_json" not in takeover_toml:
        takeover_toml += f'model_catalog_json = "cc-switch-model-catalog.json"\n'

    (codex_dir / "auth.json").write_text(
        json.dumps({"OPENAI_API_KEY": PLACEHOLDER}, indent=2) + "\n",
        encoding="utf-8",
    )
    (codex_dir / "config.toml").write_text(takeover_toml, encoding="utf-8")

    print("OK: DeepSeek Codex provider configured.")
    print(f"  Provider ID: {PROVIDER_ID}")
    print(f"  Live config: {codex_dir}")
    print("  Restart CC Switch (or start dev) so local proxy starts, then open a new terminal and run: codex")


if __name__ == "__main__":
    main()
