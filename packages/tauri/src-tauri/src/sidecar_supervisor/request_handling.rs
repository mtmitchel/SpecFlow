use std::sync::Arc;
use std::time::Instant;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio::time::sleep;

use super::methods::pending_request_ttl;
use super::{
    cancelled_error, closed_error, log_observability_event, serialize_request, timeout_error,
    PendingRequest, SidecarCommandError, SidecarRequest, SidecarSupervisor,
};

impl SidecarSupervisor {
    pub async fn handle_request(
        self: &Arc<Self>,
        app: AppHandle,
        request: SidecarRequest,
        on_event: Channel<Value>,
    ) -> Result<Value, SidecarCommandError> {
        let started_at = Instant::now();
        let payload = serialize_request(&request)?;
        let (tx, rx) = oneshot::channel();

        self.pending_requests.lock().await.insert(
            request.id.clone(),
            PendingRequest {
                tx,
                on_event,
                runtime_generation: None,
                method: request.method.clone(),
            },
        );

        log_observability_event(
            "request.start",
            serde_json::json!({
                "requestId": request.id,
                "method": request.method
            }),
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
            Ok(result) => {
                let status = if result.is_ok() { "ok" } else { "error" };
                log_observability_event(
                    "request.finish",
                    serde_json::json!({
                        "requestId": request.id,
                        "method": request.method,
                        "status": status,
                        "durationMs": started_at.elapsed().as_millis()
                    }),
                );
                result
            }
            Err(_) => {
                let _ = app.emit(
                    "artifacts-changed",
                    serde_json::json!({ "reason": "sidecar-disconnect" }),
                );
                log_observability_event(
                    "request.finish",
                    serde_json::json!({
                        "requestId": request.id,
                        "method": request.method,
                        "status": "closed",
                        "durationMs": started_at.elapsed().as_millis()
                    }),
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

        log_observability_event(
            "request.cancel",
            serde_json::json!({
                "requestId": request_id,
                "method": pending.method
            }),
        );
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
            log_observability_event(
                "request.timeout",
                serde_json::json!({
                    "requestId": request_id,
                    "method": pending.method
                }),
            );
            if let Some(generation) = pending.runtime_generation {
                self.finish_runtime_request_by_generation(generation, request_id)
                    .await;
            }
            let _ = pending.tx.send(Err(timeout_error()));
        }
    }

    async fn dispatch_request(
        &self,
        runtime: Arc<super::runtime::RuntimeGeneration>,
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

    async fn fail_pending_request(&self, request_id: &str, error: SidecarCommandError) {
        let pending = {
            let mut pending = self.pending_requests.lock().await;
            pending.remove(request_id)
        };

        if let Some(pending) = pending {
            log_observability_event(
                "request.fail-dispatch",
                serde_json::json!({
                    "requestId": request_id,
                    "method": pending.method,
                    "code": error.code.clone()
                }),
            );
            if let Some(generation) = pending.runtime_generation {
                self.finish_runtime_request_by_generation(generation, request_id)
                    .await;
            }
            let _ = pending.tx.send(Err(error));
        }
    }

    pub(super) async fn finish_runtime_request(
        &self,
        runtime: &super::runtime::RuntimeGeneration,
        request_id: &str,
    ) {
        let became_idle = runtime.detach_request(request_id).await;
        if became_idle {
            self.idle_notify.notify_waiters();
        }
    }

    pub(super) async fn finish_runtime_request_by_generation(
        &self,
        generation: u64,
        request_id: &str,
    ) {
        if let Some(runtime) = self.get_active_runtime().await {
            if runtime.generation == generation {
                self.finish_runtime_request(&runtime, request_id).await;
            }
        }
    }
}
