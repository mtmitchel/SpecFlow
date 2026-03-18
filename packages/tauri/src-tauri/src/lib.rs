mod sidecar_supervisor;

use std::sync::Arc;

use serde_json::Value;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};

use sidecar_supervisor::{
    DesktopRuntimeStatus, SidecarCommandError, SidecarRequest, SidecarSupervisor,
};

#[tauri::command]
async fn sidecar_request(
    app: AppHandle,
    supervisor: State<'_, Arc<SidecarSupervisor>>,
    request: SidecarRequest,
    on_event: Channel<Value>,
) -> Result<Value, SidecarCommandError> {
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
            desktop_runtime_status
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
