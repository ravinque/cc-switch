//! LLM API profile management commands

use crate::app_config::AppType;
use crate::llm_api::{credential_fingerprint, LlmApiProfile};
use crate::provider::Provider;
use crate::store::AppState;
use indexmap::IndexMap;
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn get_llm_api_profiles(
    state: State<'_, AppState>,
) -> Result<IndexMap<String, LlmApiProfile>, String> {
    state
        .db
        .get_all_llm_api_profiles()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn upsert_llm_api_profile(
    state: State<'_, AppState>,
    profile: LlmApiProfile,
) -> Result<(), String> {
    if profile.id.trim().is_empty() || profile.name.trim().is_empty() {
        return Err("id and name are required".to_string());
    }
    let now = now_millis();
    let mut saved = profile;
    if saved.created_at == 0 {
        if let Ok(Some(existing)) = state.db.get_llm_api_profile(&saved.id) {
            saved.created_at = existing.created_at;
        } else {
            saved.created_at = now;
        }
    }
    saved.updated_at = now;
    state
        .db
        .save_llm_api_profile(&saved)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_llm_api_profile(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state
        .db
        .delete_llm_api_profile(&id)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportLlmApiProfilesResult {
    pub imported: usize,
    pub skipped: usize,
}

#[tauri::command]
pub fn import_llm_api_profiles_from_providers(
    state: State<'_, AppState>,
) -> Result<ImportLlmApiProfilesResult, String> {
    let existing = state
        .db
        .get_all_llm_api_profiles()
        .map_err(|e| e.to_string())?;
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
    let now = now_millis();

    for app_type in app_types {
        let providers = state
            .db
            .get_all_providers(app_type.as_str())
            .map_err(|e| e.to_string())?;

        for provider in providers.values() {
            if should_skip_provider_for_import(provider) {
                skipped += 1;
                continue;
            }

            let Some((base_url, api_key, vendor)) =
                extract_credentials(&app_type, provider)
            else {
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

            state
                .db
                .save_llm_api_profile(&profile)
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
