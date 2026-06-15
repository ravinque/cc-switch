//! Global LLM API credential profiles — single source of truth for API keys and base URLs.

use crate::app_config::AppType;
use crate::provider::ProviderMeta;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

/// Vendor determines how credentials map into per-app live settings.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LlmApiVendor {
    OpenAiCompatible,
    Anthropic,
    Gemini,
}

impl LlmApiVendor {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_lowercase().as_str() {
            "anthropic" => Self::Anthropic,
            "gemini" => Self::Gemini,
            _ => Self::OpenAiCompatible,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OpenAiCompatible => "openai_compatible",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
        }
    }
}

/// Reusable LLM API credential profile.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmApiProfile {
    pub id: String,
    pub name: String,
    pub vendor: String,
    pub base_url: String,
    pub api_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl LlmApiProfile {
    pub fn vendor_type(&self) -> LlmApiVendor {
        LlmApiVendor::parse(&self.vendor)
    }
}

/// Apply the primary linked profile onto provider settings before writing live config.
pub fn apply_profile_to_settings(
    app_type: &AppType,
    settings: &Value,
    profile: &LlmApiProfile,
    meta: Option<&ProviderMeta>,
) -> Value {
    if profile.api_key.trim().is_empty() && profile.base_url.trim().is_empty() {
        return settings.clone();
    }

    match app_type {
        AppType::Claude | AppType::ClaudeDesktop => {
            apply_anthropic_settings(settings, profile, meta)
        }
        AppType::Codex => apply_codex_settings(settings, profile),
        AppType::Gemini => apply_gemini_settings(settings, profile),
        AppType::OpenCode => apply_opencode_settings(settings, profile),
        AppType::Hermes => apply_hermes_settings(settings, profile),
        AppType::OpenClaw => apply_openclaw_settings(settings, profile),
    }
}

fn api_key_field(meta: Option<&ProviderMeta>) -> &'static str {
    match meta.and_then(|m| m.api_key_field.as_deref()) {
        Some("ANTHROPIC_API_KEY") => "ANTHROPIC_API_KEY",
        _ => "ANTHROPIC_AUTH_TOKEN",
    }
}

fn apply_anthropic_settings(
    settings: &Value,
    profile: &LlmApiProfile,
    meta: Option<&ProviderMeta>,
) -> Value {
    let key_field = api_key_field(meta);
    let mut root = if settings.is_object() {
        settings.clone()
    } else {
        json!({})
    };

    let target = if root.get("env").is_some() {
        root.as_object_mut()
            .and_then(|o| o.get_mut("env"))
            .and_then(|v| v.as_object_mut())
    } else {
        root.as_object_mut()
    };

    if let Some(obj) = target {
        if !profile.base_url.trim().is_empty() {
            obj.insert(
                "ANTHROPIC_BASE_URL".to_string(),
                json!(profile.base_url.trim()),
            );
        }
        if !profile.api_key.trim().is_empty() {
            obj.insert(key_field.to_string(), json!(profile.api_key.trim()));
        }
    }

    root
}

fn apply_codex_settings(settings: &Value, profile: &LlmApiProfile) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    let mut auth = root
        .get("auth")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if !profile.api_key.trim().is_empty() {
        auth.insert("OPENAI_API_KEY".to_string(), json!(profile.api_key.trim()));
    }

    let config_str = root
        .get("config")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let updated_config = if !profile.base_url.trim().is_empty() {
        set_codex_toml_base_url(&config_str, profile.base_url.trim())
    } else {
        config_str
    };

    root.insert("auth".to_string(), Value::Object(auth));
    root.insert("config".to_string(), json!(updated_config));
    Value::Object(root)
}

fn set_codex_toml_base_url(config: &str, base_url: &str) -> String {
    let escaped = serde_json::to_string(base_url).unwrap_or_else(|_| format!("\"{base_url}\""));
    let mut lines: Vec<String> = config.lines().map(String::from).collect();
    let mut replaced = false;

    for line in &mut lines {
        let trimmed = line.trim();
        if trimmed.starts_with("model_provider_url")
            || trimmed.starts_with("base_url")
            || trimmed.starts_with("openai_base_url")
        {
            let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
            *line = format!("{indent}model_provider_url = {escaped}");
            replaced = true;
        }
    }

    if replaced {
        lines.join("\n")
    } else if config.trim().is_empty() {
        format!("model_provider = \"custom\"\nmodel_provider_url = {escaped}\n")
    } else {
        format!("{config}\nmodel_provider_url = {escaped}\n")
    }
}

fn apply_gemini_settings(settings: &Value, profile: &LlmApiProfile) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    let mut env = root
        .get("env")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if !profile.api_key.trim().is_empty() {
        env.insert("GEMINI_API_KEY".to_string(), json!(profile.api_key.trim()));
        env.insert(
            "GOOGLE_GEMINI_API_KEY".to_string(),
            json!(profile.api_key.trim()),
        );
    }
    if !profile.base_url.trim().is_empty() {
        env.insert(
            "GOOGLE_GEMINI_BASE_URL".to_string(),
            json!(profile.base_url.trim()),
        );
    }

    root.insert("env".to_string(), Value::Object(env));
    Value::Object(root)
}

fn apply_opencode_settings(settings: &Value, profile: &LlmApiProfile) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    if !profile.base_url.trim().is_empty() {
        root.insert("baseURL".to_string(), json!(profile.base_url.trim()));
        root.insert("baseUrl".to_string(), json!(profile.base_url.trim()));
    }
    if !profile.api_key.trim().is_empty() {
        root.insert("apiKey".to_string(), json!(profile.api_key.trim()));
    }
    Value::Object(root)
}

fn apply_hermes_settings(settings: &Value, profile: &LlmApiProfile) -> Value {
    apply_opencode_settings(settings, profile)
}

fn apply_openclaw_settings(settings: &Value, profile: &LlmApiProfile) -> Value {
    let mut root = settings.as_object().cloned().unwrap_or_default();
    let mut api = root
        .get("api")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if !profile.base_url.trim().is_empty() {
        api.insert("baseUrl".to_string(), json!(profile.base_url.trim()));
    }
    if !profile.api_key.trim().is_empty() {
        api.insert("apiKey".to_string(), json!(profile.api_key.trim()));
    }

    root.insert("api".to_string(), Value::Object(api));
    Value::Object(root)
}

/// Extract credential fingerprint for deduplication when importing from providers.
pub fn credential_fingerprint(base_url: &str, api_key: &str) -> String {
    format!("{}::{}", base_url.trim().to_lowercase(), api_key.trim())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_codex_updates_toml_base_url() {
        let settings = json!({
            "auth": { "OPENAI_API_KEY": "old" },
            "config": "model = \"gpt-5\"\n"
        });
        let profile = LlmApiProfile {
            id: "p1".into(),
            name: "DeepSeek".into(),
            vendor: "openai_compatible".into(),
            base_url: "https://api.deepseek.com".into(),
            api_key: "sk-test".into(),
            notes: None,
            created_at: 0,
            updated_at: 0,
        };
        let applied = apply_profile_to_settings(&AppType::Codex, &settings, &profile, None);
        assert_eq!(
            applied["auth"]["OPENAI_API_KEY"].as_str(),
            Some("sk-test")
        );
        let config = applied["config"].as_str().unwrap();
        assert!(config.contains("https://api.deepseek.com"));
    }

    #[test]
    fn apply_claude_sets_env_fields() {
        let settings = json!({ "ANTHROPIC_MODEL": "claude-sonnet" });
        let profile = LlmApiProfile {
            id: "p1".into(),
            name: "API".into(),
            vendor: "anthropic".into(),
            base_url: "https://api.anthropic.com".into(),
            api_key: "sk-ant".into(),
            notes: None,
            created_at: 0,
            updated_at: 0,
        };
        let applied = apply_profile_to_settings(&AppType::Claude, &settings, &profile, None);
        assert_eq!(
            applied["ANTHROPIC_BASE_URL"].as_str(),
            Some("https://api.anthropic.com")
        );
        assert_eq!(applied["ANTHROPIC_AUTH_TOKEN"].as_str(), Some("sk-ant"));
    }
}
