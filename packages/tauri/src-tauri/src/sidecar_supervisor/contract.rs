use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Serialize, Deserialize)]
pub struct SidecarRequest {
    pub id: String,
    pub method: String,
    pub params: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SidecarCommandError {
    pub code: String,
    pub message: String,
    #[serde(rename = "statusCode")]
    pub status_code: u16,
    pub details: Option<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeStatus {
    pub(crate) transport: &'static str,
    pub(crate) sidecar_pid: Option<u32>,
    pub(crate) runtime_generation: u64,
    pub(crate) build_fingerprint: Option<String>,
    pub(crate) latest_build_path: Option<String>,
    pub(crate) restart_count: u64,
    pub(crate) restart_pending: bool,
}

pub(crate) fn closed_error() -> SidecarCommandError {
    SidecarCommandError {
        code: "Sidecar Closed".into(),
        message: "The SpecFlow sidecar closed before replying".into(),
        status_code: 500,
        details: None,
    }
}

pub(crate) fn timeout_error() -> SidecarCommandError {
    SidecarCommandError {
        code: "Request Timeout".into(),
        message: "The SpecFlow sidecar request exceeded the pending timeout".into(),
        status_code: 504,
        details: None,
    }
}

pub(crate) fn cancelled_error() -> SidecarCommandError {
    SidecarCommandError {
        code: "Request Cancelled".into(),
        message: "Request cancelled".into(),
        status_code: 499,
        details: None,
    }
}

pub(crate) fn to_command_error(error: impl ToString) -> SidecarCommandError {
    SidecarCommandError {
        code: "Desktop Bridge Error".into(),
        message: error.to_string(),
        status_code: 500,
        details: None,
    }
}
