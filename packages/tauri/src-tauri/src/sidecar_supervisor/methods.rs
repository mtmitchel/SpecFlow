use std::collections::HashSet;
use std::sync::LazyLock;
use std::time::Duration;

use serde::Deserialize;

const DEFAULT_PENDING_REQUEST_TTL: Duration = Duration::from_secs(330);
const LONG_PENDING_REQUEST_TTL: Duration = Duration::from_secs(630);

#[derive(Deserialize)]
struct SidecarMethodCatalog {
    #[serde(rename = "longRunningMethods")]
    long_running_methods: Vec<String>,
}

static LONG_RUNNING_METHODS: LazyLock<HashSet<String>> = LazyLock::new(|| {
    let catalog: SidecarMethodCatalog = serde_json::from_str(include_str!(
        "../../../../app/src/sidecar/method-catalog.json"
    ))
    .expect("sidecar method catalog should parse");

    catalog.long_running_methods.into_iter().collect()
});

pub(super) fn uses_long_pending_timeout(method: &str) -> bool {
    LONG_RUNNING_METHODS.contains(method)
}

pub(super) fn pending_request_ttl(method: &str) -> Duration {
    if uses_long_pending_timeout(method) {
        LONG_PENDING_REQUEST_TTL
    } else {
        DEFAULT_PENDING_REQUEST_TTL
    }
}

#[cfg(test)]
mod tests {
    use super::{pending_request_ttl, uses_long_pending_timeout};
    use std::time::Duration;

    #[test]
    fn uses_shared_long_running_catalog() {
        assert!(uses_long_pending_timeout("initiatives.generate.prd"));
        assert!(uses_long_pending_timeout("tickets.captureResults"));
        assert!(!uses_long_pending_timeout("artifacts.snapshot"));
    }

    #[test]
    fn keeps_short_and_long_ttls_distinct() {
        assert_eq!(
            pending_request_ttl("artifacts.snapshot"),
            Duration::from_secs(330)
        );
        assert_eq!(
            pending_request_ttl("tickets.exportBundle"),
            Duration::from_secs(630)
        );
    }
}
