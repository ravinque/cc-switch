use crate::app_config::AppType;
use crate::database::Database;
use crate::init_status;
use crate::llm_api::{credential_fingerprint, LlmApiProfile};
use crate::management_server::WebUiSharedState;
use crate::provider::Provider;
use crate::services::provider::ProviderService;
use crate::settings;
use crate::store::AppState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::str::FromStr;
use std::sync::Arc;

#[derive(Debug, Deserialize)]
pub struct RpcRequest {
    pub command: String,
    pub args: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct RpcResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

pub async fn dispatch_rpc(
    shared: &WebUiSharedState,
    command: &str,
    args: Value,
) -> Result<Value, String> {
    match command {
        "get_init_error" => Ok(serde_json::to_value(init_status::get_init_error()).unwrap()),
        "get_settings" => {
            let settings = settings::get_settings_for_frontend();
            Ok(serde_json::to_value(settings).unwrap())
        }
        "save_settings" => {
            let settings: settings::AppSettings =
                serde_json::from_value(args.get("settings").cloned().ok_or("missing settings")?)
                    .map_err(|e| e.to_string())?;
            settings::update_settings(settings).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(true))
        }
        "get_llm_api_profiles" => {
            let profiles = shared
                .db
                .get_all_llm_api_profiles()
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(profiles).unwrap())
        }
        "upsert_llm_api_profile" => {
            let profile: LlmApiProfile =
                serde_json::from_value(args.get("profile").cloned().ok_or("missing profile")?)
                    .map_err(|e| e.to_string())?;
            if profile.id.trim().is_empty() || profile.name.trim().is_empty() {
                return Err("id and name are required".to_string());
            }
            shared
                .db
                .save_llm_api_profile(&profile)
                .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "delete_llm_api_profile" => {
            let id = args
                .get("id")
                .and_then(|v| v.as_str())
                .ok_or("missing id")?;
            let deleted = shared
                .db
                .delete_llm_api_profile(id)
                .map_err(|e| e.to_string())?;
            Ok(serde_json::json!(deleted))
        }
        "import_llm_api_profiles_from_providers" => {
            let result = import_llm_api_profiles(shared.db.clone())?;
            Ok(serde_json::to_value(result).unwrap())
        }
        "get_providers" => {
            let app = args
                .get("app")
                .and_then(|v| v.as_str())
                .ok_or("missing app")?;
            let app_type = AppType::from_str(app).map_err(|e| e.to_string())?;
            let providers = shared
                .db
                .get_all_providers(app_type.as_str())
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(providers).unwrap())
        }
        "get_current_provider" => {
            let app = args
                .get("app")
                .and_then(|v| v.as_str())
                .ok_or("missing app")?;
            let app_type = AppType::from_str(app).map_err(|e| e.to_string())?;
            let state = AppState::new(shared.db.clone());
            let current = ProviderService::current(&state, app_type).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(current))
        }
        "get_mcp_servers" => {
            let servers = shared.db.get_all_mcp_servers().map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(servers).unwrap())
        }
        "get_prompts" => {
            let app = args
                .get("appId")
                .or_else(|| args.get("app"))
                .and_then(|v| v.as_str())
                .unwrap_or("claude");
            let prompts = shared.db.get_prompts(app).map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(prompts).unwrap())
        }
        "is_portable_mode" => Ok(serde_json::json!(false)),
        _ => Err(format!("command not available in web mode: {command}")),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportLlmApiProfilesResult {
    imported: usize,
    skipped: usize,
}

fn import_llm_api_profiles(db: Arc<Database>) -> Result<ImportLlmApiProfilesResult, String> {
    let existing = db.get_all_llm_api_profiles().map_err(|e| e.to_string())?;
    let mut seen: HashSet<String> = existing
        .values()
        .map(|p| credential_fingerprint(&p.base_url, &p.api_key))
        .collect();

    let app_types = [
        AppType::Claude,
        AppType::Codex,
        AppType::Gemini,
        AppType::OpenCode,
        AppType::Hermes,
        AppType::OpenClaw,
        AppType::ClaudeDesktop,
    ];

    let mut imported = 0usize;
    let mut skipped = 0usize;
    let now = chrono::Utc::now().timestamp_millis();

    for app_type in app_types {
        let providers = db
            .get_all_providers(app_type.as_str())
            .map_err(|e| e.to_string())?;

        for provider in providers.values() {
            if should_skip_provider_for_import(provider) {
                skipped += 1;
                continue;
            }
            let Some((base_url, api_key, vendor)) = extract_credentials(&app_type, provider) else {
                continue;
            };
            if api_key.trim().is_empty() && base_url.trim().is_empty() {
                continue;
            }
            let fingerprint = credential_fingerprint(&base_url, &api_key);
            if seen.contains(&fingerprint) {
                continue;
            }
            seen.insert(fingerprint);
            let id = format!(
                "import-{}-{}",
                app_type.as_str(),
                provider.id.replace('/', "-")
            );
            let profile = LlmApiProfile {
                id,
                name: format!("{} ({})", provider.name, app_type.as_str()),
                vendor,
                base_url,
                api_key,
                notes: Some(format!("Imported from {}/{}", app_type.as_str(), provider.id)),
                created_at: now,
                updated_at: now,
            };
            db.save_llm_api_profile(&profile)
                .map_err(|e| e.to_string())?;
            imported += 1;
        }
    }

    Ok(ImportLlmApiProfilesResult { imported, skipped })
}

fn should_skip_provider_for_import(provider: &Provider) -> bool {
    if provider.is_codex_oauth() || provider.is_github_copilot() {
        return true;
    }
    if let Some(category) = provider.category.as_deref() {
        if category == "official" {
            return true;
        }
    }
    false
}

fn extract_credentials(
    app_type: &AppType,
    provider: &Provider,
) -> Option<(String, String, String)> {
    match app_type {
        AppType::Claude | AppType::ClaudeDesktop => {
            let obj = provider.settings_config.as_object()?;
            let env_obj = obj.get("env").and_then(|v| v.as_object()).unwrap_or(obj);
            let base_url = env_obj
                .get("ANTHROPIC_BASE_URL")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let api_key = env_obj
                .get("ANTHROPIC_AUTH_TOKEN")
                .or_else(|| env_obj.get("ANTHROPIC_API_KEY"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some((base_url, api_key, "anthropic".to_string()))
        }
        AppType::Codex => {
            let obj = provider.settings_config.as_object()?;
            let auth = obj.get("auth")?.as_object()?;
            let api_key = auth
                .get("OPENAI_API_KEY")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let config = obj.get("config").and_then(|v| v.as_str()).unwrap_or("");
            let base_url = parse_codex_base_url(config);
            Some((base_url, api_key, "openai_compatible".to_string()))
        }
        AppType::Gemini => {
            let obj = provider.settings_config.as_object()?;
            let env = obj.get("env").and_then(|v| v.as_object())?;
            let base_url = env
                .get("GOOGLE_GEMINI_BASE_URL")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let api_key = env
                .get("GEMINI_API_KEY")
                .or_else(|| env.get("GOOGLE_GEMINI_API_KEY"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some((base_url, api_key, "gemini".to_string()))
        }
        AppType::OpenCode | AppType::Hermes => {
            let obj = provider.settings_config.as_object()?;
            let base_url = obj
                .get("baseUrl")
                .or_else(|| obj.get("baseURL"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let api_key = obj
                .get("apiKey")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some((base_url, api_key, "openai_compatible".to_string()))
        }
        AppType::OpenClaw => {
            let obj = provider.settings_config.as_object()?;
            let api = obj.get("api").and_then(|v| v.as_object())?;
            let base_url = api
                .get("baseUrl")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let api_key = api
                .get("apiKey")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some((base_url, api_key, "openai_compatible".to_string()))
        }
    }
}

fn parse_codex_base_url(config: &str) -> String {
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("model_provider_url")
            || trimmed.starts_with("base_url")
            || trimmed.starts_with("openai_base_url")
        {
            if let Some((_, value)) = trimmed.split_once('=') {
                return value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string();
            }
        }
    }
    String::new()
}
