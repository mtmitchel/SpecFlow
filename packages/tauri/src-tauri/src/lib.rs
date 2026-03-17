use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex};
use tokio::time::sleep;

const PENDING_REQUEST_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Serialize, Deserialize)]
struct SidecarRequest {
    id: String,
    method: String,
    params: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct SidecarNotification {
    event: String,
    #[serde(rename = "requestId")]
    request_id: Option<String>,
    payload: Value,
}

#[derive(Debug, Deserialize)]
struct SidecarSuccess {
    id: String,
    #[serde(rename = "ok")]
    _ok: bool,
    result: Value,
}

#[derive(Debug, Deserialize)]
struct SidecarFailure {
    id: String,
    #[serde(rename = "ok")]
    _ok: bool,
    error: SidecarCommandError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SidecarCommandError {
    code: String,
    message: String,
    #[serde(rename = "statusCode")]
    status_code: u16,
    details: Option<Value>,
}

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, SidecarCommandError>>,
    on_event: Channel<Value>,
}

struct SidecarRuntime {
    child: Mutex<CommandChild>,
    pending: Mutex<HashMap<String, PendingRequest>>,
}

#[derive(Clone)]
struct SidecarState {
    runtime: Arc<SidecarRuntime>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum SidecarMessage {
    Success(SidecarSuccess),
    Failure(SidecarFailure),
    Notification(SidecarNotification),
}

#[tauri::command]
async fn sidecar_request(
    app: AppHandle,
    state: State<'_, SidecarState>,
    request: SidecarRequest,
    on_event: Channel<Value>,
) -> Result<Value, SidecarCommandError> {
    let payload = serde_json::to_vec(&request).map_err(to_command_error)?;
    let mut line = payload;
    line.push(b'\n');

    let (tx, rx) = oneshot::channel();
    {
        let mut pending = state.runtime.pending.lock().await;
        pending.insert(
            request.id.clone(),
            PendingRequest {
                tx,
                on_event,
            },
        );
    }

    let runtime_for_timeout = state.runtime.clone();
    let request_id_for_timeout = request.id.clone();
    tauri::async_runtime::spawn(async move {
        sleep(PENDING_REQUEST_TTL).await;
        let pending = {
            let mut pending = runtime_for_timeout.pending.lock().await;
            pending.remove(&request_id_for_timeout)
        };

        if let Some(pending) = pending {
            let _ = pending.tx.send(Err(SidecarCommandError {
                code: "Request Timeout".into(),
                message: "The SpecFlow sidecar request exceeded the pending timeout".into(),
                status_code: 504,
                details: None,
            }));
        }
    });

    {
        let mut child = state.runtime.child.lock().await;
        if let Err(error) = child.write(&line) {
            let mut pending = state.runtime.pending.lock().await;
            pending.remove(&request.id);
            return Err(to_command_error(error));
        }
    }

    match rx.await {
        Ok(result) => result,
        Err(_) => {
            let _ = app.emit("artifacts-changed", serde_json::json!({ "reason": "sidecar-disconnect" }));
            Err(SidecarCommandError {
                code: "Sidecar Closed".into(),
                message: "The SpecFlow sidecar closed before replying".into(),
                status_code: 500,
                details: None,
            })
        }
    }
}

#[tauri::command]
async fn sidecar_cancel(
    state: State<'_, SidecarState>,
    request_id: String,
) -> Result<(), SidecarCommandError> {
    let pending = {
        let mut pending = state.runtime.pending.lock().await;
        pending.remove(&request_id)
    };

    if let Some(pending) = pending {
        let _ = pending.tx.send(Err(SidecarCommandError {
            code: "Request Cancelled".into(),
            message: "Request cancelled".into(),
            status_code: 499,
            details: None,
        }));
    }

    let cancel_request = SidecarRequest {
        id: format!("cancel-{request_id}"),
        method: "runtime.cancel".into(),
        params: Some(serde_json::json!({ "requestId": request_id })),
    };
    let payload = serde_json::to_vec(&cancel_request).map_err(to_command_error)?;
    let mut line = payload;
    line.push(b'\n');

    let mut child = state.runtime.child.lock().await;
    child.write(&line).map_err(to_command_error)?;
    Ok(())
}

fn to_command_error(error: impl ToString) -> SidecarCommandError {
    SidecarCommandError {
        code: "Desktop Bridge Error".into(),
        message: error.to_string(),
        status_code: 500,
        details: None,
    }
}

fn resolve_workspace_root() -> Result<PathBuf, SidecarCommandError> {
    std::env::current_dir().map_err(to_command_error)
}

fn resolve_dev_sidecar_path() -> Result<PathBuf, SidecarCommandError> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    Ok(manifest_dir
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or_else(|| to_command_error("Failed to resolve workspace root"))?
        .join("packages")
        .join("app")
        .join("dist")
        .join("sidecar.js"))
}

async fn wait_for_dev_sidecar_path(path: &Path) -> Result<(), SidecarCommandError> {
    const MAX_ATTEMPTS: usize = 200;
    const POLL_INTERVAL: Duration = Duration::from_millis(100);

    for _ in 0..MAX_ATTEMPTS {
        if path.is_file() {
            return Ok(());
        }

        sleep(POLL_INTERVAL).await;
    }

    Err(SidecarCommandError {
        code: "Desktop Bridge Error".into(),
        message: format!(
            "Timed out waiting for the dev sidecar build at {}",
            path.display()
        ),
        status_code: 500,
        details: None,
    })
}

async fn spawn_sidecar(app: &AppHandle) -> Result<Arc<SidecarRuntime>, SidecarCommandError> {
    let workspace_root = resolve_workspace_root()?;
    let sidecar_env = [("SPECFLOW_ROOT_DIR", workspace_root.to_string_lossy().to_string())];

    let (mut rx, child) = if cfg!(debug_assertions) {
        let sidecar_path = resolve_dev_sidecar_path()?;
        wait_for_dev_sidecar_path(&sidecar_path).await?;
        let command = app
            .shell()
            .command("node")
            .args([sidecar_path.to_string_lossy().to_string()])
            .envs(sidecar_env.clone())
            .current_dir(workspace_root.to_string_lossy().to_string());

        command.spawn().map_err(to_command_error)?
    } else {
        let command = app
            .shell()
            .sidecar("specflow-sidecar")
            .map_err(to_command_error)?
            .envs(sidecar_env)
            .current_dir(workspace_root.to_string_lossy().to_string());

        command.spawn().map_err(to_command_error)?
    };

    let runtime = Arc::new(SidecarRuntime {
        child: Mutex::new(child),
        pending: Mutex::new(HashMap::new()),
    });

    let app_handle = app.clone();
    let runtime_for_task = runtime.clone();
    tauri::async_runtime::spawn(async move {
        let mut buffer = String::new();

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    if let Ok(chunk) = String::from_utf8(bytes) {
                        buffer.push_str(&chunk);
                        while let Some(newline_index) = buffer.find('\n') {
                            let line = buffer.drain(..=newline_index).collect::<String>();
                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            if let Ok(message) = serde_json::from_str::<SidecarMessage>(trimmed) {
                                handle_sidecar_message(&app_handle, &runtime_for_task, message).await;
                            }
                        }
                    }
                }
                CommandEvent::Terminated(_) => {
                    fail_pending_requests(
                        &app_handle,
                        &runtime_for_task,
                        SidecarCommandError {
                            code: "Sidecar Closed".into(),
                            message: "The SpecFlow sidecar closed before replying".into(),
                            status_code: 500,
                            details: None,
                        },
                    )
                    .await;
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(runtime)
}

async fn handle_sidecar_message(app: &AppHandle, runtime: &Arc<SidecarRuntime>, message: SidecarMessage) {
    match message {
        SidecarMessage::Success(success) => {
            let pending = {
                let mut pending = runtime.pending.lock().await;
                pending.remove(&success.id)
            };

            if let Some(pending) = pending {
                let _ = pending.tx.send(Ok(success.result));
            }
        }
        SidecarMessage::Failure(failure) => {
            let pending = {
                let mut pending = runtime.pending.lock().await;
                pending.remove(&failure.id)
            };

            if let Some(pending) = pending {
                let _ = pending.tx.send(Err(failure.error));
            }
        }
        SidecarMessage::Notification(notification) => {
            if notification.event == "artifacts.changed" {
                let _ = app.emit("artifacts-changed", notification.payload.clone());
            }

            if let Some(request_id) = notification.request_id {
                let pending = runtime.pending.lock().await;
                if let Some(pending) = pending.get(&request_id) {
                    let _ = pending.on_event.send(serde_json::json!({
                        "event": notification.event,
                        "payload": notification.payload,
                        "requestId": request_id
                    }));
                }
            }
        }
    }
}

async fn fail_pending_requests(
    app: &AppHandle,
    runtime: &Arc<SidecarRuntime>,
    error: SidecarCommandError,
) {
    let pending = {
        let mut pending = runtime.pending.lock().await;
        std::mem::take(&mut *pending)
    };

    let _ = app.emit(
        "artifacts-changed",
        serde_json::json!({ "reason": "sidecar-disconnect" }),
    );

    for (_, pending_request) in pending {
        let _ = pending_request.tx.send(Err(error.clone()));
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let runtime = spawn_sidecar(&handle).await?;
                handle.manage(SidecarState { runtime });
                Ok::<(), SidecarCommandError>(())
            })
            .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error.message))?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![sidecar_request, sidecar_cancel])
        .run(tauri::generate_context!())
        .expect("error while running SpecFlow desktop");
}
