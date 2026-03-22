use std::env;

use serde_json::Value;

pub(super) fn log_observability_event(event: &str, payload: Value) {
    if env::var("SPECFLOW_DEBUG_OBSERVABILITY")
        .map(|value| value == "1")
        .unwrap_or(false)
    {
        eprintln!(
            "{}",
            serde_json::json!({
                "layer": "desktop-bridge",
                "event": event,
                "payload": payload
            })
        );
    }
}
