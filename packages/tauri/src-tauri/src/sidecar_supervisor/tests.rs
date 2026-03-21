use super::build::DevBuildInfo;
use super::runtime::RuntimeGeneration;
use super::{cancelled_error, PendingRequest, SidecarSupervisor};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::Channel;
use tokio::sync::{oneshot, Mutex, Notify};

fn test_supervisor() -> Arc<SidecarSupervisor> {
    Arc::new(SidecarSupervisor {
        workspace_root: PathBuf::from("/tmp"),
        active_runtime: Mutex::new(None),
        pending_requests: Mutex::new(HashMap::new()),
        approved_project_roots: Mutex::new(HashMap::new()),
        lifecycle_lock: Mutex::new(()),
        idle_notify: Notify::new(),
        next_generation: AtomicU64::new(1),
        next_nonce: AtomicU64::new(1),
        restart_count: AtomicU64::new(0),
        restart_pending: AtomicBool::new(false),
    })
}

#[tokio::test(flavor = "current_thread")]
async fn handle_cancel_clears_pending_request_before_dispatch() {
    let supervisor = test_supervisor();
    let (tx, rx) = oneshot::channel();

    supervisor.pending_requests.lock().await.insert(
        "req-1".into(),
        PendingRequest {
            tx,
            on_event: Channel::new(|_| Ok(())),
            runtime_generation: None,
            method: "config.save".into(),
        },
    );

    supervisor.handle_cancel("req-1".into()).await.unwrap();

    let result = rx.await.unwrap().unwrap_err();
    assert_eq!(result.code, cancelled_error().code);
    assert!(!supervisor
        .pending_requests
        .lock()
        .await
        .contains_key("req-1"));
}

#[tokio::test(flavor = "current_thread")]
async fn wait_for_runtime_drain_returns_after_notify() {
    let supervisor = test_supervisor();
    let runtime = Arc::new(RuntimeGeneration {
        generation: 1,
        build_info: Some(DevBuildInfo {
            fingerprint: "1:test.js".into(),
            latest_path: "test.js".into(),
            latest_mtime_ms: 1,
        }),
        child: Mutex::new(None),
        inflight_request_ids: Mutex::new(HashSet::from(["req-1".into()])),
        close_reason: Mutex::new(None),
    });

    let runtime_for_task = runtime.clone();
    let supervisor_for_task = supervisor.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(20)).await;
        assert!(runtime_for_task.detach_request("req-1").await);
        supervisor_for_task.idle_notify.notify_waiters();
    });

    supervisor
        .wait_for_runtime_drain(&runtime, Duration::from_secs(1))
        .await
        .expect("runtime should drain");
}

#[tokio::test(flavor = "current_thread")]
async fn approved_project_roots_round_trip_through_tokens() {
    let supervisor = test_supervisor();
    let selection = supervisor
        .approve_project_root(PathBuf::from("/tmp/specflow-project"))
        .await;

    let resolved = supervisor
        .resolve_approved_project_root(&selection.token)
        .await
        .expect("approved path should resolve");

    assert_eq!(resolved, "/tmp/specflow-project");
    assert_eq!(selection.display_path, "/tmp/specflow-project");
}
