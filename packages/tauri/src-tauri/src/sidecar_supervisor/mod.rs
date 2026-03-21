mod build;
mod contract;
mod methods;
mod runtime;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::{oneshot, Mutex, Notify};
use tokio::time::{sleep, timeout};

use self::build::{
    available_dev_build_info, resolve_dev_build_root, resolve_dev_sidecar_path,
    wait_for_dev_build_info, DevBuildInfo,
};
use self::contract::{cancelled_error, closed_error, timeout_error, to_command_error};
pub use self::contract::{DesktopRuntimeStatus, SidecarCommandError, SidecarRequest};
use self::methods::pending_request_ttl;
use self::runtime::{RuntimeCloseReason, RuntimeGeneration, SidecarMessage};

struct PendingRequest {
    tx: oneshot::Sender<Result<Value, SidecarCommandError>>,
    on_event: Channel<Value>,
    runtime_generation: Option<u64>,
}

pub struct SidecarSupervisor {
    workspace_root: PathBuf,
    active_runtime: Mutex<Option<Arc<RuntimeGeneration>>>,
    pending_requests: Mutex<HashMap<String, PendingRequest>>,
    lifecycle_lock: Mutex<()>,
    idle_notify: Notify,
    next_generation: AtomicU64,
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
            lifecycle_lock: Mutex::new(()),
            idle_notify: Notify::new(),
            next_generation: AtomicU64::new(1),
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

    pub async fn handle_request(
        self: &Arc<Self>,
        app: AppHandle,
        request: SidecarRequest,
        on_event: Channel<Value>,
    ) -> Result<Value, SidecarCommandError> {
        let payload = serialize_request(&request)?;
        let (tx, rx) = oneshot::channel();

        self.pending_requests.lock().await.insert(
            request.id.clone(),
            PendingRequest {
                tx,
                on_event,
                runtime_generation: None,
            },
        );

        self.spawn_timeout_task(request.id.clone(), request.method.clone());

        match self.ensure_runtime_ready(&app, &request.method).await {
            Ok(runtime) => {
                if let Err(error) = self.dispatch_request(runtime, &request.id, &payload).await {
                    self.fail_pending_request(&request.id, error).await;
                }
            }
            Err(error) => {
                self.fail_pending_request(&request.id, error).await;
            }
        }

        match rx.await {
            Ok(result) => result,
            Err(_) => {
                let _ = app.emit(
                    "artifacts-changed",
                    serde_json::json!({ "reason": "sidecar-disconnect" }),
                );
                Err(closed_error())
            }
        }
    }

    pub async fn handle_cancel(&self, request_id: String) -> Result<(), SidecarCommandError> {
        let pending = {
            let mut pending = self.pending_requests.lock().await;
            pending.remove(&request_id)
        };

        let Some(pending) = pending else {
            return Ok(());
        };

        let _ = pending.tx.send(Err(cancelled_error()));
        if let Some(generation) = pending.runtime_generation {
            self.finish_runtime_request_by_generation(generation, &request_id)
                .await;

            if let Some(runtime) = self.get_active_runtime().await {
                if runtime.generation == generation {
                    let cancel_request = SidecarRequest {
                        id: format!("cancel-{request_id}"),
                        method: "runtime.cancel".into(),
                        params: Some(serde_json::json!({ "requestId": request_id })),
                    };
                    let payload = serialize_request(&cancel_request)?;
                    let _ = runtime.write_request(&payload).await;
                }
            }
        }

        Ok(())
    }

    pub async fn desktop_runtime_status(
        &self,
    ) -> Result<DesktopRuntimeStatus, SidecarCommandError> {
        let runtime = self.get_active_runtime().await;
        let latest_build_info = self.latest_available_dev_build_info()?;

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
            latest_build_path: latest_build_info.map(|info| info.latest_path),
            restart_count: self.restart_count.load(Ordering::SeqCst),
            restart_pending: self.restart_pending.load(Ordering::SeqCst),
        })
    }

    fn spawn_timeout_task(self: &Arc<Self>, request_id: String, method: String) {
        let supervisor = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            sleep(pending_request_ttl(&method)).await;
            supervisor.expire_pending_request(&request_id).await;
        });
    }

    async fn expire_pending_request(&self, request_id: &str) {
        let pending = {
            let mut pending = self.pending_requests.lock().await;
            pending.remove(request_id)
        };

        if let Some(pending) = pending {
            if let Some(generation) = pending.runtime_generation {
                self.finish_runtime_request_by_generation(generation, request_id)
                    .await;
            }
            let _ = pending.tx.send(Err(timeout_error()));
        }
    }

    async fn dispatch_request(
        &self,
        runtime: Arc<RuntimeGeneration>,
        request_id: &str,
        payload: &[u8],
    ) -> Result<(), SidecarCommandError> {
        {
            let mut pending = self.pending_requests.lock().await;
            let Some(pending_request) = pending.get_mut(request_id) else {
                return Ok(());
            };
            pending_request.runtime_generation = Some(runtime.generation);
        }

        runtime.attach_request(request_id).await;
        if let Err(error) = runtime.write_request(payload).await {
            let _ = {
                let mut pending = self.pending_requests.lock().await;
                pending.remove(request_id)
            };
            let became_idle = runtime.detach_request(request_id).await;
            if became_idle {
                self.idle_notify.notify_waiters();
            }
            return Err(error);
        }

        Ok(())
    }

    async fn ensure_runtime_ready(
        self: &Arc<Self>,
        app: &AppHandle,
        method: &str,
    ) -> Result<Arc<RuntimeGeneration>, SidecarCommandError> {
        let _lifecycle_guard = self.lifecycle_lock.lock().await;

        let Some(active_runtime) = self.get_active_runtime().await else {
            let runtime = self.spawn_runtime(app).await?;
            *self.active_runtime.lock().await = Some(runtime.clone());
            return Ok(runtime);
        };

        let latest_build_info = self.wait_for_latest_dev_build_info().await?;
        let runtime_missing = active_runtime.pid().await.is_none();
        let build_stale =
            latest_build_info.is_some() && active_runtime.build_info != latest_build_info;

        if runtime_missing {
            let runtime = self.spawn_runtime(app).await?;
            *self.active_runtime.lock().await = Some(runtime.clone());
            return Ok(runtime);
        }

        if !build_stale && !self.restart_pending.load(Ordering::SeqCst) {
            return Ok(active_runtime);
        }

        self.restart_pending.store(true, Ordering::SeqCst);
        if active_runtime.inflight_count().await > 0 {
            if let Err(error) = self
                .wait_for_runtime_drain(&active_runtime, pending_request_ttl(method))
                .await
            {
                self.restart_pending.store(false, Ordering::SeqCst);
                return Err(error);
            }
        }

        let replacement = self.restart_runtime(app, active_runtime).await;
        self.restart_pending.store(false, Ordering::SeqCst);
        replacement
    }

    async fn restart_runtime(
        self: &Arc<Self>,
        app: &AppHandle,
        active_runtime: Arc<RuntimeGeneration>,
    ) -> Result<Arc<RuntimeGeneration>, SidecarCommandError> {
        active_runtime
            .set_close_reason(RuntimeCloseReason::Restart)
            .await;
        if let Some(child) = active_runtime.take_child().await {
            child.kill().map_err(to_command_error)?;
        }

        let replacement = self.spawn_runtime(app).await?;
        *self.active_runtime.lock().await = Some(replacement.clone());
        self.restart_count.fetch_add(1, Ordering::SeqCst);
        let _ = app.emit(
            "artifacts-changed",
            serde_json::json!({ "reason": "sidecar-restart" }),
        );
        Ok(replacement)
    }

    async fn spawn_runtime(
        self: &Arc<Self>,
        app: &AppHandle,
    ) -> Result<Arc<RuntimeGeneration>, SidecarCommandError> {
        let generation = self.next_generation.fetch_add(1, Ordering::SeqCst);
        let build_info = self.wait_for_latest_dev_build_info().await?;
        let sidecar_env = [(
            "SPECFLOW_ROOT_DIR",
            self.workspace_root.to_string_lossy().to_string(),
        )];

        let (mut rx, child) = if cfg!(debug_assertions) {
            let sidecar_path = resolve_dev_sidecar_path().map_err(to_command_error)?;
            if !sidecar_path.is_file() {
                return Err(SidecarCommandError {
                    code: "Desktop Bridge Error".into(),
                    message: format!(
                        "The dev sidecar entrypoint was not built at {}",
                        sidecar_path.display()
                    ),
                    status_code: 500,
                    details: None,
                });
            }

            let command = app
                .shell()
                .command("node")
                .args([sidecar_path.to_string_lossy().to_string()])
                .envs(sidecar_env.clone())
                .current_dir(self.workspace_root.to_string_lossy().to_string());

            command.spawn().map_err(to_command_error)?
        } else {
            let command = app
                .shell()
                .sidecar("specflow-sidecar")
                .map_err(to_command_error)?
                .envs(sidecar_env)
                .current_dir(self.workspace_root.to_string_lossy().to_string());

            command.spawn().map_err(to_command_error)?
        };

        let runtime = Arc::new(RuntimeGeneration::new(generation, build_info, child));
        let runtime_for_task = runtime.clone();
        let supervisor = Arc::clone(self);
        let app_handle = app.clone();

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

                                if let Ok(message) = serde_json::from_str::<SidecarMessage>(trimmed)
                                {
                                    supervisor
                                        .handle_sidecar_message(
                                            &app_handle,
                                            &runtime_for_task,
                                            message,
                                        )
                                        .await;
                                }
                            }
                        }
                    }
                    CommandEvent::Terminated(_) => {
                        supervisor
                            .handle_runtime_terminated(&app_handle, &runtime_for_task)
                            .await;
                        break;
                    }
                    _ => {}
                }
            }
        });

        Ok(runtime)
    }

    async fn handle_sidecar_message(
        &self,
        app: &AppHandle,
        runtime: &Arc<RuntimeGeneration>,
        message: SidecarMessage,
    ) {
        match message {
            SidecarMessage::Success(success) => {
                let pending = {
                    let mut pending = self.pending_requests.lock().await;
                    pending.remove(&success.id)
                };

                if let Some(pending) = pending {
                    let _ = pending.tx.send(Ok(success.result));
                }
                self.finish_runtime_request(runtime, &success.id).await;
            }
            SidecarMessage::Failure(failure) => {
                let pending = {
                    let mut pending = self.pending_requests.lock().await;
                    pending.remove(&failure.id)
                };

                if let Some(pending) = pending {
                    let _ = pending.tx.send(Err(failure.error));
                }
                self.finish_runtime_request(runtime, &failure.id).await;
            }
            SidecarMessage::Notification(notification) => {
                if notification.event == "artifacts.changed" {
                    let _ = app.emit("artifacts-changed", notification.payload.clone());
                }

                if let Some(request_id) = notification.request_id {
                    let pending = self.pending_requests.lock().await;
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

    async fn handle_runtime_terminated(
        self: &Arc<Self>,
        app: &AppHandle,
        runtime: &Arc<RuntimeGeneration>,
    ) {
        let _ = runtime.take_child().await;
        match runtime.take_close_reason().await {
            Some(RuntimeCloseReason::Restart) => {}
            Some(RuntimeCloseReason::Shutdown) => {
                self.clear_active_runtime(runtime.generation).await;
            }
            None => {
                self.clear_active_runtime(runtime.generation).await;
                self.fail_runtime_requests(runtime, closed_error()).await;
                let _ = app.emit(
                    "artifacts-changed",
                    serde_json::json!({ "reason": "sidecar-disconnect" }),
                );
            }
        }
    }

    async fn fail_runtime_requests(&self, runtime: &RuntimeGeneration, error: SidecarCommandError) {
        let failed = {
            let mut pending = self.pending_requests.lock().await;
            let failed_ids = pending
                .iter()
                .filter_map(|(id, pending)| {
                    (pending.runtime_generation == Some(runtime.generation)).then_some(id.clone())
                })
                .collect::<Vec<_>>();

            failed_ids
                .into_iter()
                .filter_map(|id| pending.remove(&id).map(|pending| (id, pending)))
                .collect::<Vec<_>>()
        };

        for (request_id, pending) in failed {
            let _ = pending.tx.send(Err(error.clone()));
            self.finish_runtime_request(runtime, &request_id).await;
        }
    }

    async fn fail_pending_request(&self, request_id: &str, error: SidecarCommandError) {
        let pending = {
            let mut pending = self.pending_requests.lock().await;
            pending.remove(request_id)
        };

        if let Some(pending) = pending {
            if let Some(generation) = pending.runtime_generation {
                self.finish_runtime_request_by_generation(generation, request_id)
                    .await;
            }
            let _ = pending.tx.send(Err(error));
        }
    }

    async fn finish_runtime_request(&self, runtime: &RuntimeGeneration, request_id: &str) {
        let became_idle = runtime.detach_request(request_id).await;
        if became_idle {
            self.idle_notify.notify_waiters();
        }
    }

    async fn finish_runtime_request_by_generation(&self, generation: u64, request_id: &str) {
        if let Some(runtime) = self.get_active_runtime().await {
            if runtime.generation == generation {
                self.finish_runtime_request(&runtime, request_id).await;
            }
        }
    }

    async fn wait_for_runtime_drain(
        &self,
        runtime: &RuntimeGeneration,
        wait_timeout: Duration,
    ) -> Result<(), SidecarCommandError> {
        timeout(wait_timeout, async {
            loop {
                if runtime.inflight_count().await == 0 {
                    return;
                }
                self.idle_notify.notified().await;
            }
        })
        .await
        .map_err(|_| SidecarCommandError {
            code: "Desktop Bridge Error".into(),
            message: "A backend rebuild is waiting for the current sidecar work to finish. Retry once the active request completes.".into(),
            status_code: 409,
            details: None,
        })
    }

    async fn get_active_runtime(&self) -> Option<Arc<RuntimeGeneration>> {
        self.active_runtime.lock().await.clone()
    }

    async fn clear_active_runtime(&self, generation: u64) {
        let mut active_runtime = self.active_runtime.lock().await;
        if active_runtime
            .as_ref()
            .is_some_and(|runtime| runtime.generation == generation)
        {
            *active_runtime = None;
        }
    }

    async fn wait_for_latest_dev_build_info(
        &self,
    ) -> Result<Option<DevBuildInfo>, SidecarCommandError> {
        if !cfg!(debug_assertions) {
            return Ok(None);
        }

        let build_root = resolve_dev_build_root().map_err(to_command_error)?;
        wait_for_dev_build_info(&build_root, &self.workspace_root)
            .await
            .map_err(to_command_error)
    }

    fn latest_available_dev_build_info(&self) -> Result<Option<DevBuildInfo>, SidecarCommandError> {
        if !cfg!(debug_assertions) {
            return Ok(None);
        }

        let build_root = resolve_dev_build_root().map_err(to_command_error)?;
        available_dev_build_info(&build_root, &self.workspace_root).map_err(to_command_error)
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
