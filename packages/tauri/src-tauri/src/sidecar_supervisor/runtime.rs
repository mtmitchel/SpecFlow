use std::collections::HashSet;

use serde::Deserialize;
use serde_json::Value;
use tauri_plugin_shell::process::CommandChild;
use tokio::sync::Mutex;

use super::build::DevBuildInfo;
use super::SidecarCommandError;

#[derive(Debug, Deserialize)]
#[serde(untagged)]
pub enum SidecarMessage {
    Success(SidecarSuccess),
    Failure(SidecarFailure),
    Notification(SidecarNotification),
}

#[derive(Debug, Deserialize)]
pub struct SidecarNotification {
    pub event: String,
    #[serde(rename = "requestId")]
    pub request_id: Option<String>,
    pub payload: Value,
}

#[derive(Debug, Deserialize)]
pub struct SidecarSuccess {
    pub id: String,
    #[serde(rename = "ok")]
    pub _ok: bool,
    pub result: Value,
}

#[derive(Debug, Deserialize)]
pub struct SidecarFailure {
    pub id: String,
    #[serde(rename = "ok")]
    pub _ok: bool,
    pub error: SidecarCommandError,
}

pub(crate) enum RuntimeCloseReason {
    Restart,
    Shutdown,
}

pub(crate) struct RuntimeGeneration {
    pub(crate) generation: u64,
    pub(crate) build_info: Option<DevBuildInfo>,
    pub(crate) child: Mutex<Option<CommandChild>>,
    pub(crate) inflight_request_ids: Mutex<HashSet<String>>,
    pub(crate) close_reason: Mutex<Option<RuntimeCloseReason>>,
}

impl RuntimeGeneration {
    pub(crate) fn new(
        generation: u64,
        build_info: Option<DevBuildInfo>,
        child: CommandChild,
    ) -> Self {
        Self {
            generation,
            build_info,
            child: Mutex::new(Some(child)),
            inflight_request_ids: Mutex::new(HashSet::new()),
            close_reason: Mutex::new(None),
        }
    }

    pub(crate) async fn pid(&self) -> Option<u32> {
        let child = self.child.lock().await;
        child.as_ref().map(CommandChild::pid)
    }

    pub(crate) async fn attach_request(&self, request_id: &str) {
        let mut inflight = self.inflight_request_ids.lock().await;
        inflight.insert(request_id.to_string());
    }

    pub(crate) async fn detach_request(&self, request_id: &str) -> bool {
        let mut inflight = self.inflight_request_ids.lock().await;
        inflight.remove(request_id);
        inflight.is_empty()
    }

    pub(crate) async fn inflight_count(&self) -> usize {
        self.inflight_request_ids.lock().await.len()
    }

    pub(crate) async fn set_close_reason(&self, reason: RuntimeCloseReason) {
        let mut close_reason = self.close_reason.lock().await;
        *close_reason = Some(reason);
    }

    pub(crate) async fn take_close_reason(&self) -> Option<RuntimeCloseReason> {
        self.close_reason.lock().await.take()
    }

    pub(crate) async fn take_child(&self) -> Option<CommandChild> {
        self.child.lock().await.take()
    }

    pub(crate) async fn write_request(&self, payload: &[u8]) -> Result<(), SidecarCommandError> {
        let mut child = self.child.lock().await;
        let child = child.as_mut().ok_or_else(|| SidecarCommandError {
            code: "Desktop Bridge Error".into(),
            message: "The SpecFlow sidecar is not running".into(),
            status_code: 500,
            details: None,
        })?;
        child.write(payload).map_err(super::to_command_error)
    }
}
