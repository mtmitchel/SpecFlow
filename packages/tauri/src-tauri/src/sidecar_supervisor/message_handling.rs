use std::sync::Arc;

use serde_json::Value;
use tauri::{AppHandle, Emitter};

use super::runtime::{RuntimeGeneration, SidecarMessage};
use super::SidecarSupervisor;

impl SidecarSupervisor {
    pub(crate) async fn handle_sidecar_message(
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
                    let payload = match notification.payload.clone() {
                        Value::Object(mut object) => {
                            object.insert(
                                "requestId".into(),
                                notification
                                    .request_id
                                    .as_ref()
                                    .map(|value| Value::String(value.clone()))
                                    .unwrap_or(Value::Null),
                            );
                            object.insert(
                                "correlationId".into(),
                                notification
                                    .request_id
                                    .as_ref()
                                    .map(|value| Value::String(value.clone()))
                                    .unwrap_or(Value::Null),
                            );
                            Value::Object(object)
                        }
                        other => serde_json::json!({
                            "reason": notification.event,
                            "payload": other,
                            "requestId": notification.request_id,
                            "correlationId": notification.request_id
                        }),
                    };

                    let _ = app.emit("artifacts-changed", payload);
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
}
