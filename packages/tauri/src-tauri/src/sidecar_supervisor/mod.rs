mod approved_paths;
mod build;
mod contract;
mod message_handling;
mod methods;
mod observability;
mod request_handling;
mod runtime;
mod runtime_lifecycle;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::AppHandle;
use tokio::sync::{oneshot, Mutex, Notify};

use self::contract::{cancelled_error, closed_error, timeout_error};
pub(crate) use self::contract::{bad_request, to_command_error};
pub use self::contract::{
    ApprovedPathSelection, DesktopRuntimeStatus, SavedBundleZip, SidecarCommandError,
    SidecarRequest,
};
pub(crate) use self::methods::is_allowed_renderer_method;
use self::observability::log_observability_event;
use self::runtime::{RuntimeCloseReason, RuntimeGeneration};

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, SidecarCommandError>>,
    on_event: Channel<Value>,
    runtime_generation: Option<u64>,
    method: String,
}

pub struct SidecarSupervisor {
    workspace_root: PathBuf,
    active_runtime: Mutex<Option<Arc<RuntimeGeneration>>>,
    pending_requests: Mutex<HashMap<String, PendingRequest>>,
    approved_project_roots: Mutex<HashMap<String, PathBuf>>,
    lifecycle_lock: Mutex<()>,
    idle_notify: Notify,
    next_generation: AtomicU64,
    next_nonce: AtomicU64,
    restart_count: AtomicU64,
    restart_pending: AtomicBool,
}

impl SidecarSupervisor {
    pub async fn initialize(app: &AppHandle) -> Result<Arc<Self>, SidecarCommandError> {
        let workspace_root = resolve_workspace_root()?;
        let supervisor = Arc::new(Self {
            workspace_root,
            active_runtime: Mutex::new(None),
            pending_requests: Mutex::new(HashMap::new()),
            approved_project_roots: Mutex::new(HashMap::new()),
            lifecycle_lock: Mutex::new(()),
            idle_notify: Notify::new(),
            next_generation: AtomicU64::new(1),
            next_nonce: AtomicU64::new(1),
            restart_count: AtomicU64::new(0),
            restart_pending: AtomicBool::new(false),
        });

        let initial_runtime = supervisor.spawn_runtime(app).await?;
        *supervisor.active_runtime.lock().await = Some(initial_runtime);
        Ok(supervisor)
    }

    pub async fn shutdown(&self) {
        let runtime = { self.active_runtime.lock().await.take() };
        if let Some(runtime) = runtime {
            runtime.set_close_reason(RuntimeCloseReason::Shutdown).await;
            if let Some(child) = runtime.take_child().await {
                let _ = child.kill();
            }
        }
    }

    pub async fn desktop_runtime_status(
        &self,
    ) -> Result<DesktopRuntimeStatus, SidecarCommandError> {
        let runtime = self.get_active_runtime().await;
        let _latest_build_info = self.latest_available_dev_build_info()?;

        Ok(DesktopRuntimeStatus {
            transport: "desktop",
            sidecar_pid: match runtime.as_ref() {
                Some(runtime) => runtime.pid().await,
                None => None,
            },
            runtime_generation: runtime.as_ref().map_or(0, |runtime| runtime.generation),
            build_fingerprint: runtime.as_ref().and_then(|runtime| {
                runtime
                    .build_info
                    .as_ref()
                    .map(|info| info.fingerprint.clone())
            }),
            restart_count: self.restart_count.load(Ordering::SeqCst),
            restart_pending: self.restart_pending.load(Ordering::SeqCst),
        })
    }

    pub async fn perform_trusted_request(
        self: &Arc<Self>,
        app: AppHandle,
        request: SidecarRequest,
    ) -> Result<Value, SidecarCommandError> {
        self.handle_request(app, request, Channel::new(|_| Ok(()))).await
    }
}

fn resolve_workspace_root() -> Result<PathBuf, SidecarCommandError> {
    std::env::current_dir().map_err(to_command_error)
}

fn serialize_request(request: &SidecarRequest) -> Result<Vec<u8>, SidecarCommandError> {
    let mut payload = serde_json::to_vec(request).map_err(to_command_error)?;
    payload.push(b'\n');
    Ok(payload)
}
