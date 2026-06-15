//! Internal RingCentral skill / MCP registry clients (skills.int.rclabenv.com, mcp.int.rclabenv.com).

use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::app_config::{McpApps, McpServer};
use crate::services::skill::DiscoverableSkill;

const DEFAULT_SKILLS_API: &str = "/api/skills";
const DEFAULT_MCP_API: &str = "/api/mcp";

async fn fetch_registry_json(base_url: &str, api_path: &str) -> Result<Value> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), api_path);
    // Internal registry hosts must bypass global/system proxy (corp proxy often blocks *.int.rclabenv.com).
    let client = reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| crate::proxy::http_client::get());
    let mut req = client.get(&url);
    if let Ok(token) = std::env::var("CC_SWITCH_SKILL_REPO_TOKEN") {
        let token = token.trim();
        if !token.is_empty() {
            req = req.header("Authorization", format!("Bearer {token}"));
        }
    }
    let response = req.send().await?.error_for_status()?;
    response.json().await.map_err(|e| anyhow!("{e}"))
}

/// Parse GitLab `/-/tree/<branch>/<path>` URLs into clone base, branch, and in-repo path.
pub fn split_gitlab_tree_url(url: &str) -> (String, String, String) {
    let trimmed = url.trim_end_matches('/');
    if let Some(marker) = trimmed.find("/-/tree/") {
        let repo_base = trimmed[..marker].trim_end_matches(".git");
        let tail = &trimmed[marker + "/-/tree/".len()..];
        let mut parts = tail.splitn(2, '/');
        let branch = parts.next().unwrap_or("main").to_string();
        let path = parts.next().unwrap_or("").to_string();
        return (repo_base.to_string(), branch, path);
    }
    let without_git = trimmed.trim_end_matches(".git");
    (without_git.to_string(), "main".to_string(), String::new())
}

pub async fn discover_skills_from_registry(base_url: &str) -> Result<Vec<DiscoverableSkill>> {
    let body = fetch_registry_json(base_url, DEFAULT_SKILLS_API).await?;
    let items = body
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("registry response missing data array"))?;

    let host = base_url
        .trim_end_matches('/')
        .replace("https://", "")
        .replace("http://", "");

    let mut skills = Vec::new();
    for item in items {
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or(id);
        let summary = item
            .get("summary")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let git_url = item.get("gitUrl").and_then(|v| v.as_str());
        let skill_md_url = item.get("skillMdUrl").and_then(|v| v.as_str());

        let (source_git_url, source_path, branch) = if let Some(url) = git_url {
            let (clone_base, branch, path) = split_gitlab_tree_url(url);
            (
                Some(clone_base),
                if path.is_empty() {
                    None
                } else {
                    Some(path)
                },
                branch,
            )
        } else {
            (None, None, "main".to_string())
        };

        let directory = source_path
            .clone()
            .unwrap_or_else(|| id.to_string());

        skills.push(DiscoverableSkill {
            key: format!("registry:{host}:{id}"),
            name: title.to_string(),
            description: summary.to_string(),
            directory,
            readme_url: skill_md_url.map(|s| s.to_string()),
            repo_owner: host.clone(),
            repo_name: "registry".to_string(),
            repo_branch: branch,
            source_git_url,
            source_path,
        });
    }

    Ok(skills)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalMcpCatalogEntry {
    pub id: String,
    pub title: String,
    pub summary: Option<String>,
    pub import_method: String,
    pub import_content: Option<String>,
    pub git_url: Option<String>,
    pub readme: Option<String>,
}

pub async fn fetch_mcp_catalog(base_url: &str) -> Result<Vec<InternalMcpCatalogEntry>> {
    let body = fetch_registry_json(base_url, DEFAULT_MCP_API).await?;
    let items = body
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| anyhow!("registry response missing data array"))?;

    let mut entries = Vec::new();
    for item in items {
        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        entries.push(InternalMcpCatalogEntry {
            id: id.to_string(),
            title: item
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(id)
                .to_string(),
            summary: item.get("summary").and_then(|v| v.as_str()).map(String::from),
            import_method: item
                .get("importMethod")
                .and_then(|v| v.as_str())
                .unwrap_or("command")
                .to_string(),
            import_content: item
                .get("importContent")
                .and_then(|v| v.as_str())
                .map(String::from),
            git_url: item.get("gitUrl").and_then(|v| v.as_str()).map(String::from),
            readme: item.get("readme").and_then(|v| v.as_str()).map(String::from),
        });
    }
    Ok(entries)
}

pub fn internal_mcp_to_server(entry: &InternalMcpCatalogEntry) -> Result<McpServer> {
    let server_spec = match entry.import_method.as_str() {
        "sse" => serde_json::json!({
            "type": "sse",
            "url": entry.import_content.clone().unwrap_or_default(),
        }),
        "streamable" => serde_json::json!({
            "type": "http",
            "url": entry.import_content.clone().unwrap_or_default(),
        }),
        "command" => parse_command_import_content(entry.import_content.as_deref())?,
        other => return Err(anyhow!("unsupported MCP import method: {other}")),
    };

    Ok(McpServer {
        id: entry.id.clone(),
        name: entry.title.clone(),
        server: server_spec,
        apps: McpApps::default(),
        description: entry.summary.clone(),
        homepage: entry.git_url.clone(),
        docs: entry.readme.clone(),
        tags: vec!["internal-registry".to_string()],
    })
}

fn parse_command_import_content(content: Option<&str>) -> Result<Value> {
    let text = content.unwrap_or("").trim();
    if text.is_empty() {
        return Err(anyhow!("command MCP entry missing importContent"));
    }
    let parsed: Value = serde_json::from_str(text)
        .map_err(|e| anyhow!("failed to parse importContent JSON: {e}"))?;
    if let Some(servers) = parsed.get("mcpServers").and_then(|v| v.as_object()) {
        if let Some(spec) = servers.values().next() {
            return Ok(spec.clone());
        }
    }
    Ok(parsed)
}

/// Whether a registry entry has enough data to import automatically.
pub fn is_importable_mcp_entry(entry: &InternalMcpCatalogEntry) -> bool {
    let has_content = entry
        .import_content
        .as_ref()
        .is_some_and(|s| !s.trim().is_empty());
    match entry.import_method.as_str() {
        "sse" | "streamable" | "command" => has_content,
        _ => false,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalMcpImportSkip {
    pub id: String,
    pub title: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalMcpImportResult {
    pub imported: usize,
    pub skipped: Vec<InternalMcpImportSkip>,
}

pub fn import_mcp_entries(
    entries: &[InternalMcpCatalogEntry],
    server_ids: &[String],
    upsert: impl Fn(McpServer) -> Result<(), String>,
) -> InternalMcpImportResult {
    let import_all = server_ids.is_empty();
    let mut imported = 0;
    let mut skipped = Vec::new();

    for entry in entries {
        if !import_all && !server_ids.contains(&entry.id) {
            continue;
        }

        if !is_importable_mcp_entry(entry) {
            skipped.push(InternalMcpImportSkip {
                id: entry.id.clone(),
                title: entry.title.clone(),
                reason: if entry.import_method == "command" {
                    "command MCP entry missing importContent — configure manually from Git repo"
                        .to_string()
                } else {
                    format!(
                        "missing importContent for import method '{}'",
                        entry.import_method
                    )
                },
            });
            continue;
        }

        match internal_mcp_to_server(entry) {
            Ok(server) => {
                if let Err(e) = upsert(server) {
                    skipped.push(InternalMcpImportSkip {
                        id: entry.id.clone(),
                        title: entry.title.clone(),
                        reason: e,
                    });
                } else {
                    imported += 1;
                }
            }
            Err(e) => {
                skipped.push(InternalMcpImportSkip {
                    id: entry.id.clone(),
                    title: entry.title.clone(),
                    reason: e.to_string(),
                });
            }
        }
    }

    InternalMcpImportResult {
        imported,
        skipped,
    }
}
