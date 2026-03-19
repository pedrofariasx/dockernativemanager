/*
 * File: utils.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::Docker;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::mpsc;

pub static IS_STOPPED_INTENTIONALLY: AtomicBool = AtomicBool::new(false);

pub type TerminalSenders = Mutex<HashMap<String, mpsc::Sender<String>>>;

pub fn get_docker() -> Result<Docker, String> {
    if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
        return Err("Docker is intentionally stopped".into());
    }

    // Get the current context's endpoint
    let output = std::process::Command::new("docker")
        .args(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
        .output()
        .map_err(|e| format!("Failed to get docker context: {}", e))?;

    if !output.status.success() {
        // Fallback to local defaults if context command fails
        return Docker::connect_with_local_defaults().map_err(|e| e.to_string());
    }

    let host = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if host.is_empty() || host.starts_with("unix://") || host.starts_with("/") {
        Docker::connect_with_local_defaults().map_err(|e| e.to_string())
    } else if host.starts_with("ssh://") {
        // Bollard doesn't support SSH directly in a simple way without external setup
        // For now, we'll try to connect with HTTP/TCP if it's a TCP endpoint
        // but many contexts use custom endpoints.
        // A better approach for full support would be connect_with_http_defaults if it looks like TCP
        Docker::connect_with_http_defaults().map_err(|e| e.to_string())
    } else if host.starts_with("tcp://") {
        let addr = host.trim_start_matches("tcp://");
        Docker::connect_with_http(addr, 120, bollard::API_DEFAULT_VERSION).map_err(|e| e.to_string())
    } else {
        // Generic fallback
        Docker::connect_with_local_defaults().map_err(|e| e.to_string())
    }
}
