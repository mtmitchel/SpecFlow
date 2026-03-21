mod sidecar_supervisor;

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_shell::ShellExt;
use tokio::task;

use sidecar_supervisor::{
    bad_request, ApprovedPathSelection, DesktopRuntimeStatus, SavedBundleZip,
    SidecarCommandError, SidecarRequest, SidecarSupervisor,
};

#[tauri::command]
async fn sidecar_request(
    app: AppHandle,
    supervisor: State<'_, Arc<SidecarSupervisor>>,
    request: SidecarRequest,
    on_event: Channel<Value>,
) -> Result<Value, SidecarCommandError> {
    let request = normalize_renderer_request(supervisor.inner().as_ref(), request).await?;
    supervisor.handle_request(app, request, on_event).await
}

#[tauri::command]
async fn sidecar_cancel(
    supervisor: State<'_, Arc<SidecarSupervisor>>,
    request_id: String,
) -> Result<(), SidecarCommandError> {
    supervisor.handle_cancel(request_id).await
}

#[tauri::command]
async fn desktop_runtime_status(
    supervisor: State<'_, Arc<SidecarSupervisor>>,
) -> Result<DesktopRuntimeStatus, SidecarCommandError> {
    supervisor.desktop_runtime_status().await
}

#[tauri::command]
async fn open_external_url(
    app: AppHandle,
    url: String,
) -> Result<(), SidecarCommandError> {
    ensure_safe_external_url(&url)?;
    #[allow(deprecated)]
    app.shell()
        .open(url, None)
        .map_err(sidecar_supervisor::to_command_error)
}

#[tauri::command]
async fn desktop_pick_project_root(
    app: AppHandle,
    supervisor: State<'_, Arc<SidecarSupervisor>>,
    default_path: Option<String>,
) -> Result<Option<ApprovedPathSelection>, SidecarCommandError> {
    let default_directory = default_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    let app_handle = app.clone();
    let selected_path = task::spawn_blocking(move || {
        let mut dialog = app_handle.dialog().file();
        if let Some(default_directory) = default_directory {
            dialog = dialog.set_directory(default_directory);
        }

        dialog
            .blocking_pick_folder()
            .and_then(|selection| selection.into_path().ok())
    })
    .await
    .map_err(sidecar_supervisor::to_command_error)?;

    match selected_path {
        Some(path) => Ok(Some(supervisor.approve_project_root(path).await)),
        None => Ok(None),
    }
}

#[tauri::command]
async fn desktop_save_bundle_zip(
    app: AppHandle,
    supervisor: State<'_, Arc<SidecarSupervisor>>,
    run_id: String,
    attempt_id: String,
    default_filename: String,
) -> Result<Option<SavedBundleZip>, SidecarCommandError> {
    let safe_default_filename = sanitize_default_filename(&default_filename);
    let app_handle = app.clone();
    let selected_path = task::spawn_blocking(move || {
        app_handle
            .dialog()
            .file()
            .set_file_name(safe_default_filename)
            .blocking_save_file()
            .and_then(|selection| selection.into_path().ok())
    })
    .await
    .map_err(sidecar_supervisor::to_command_error)?;

    let Some(destination_path) = selected_path else {
        return Ok(None);
    };

    let request = SidecarRequest {
        id: supervisor.next_internal_request_id("desktop-bundle-save"),
        method: "runs.saveBundleZip".into(),
        params: Some(serde_json::json!({
            "runId": run_id,
            "attemptId": attempt_id,
            "destinationPath": destination_path.display().to_string()
        })),
    };

    let result = supervisor.perform_trusted_request(app, request).await?;
    let payload = serde_json::from_value::<SavedBundleZip>(result)
        .map_err(sidecar_supervisor::to_command_error)?;
    Ok(Some(payload))
}

async fn normalize_renderer_request(
    supervisor: &SidecarSupervisor,
    mut request: SidecarRequest,
) -> Result<SidecarRequest, SidecarCommandError> {
    let request_id = request.id.trim();
    if request_id.is_empty() {
        return Err(bad_request("Request id is required"));
    }
    if request_id.len() > 160 {
        return Err(bad_request("Request id is too long"));
    }
    request.id = request_id.to_string();

    let method = request.method.trim();
    if method.is_empty() {
        return Err(bad_request("Request method is required"));
    }
    if !sidecar_supervisor::is_allowed_renderer_method(method) {
        return Err(bad_request(format!(
            "Desktop bridge method is not allowed: {method}"
        )));
    }
    request.method = method.to_string();

    if request
        .params
        .as_ref()
        .is_some_and(|params| !params.is_object())
    {
        return Err(bad_request("Request params must be an object"));
    }

    match request.method.as_str() {
        "initiatives.create" => {
            let body = get_request_body_mut(&mut request)?;
            let project_root_token = body
                .get("projectRootToken")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| {
                    bad_request(
                        "Choose a project folder before starting the project.",
                    )
                })?;

            if body
                .get("projectRoot")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.trim().is_empty())
            {
                return Err(bad_request(
                    "Desktop project creation requires an approved project folder selection.",
                ));
            }

            let approved_project_root = supervisor
                .resolve_approved_project_root(project_root_token)
                .await?;
            body.insert("projectRoot".into(), Value::String(approved_project_root));
            body.remove("projectRootToken");
        }
        "runs.saveBundleZip" => {
            return Err(bad_request(
                "Desktop bundle export must use the native save flow.",
            ));
        }
        _ => {}
    }

    Ok(request)
}

fn get_request_body_mut(
    request: &mut SidecarRequest,
) -> Result<&mut serde_json::Map<String, Value>, SidecarCommandError> {
    request
        .params
        .as_mut()
        .and_then(Value::as_object_mut)
        .and_then(|params| params.get_mut("body"))
        .and_then(Value::as_object_mut)
        .ok_or_else(|| bad_request("Request body is required"))
}

fn sanitize_default_filename(default_filename: &str) -> String {
    PathBuf::from(default_filename)
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or("bundle.zip")
        .to_string()
}

fn ensure_safe_external_url(url: &str) -> Result<(), SidecarCommandError> {
    let trimmed = url.trim();
    if trimmed.starts_with("https://")
        || trimmed.starts_with("http://")
        || trimmed.starts_with("mailto:")
    {
        return Ok(());
    }

    Err(bad_request("Unsupported external link"))
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let supervisor = SidecarSupervisor::initialize(&handle).await?;
                handle.manage(supervisor);
                Ok::<(), SidecarCommandError>(())
            })
            .map_err(|error| std::io::Error::other(error.message))?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            sidecar_request,
            sidecar_cancel,
            desktop_runtime_status,
            desktop_pick_project_root,
            desktop_save_bundle_zip,
            open_external_url
        ])
        .build(tauri::generate_context!())
        .expect("error while building SpecFlow desktop");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(supervisor) = app_handle.try_state::<Arc<SidecarSupervisor>>() {
                tauri::async_runtime::block_on(supervisor.shutdown());
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{ensure_safe_external_url, sanitize_default_filename};

    #[test]
    fn strips_directory_segments_from_default_filenames() {
        assert_eq!(sanitize_default_filename("../bundle.zip"), "bundle.zip");
        assert_eq!(sanitize_default_filename("nested/export.zip"), "export.zip");
        assert_eq!(sanitize_default_filename(""), "bundle.zip");
    }

    #[test]
    fn only_allows_safe_external_link_protocols() {
        assert!(ensure_safe_external_url("https://example.com").is_ok());
        assert!(ensure_safe_external_url("mailto:test@example.com").is_ok());
        assert!(ensure_safe_external_url("javascript:alert(1)").is_err());
        assert!(ensure_safe_external_url("file:///tmp/test").is_err());
    }
}
