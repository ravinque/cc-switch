//! Web UI management server commands

use crate::management_server::{WebUiController, WebUiStatus};
use std::sync::Arc;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn get_web_ui_status(
    controller: State<'_, Arc<WebUiController>>,
) -> Result<WebUiStatus, String> {
    Ok(controller.status().await)
}

#[tauri::command]
pub async fn set_web_ui_enabled(
    controller: State<'_, Arc<WebUiController>>,
    enabled: bool,
    port: Option<u16>,
) -> Result<WebUiStatus, String> {
    controller.set_enabled(enabled, port).await
}

#[tauri::command]
pub async fn regenerate_web_ui_token(
    controller: State<'_, Arc<WebUiController>>,
) -> Result<String, String> {
    controller.regenerate_token().await
}

#[tauri::command]
pub async fn open_web_ui_in_browser(
    controller: State<'_, Arc<WebUiController>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let status = controller.status().await;
    let url = status
        .url
        .ok_or_else(|| "Web UI server is not running".to_string())?;
    let token = status.token.ok_or_else(|| "Web UI token unavailable".to_string())?;
    let open_url = format!("{url}?token={token}");
    app.opener()
        .open_url(&open_url, None::<String>)
        .map_err(|e| e.to_string())
}
