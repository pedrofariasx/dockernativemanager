/*
 * File: system.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
 * Modified By: Pedro Farias
 * 
 */

use crate::models::SystemInfo;
use crate::utils::{get_docker, IS_STOPPED_INTENTIONALLY};
use std::sync::atomic::Ordering;

#[tauri::command]
pub async fn get_system_info() -> Result<SystemInfo, String> {
    let docker = get_docker()?;
    let info = docker.info().await.map_err(|e| e.to_string())?;
    let version = docker.version().await.map_err(|e| e.to_string())?;

    Ok(SystemInfo {
        containers: info.containers.unwrap_or(0) as usize,
        containers_running: info.containers_running.unwrap_or(0) as usize,
        containers_paused: info.containers_paused.unwrap_or(0) as usize,
        containers_stopped: info.containers_stopped.unwrap_or(0) as usize,
        images: info.images.unwrap_or(0) as usize,
        version: version.version.unwrap_or_default(),
        operating_system: info.operating_system.unwrap_or_default(),
        kernel_version: info.kernel_version.unwrap_or_default(),
        storage_driver: info.driver.unwrap_or_default(),
        logging_driver: info.logging_driver.unwrap_or_default(),
        architecture: info.architecture.unwrap_or_default(),
        ncpu: info.ncpu.unwrap_or(0),
        mem_total: info.mem_total.unwrap_or(0),
    })
}

#[tauri::command]
pub async fn docker_system_prune() -> Result<String, String> {
    let output = std::process::Command::new("docker")
        .arg("system")
        .arg("prune")
        .arg("-f")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn manage_docker_service(action: String) -> Result<String, String> {
    let full_cmd = match action.as_str() {
        "stop" => {
            IS_STOPPED_INTENTIONALLY.store(true, Ordering::SeqCst);
            "systemctl stop docker.socket docker.service"
        },
        "start" => {
            IS_STOPPED_INTENTIONALLY.store(false, Ordering::SeqCst);
            "systemctl start docker.socket docker.service"
        },
        "restart" => {
            IS_STOPPED_INTENTIONALLY.store(false, Ordering::SeqCst);
            "systemctl restart docker.service"
        },
        "reconnect" => {
            IS_STOPPED_INTENTIONALLY.store(false, Ordering::SeqCst);
            return Ok("Reconnection logic triggered".into());
        },
        _ => return Err("Invalid action".to_string()),
    };

    let output = std::process::Command::new("pkexec")
        .arg("sh")
        .arg("-c")
        .arg(full_cmd)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        if stderr.is_empty() {
            return Err(format!("Failed to {} Docker service", action));
        }
        return Err(stderr);
    }

    Ok(format!("Docker service {}ed successfully", action))
}
