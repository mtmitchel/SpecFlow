use std::sync::atomic::Ordering;

use super::{bad_request, ApprovedPathSelection, SidecarCommandError, SidecarSupervisor};

impl SidecarSupervisor {
    pub async fn approve_project_root(
        &self,
        path: std::path::PathBuf,
    ) -> ApprovedPathSelection {
        let token = format!(
            "project-root-{:016x}",
            self.next_nonce.fetch_add(1, Ordering::SeqCst)
        );
        let display_path = path.display().to_string();
        self.approved_project_roots
            .lock()
            .await
            .insert(token.clone(), path);

        ApprovedPathSelection {
            token,
            display_path,
        }
    }

    pub async fn resolve_approved_project_root(
        &self,
        token: &str,
    ) -> Result<String, SidecarCommandError> {
        let approved_roots = self.approved_project_roots.lock().await;
        let Some(path) = approved_roots.get(token) else {
            return Err(bad_request(
                "Choose the project folder again before starting the project.",
            ));
        };

        Ok(path.display().to_string())
    }

    pub fn next_internal_request_id(&self, prefix: &str) -> String {
        format!(
            "{prefix}-{:016x}",
            self.next_nonce.fetch_add(1, Ordering::SeqCst)
        )
    }
}
