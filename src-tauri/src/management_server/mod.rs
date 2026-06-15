//! Browser-accessible management API + static SPA hosting.

mod rpc;

use crate::database::Database;
use crate::settings;
use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use rpc::{dispatch_rpc, RpcRequest, RpcResponse};
use serde::Serialize;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{oneshot, RwLock};
use tokio::task::JoinHandle;
use tower_http::cors::CorsLayer;
use tower_http::services::{ServeDir, ServeFile};

const DEFAULT_WEB_UI_PORT: u16 = 8787;

#[derive(Clone)]
pub struct WebUiSharedState {
    pub db: Arc<Database>,
    pub token: Arc<RwLock<String>>,
}

struct WebUiRuntime {
    shutdown_tx: oneshot::Sender<()>,
    handle: JoinHandle<()>,
    addr: SocketAddr,
}

pub struct WebUiController {
    shared: WebUiSharedState,
    dist_dir: Arc<RwLock<Option<PathBuf>>>,
    runtime: Arc<RwLock<Option<WebUiRuntime>>>,
    app_handle: Option<tauri::AppHandle>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebUiStatus {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub url: Option<String>,
    pub token: Option<String>,
    pub dist_available: bool,
}

impl WebUiController {
    pub fn new(db: Arc<Database>, app_handle: tauri::AppHandle) -> Self {
        let token = settings::get_settings()
            .web_ui_token
            .clone()
            .unwrap_or_else(generate_token);
        Self {
            shared: WebUiSharedState {
                db,
                token: Arc::new(RwLock::new(token)),
            },
            dist_dir: Arc::new(RwLock::new(resolve_frontend_dist(&app_handle))),
            runtime: Arc::new(RwLock::new(None)),
            app_handle: Some(app_handle),
        }
    }

    pub fn ensure_token_persisted(&self) {
        let token = self.shared.token.blocking_read().clone();
        let _ = settings::mutate_settings(|s| {
            if s.web_ui_token.is_none() {
                s.web_ui_token = Some(token);
            }
        });
    }

    pub async fn status(&self) -> WebUiStatus {
        let app_settings = settings::get_settings();
        let runtime = self.runtime.read().await;
        let running = runtime.is_some();
        let port = if app_settings.web_ui_port == 0 {
            DEFAULT_WEB_UI_PORT
        } else {
            app_settings.web_ui_port
        };
        let url = running.then(|| format!("http://127.0.0.1:{port}/"));
        let dist_available = self
            .dist_dir
            .read()
            .await
            .as_ref()
            .map(|p| p.join("index.html").is_file())
            .unwrap_or(false);
        let token = if app_settings.enable_web_ui {
            Some(self.shared.token.read().await.clone())
        } else {
            None
        };

        WebUiStatus {
            enabled: app_settings.enable_web_ui,
            running,
            port,
            url,
            token,
            dist_available,
        }
    }

    pub async fn set_enabled(&self, enabled: bool, port: Option<u16>) -> Result<WebUiStatus, String> {
        settings::mutate_settings(|s| {
            s.enable_web_ui = enabled;
            if let Some(p) = port {
                s.web_ui_port = p;
            }
            if s.web_ui_port == 0 {
                s.web_ui_port = DEFAULT_WEB_UI_PORT;
            }
            if s.web_ui_token.is_none() {
                s.web_ui_token = Some(generate_token());
            }
        })
        .map_err(|e| e.to_string())?;

        if let Some(token) = settings::get_settings().web_ui_token.clone() {
            *self.shared.token.write().await = token;
        }

        if enabled {
            self.start().await?;
        } else {
            self.stop().await;
        }
        Ok(self.status().await)
    }

    pub async fn regenerate_token(&self) -> Result<String, String> {
        let token = generate_token();
        *self.shared.token.write().await = token.clone();
        settings::mutate_settings(|s| {
            s.web_ui_token = Some(token.clone());
        })
        .map_err(|e| e.to_string())?;
        Ok(token)
    }

    pub async fn start(&self) -> Result<(), String> {
        if self.runtime.read().await.is_some() {
            return Ok(());
        }

        let app_settings = settings::get_settings();
        let port = if app_settings.web_ui_port == 0 {
            DEFAULT_WEB_UI_PORT
        } else {
            app_settings.web_ui_port
        };
        let addr: SocketAddr = format!("127.0.0.1:{port}")
            .parse()
            .map_err(|e| format!("invalid web ui address: {e}"))?;

        let dist = self.dist_dir.read().await.clone();
        let shared = self.shared.clone();
        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let router = build_router(shared, dist);
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .map_err(|e| format!("failed to bind web ui on {addr}: {e}"))?;

        let bound = listener
            .local_addr()
            .map_err(|e| format!("failed to read bound address: {e}"))?;

        let handle = tokio::spawn(async move {
            let server = axum::serve(listener, router).with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            });
            if let Err(err) = server.await {
                log::error!("Web UI server stopped with error: {err}");
            }
        });

        *self.runtime.write().await = Some(WebUiRuntime {
            shutdown_tx,
            handle,
            addr: bound,
        });

        log::info!("Web UI management server listening on http://{}", bound);
        Ok(())
    }

    pub async fn stop(&self) {
        if let Some(runtime) = self.runtime.write().await.take() {
            let _ = runtime.shutdown_tx.send(());
            let _ = runtime.handle.await;
            log::info!("Web UI management server stopped");
        }
    }

    pub async fn refresh_dist_dir(&self) {
        if let Some(handle) = &self.app_handle {
            *self.dist_dir.write().await = resolve_frontend_dist(handle);
        }
    }
}

fn generate_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn resolve_frontend_dist(app: &tauri::AppHandle) -> Option<PathBuf> {
    if cfg!(debug_assertions) {
        let dev_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../dist");
        if dev_dist.join("index.html").is_file() {
            return Some(dev_dist);
        }
        return None;
    }

    if let Ok(resource) = app.path().resource_dir() {
        if resource.join("index.html").is_file() {
            return Some(resource);
        }
        if let Some(parent) = resource.parent() {
            if parent.join("index.html").is_file() {
                return Some(parent.to_path_buf());
            }
        }
    }
    None
}

fn build_router(shared: WebUiSharedState, dist: Option<PathBuf>) -> Router {
    let api = Router::new()
        .route("/api/health", get(health))
        .route("/api/rpc", post(rpc_handler))
        .with_state(shared);

    let Some(dist_dir) = dist.filter(|p| p.join("index.html").is_file()) else {
        log::warn!(
            "Web UI static assets not found; API-only mode. Run pnpm build:renderer for browser UI."
        );
        return api.layer(CorsLayer::permissive());
    };

    let index = dist_dir.join("index.html");
    let assets = dist_dir.join("assets");
    log::info!("Web UI serving static assets from {}", dist_dir.display());

    api.nest_service("/assets", ServeDir::new(assets))
        .fallback_service(ServeFile::new(index))
        .layer(CorsLayer::permissive())
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "cc-switch-web-ui" }))
}

async fn rpc_handler(
    State(shared): State<WebUiSharedState>,
    headers: HeaderMap,
    Json(body): Json<RpcRequest>,
) -> Result<Json<RpcResponse>, ApiError> {
    verify_token(&headers, &shared.token).await?;
    let result = dispatch_rpc(&shared, &body.command, body.args.unwrap_or_default()).await;
    match result {
        Ok(value) => Ok(Json(RpcResponse {
            ok: true,
            result: Some(value),
            error: None,
        })),
        Err(err) => Ok(Json(RpcResponse {
            ok: false,
            result: None,
            error: Some(err),
        })),
    }
}

async fn verify_token(headers: &HeaderMap, expected: &RwLock<String>) -> Result<(), ApiError> {
    let token = expected.read().await.clone();
    let provided = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .or_else(|| {
            headers
                .get("X-CC-Switch-Token")
                .and_then(|v| v.to_str().ok())
        });

    match provided {
        Some(value) if value == token => Ok(()),
        _ => Err(ApiError::Unauthorized),
    }
}

#[derive(Debug)]
enum ApiError {
    Unauthorized,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        match self {
            ApiError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "error": "unauthorized" })),
            )
                .into_response(),
        }
    }
}

pub async fn bootstrap_from_settings(controller: &Arc<WebUiController>) {
    controller.refresh_dist_dir().await;
    controller.ensure_token_persisted();
    if settings::get_settings().enable_web_ui {
        if let Err(err) = controller.start().await {
            log::error!("Failed to start Web UI server: {err}");
        }
    }
}
