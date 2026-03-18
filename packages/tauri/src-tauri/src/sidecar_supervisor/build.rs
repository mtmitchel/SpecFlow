use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::time::{sleep, Instant};

pub const DEV_BUILD_WAIT_TIMEOUT: Duration = Duration::from_secs(20);
pub const DEV_BUILD_POLL_INTERVAL: Duration = Duration::from_millis(100);
const DEV_BUILD_SETTLE_WINDOW: Duration = Duration::from_millis(350);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DevBuildInfo {
    pub fingerprint: String,
    pub latest_path: String,
    pub latest_mtime_ms: u64,
}

pub fn resolve_dev_sidecar_path() -> Result<PathBuf, String> {
    Ok(resolve_dev_build_root()?.join("sidecar.js"))
}

pub fn resolve_dev_build_root() -> Result<PathBuf, String> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    Ok(manifest_dir
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .ok_or_else(|| "Failed to resolve workspace root".to_string())?
        .join("packages")
        .join("app")
        .join("dist"))
}

pub async fn wait_for_dev_build_info(
    build_root: &Path,
    workspace_root: &Path,
) -> Result<Option<DevBuildInfo>, String> {
    if !cfg!(debug_assertions) {
        return Ok(None);
    }

    let deadline = Instant::now() + DEV_BUILD_WAIT_TIMEOUT;
    loop {
        match available_dev_build_info(build_root, workspace_root) {
            Ok(Some(info)) if build_has_settled(&info) => {
                return Ok(Some(info));
            }
            Ok(_) => {}
            Err(error) => {
                return Err(format!(
                    "Failed to inspect dev sidecar build under {}: {error}",
                    build_root.display()
                ));
            }
        }

        if Instant::now() >= deadline {
            return Err(format!(
                "Timed out waiting for a fresh dev sidecar build under {}",
                build_root.display()
            ));
        }

        sleep(DEV_BUILD_POLL_INTERVAL).await;
    }
}

pub fn available_dev_build_info(
    build_root: &Path,
    workspace_root: &Path,
) -> std::io::Result<Option<DevBuildInfo>> {
    let mut files = Vec::new();
    collect_js_files(build_root, &mut files)?;
    let Some((latest_path, latest_mtime)) = files.into_iter().max_by_key(|(_, modified)| {
        modified
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
    }) else {
        return Ok(None);
    };

    let latest_mtime_ms = latest_mtime
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let relative_path = latest_path
        .strip_prefix(workspace_root)
        .unwrap_or(latest_path.as_path())
        .to_string_lossy()
        .replace('\\', "/");

    Ok(Some(DevBuildInfo {
        fingerprint: format!("{latest_mtime_ms}:{relative_path}"),
        latest_path: relative_path,
        latest_mtime_ms,
    }))
}

fn collect_js_files(dir: &Path, files: &mut Vec<(PathBuf, SystemTime)>) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            collect_js_files(&path, files)?;
            continue;
        }

        if path.extension().and_then(|ext| ext.to_str()) != Some("js") {
            continue;
        }

        let modified = entry.metadata()?.modified()?;
        files.push((path, modified));
    }

    Ok(())
}

fn build_has_settled(info: &DevBuildInfo) -> bool {
    latest_mtime(info)
        .and_then(|mtime| SystemTime::now().duration_since(mtime).ok())
        .is_some_and(|age| age >= DEV_BUILD_SETTLE_WINDOW)
}

fn latest_mtime(info: &DevBuildInfo) -> Option<SystemTime> {
    UNIX_EPOCH.checked_add(Duration::from_millis(info.latest_mtime_ms))
}

#[cfg(test)]
mod tests {
    use super::{available_dev_build_info, collect_js_files};
    use std::env::temp_dir;
    use std::fs::{create_dir_all, remove_dir_all, write};
    use std::path::PathBuf;
    use std::thread;
    use std::time::Duration;

    fn temp_path(name: &str) -> PathBuf {
        temp_dir().join(format!(
            "specflow-sidecar-build-{name}-{}",
            std::process::id()
        ))
    }

    #[test]
    fn collects_js_files_recursively() {
        let root = temp_path("collect");
        let nested = root.join("nested");
        create_dir_all(&nested).unwrap();
        write(root.join("a.js"), "a").unwrap();
        write(nested.join("b.js"), "b").unwrap();
        write(nested.join("ignore.txt"), "x").unwrap();

        let mut files = Vec::new();
        collect_js_files(&root, &mut files).unwrap();
        assert_eq!(files.len(), 2);

        remove_dir_all(root).unwrap();
    }

    #[test]
    fn latest_build_info_prefers_newest_js_file() {
        let workspace = temp_path("latest");
        let build_root = workspace.join("packages/app/dist/planner");
        create_dir_all(&build_root).unwrap();

        write(workspace.join("packages/app/dist/sidecar.js"), "old").unwrap();
        thread::sleep(Duration::from_millis(20));
        write(build_root.join("brief-consultation.js"), "new").unwrap();

        let info = available_dev_build_info(&workspace.join("packages/app/dist"), &workspace)
            .unwrap()
            .unwrap();
        assert!(info
            .latest_path
            .ends_with("packages/app/dist/planner/brief-consultation.js"));

        remove_dir_all(workspace).unwrap();
    }
}
