use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::time::timeout;

use super::build::{
    available_dev_build_info, resolve_dev_build_root, resolve_dev_sidecar_path,
    wait_for_dev_build_info, DevBuildInfo,
};
use super::log_observability_event;
use super::runtime::{RuntimeCloseReason, RuntimeGeneration, SidecarMessage};
use super::{closed_error, to_command_error, SidecarCommandError, SidecarSupervisor};

impl SidecarSupervisor {
    pub(crate) async fn ensure_runtime_ready(
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
                .wait_for_runtime_drain(&active_runtime, super::methods::pending_request_ttl(method))
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

    pub(crate) async fn spawn_runtime(
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

    pub(crate) async fn handle_runtime_terminated(
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

    async fn fail_runtime_requests(
        &self,
        runtime: &RuntimeGeneration,
        error: SidecarCommandError,
    ) {
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
            log_observability_event(
                "request.fail-runtime",
                serde_json::json!({
                    "requestId": request_id,
                    "method": pending.method,
                    "code": error.code.clone()
                }),
            );
            let _ = pending.tx.send(Err(error.clone()));
            self.finish_runtime_request(runtime, &request_id).await;
        }
    }

    pub(crate) async fn wait_for_runtime_drain(
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

    pub(crate) async fn get_active_runtime(&self) -> Option<Arc<RuntimeGeneration>> {
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

    pub(crate) async fn wait_for_latest_dev_build_info(
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

    pub(crate) fn latest_available_dev_build_info(
        &self,
    ) -> Result<Option<DevBuildInfo>, SidecarCommandError> {
        if !cfg!(debug_assertions) {
            return Ok(None);
        }

        let build_root = resolve_dev_build_root().map_err(to_command_error)?;
        available_dev_build_info(&build_root, &self.workspace_root).map_err(to_command_error)
    }
}
