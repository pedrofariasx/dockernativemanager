/*
 * File: system.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Thu Mar 19 2026
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

#[tauri::command]
pub async fn list_docker_contexts() -> Result<Vec<crate::models::DockerContextInfo>, String> {
    let output = std::process::Command::new("docker")
        .args(["context", "ls", "--format", "{{json .}}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut contexts = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() { continue; }
        let v: serde_json::Value = serde_json::from_str(line).map_err(|e| e.to_string())?;
        
        contexts.push(crate::models::DockerContextInfo {
            name: v["Name"].as_str().unwrap_or_default().to_string(),
            description: v["Description"].as_str().unwrap_or_default().to_string(),
            docker_endpoint: v["DockerEndpoint"].as_str().unwrap_or_default().to_string(),
            is_active: v["Current"].as_bool().unwrap_or(false),
        });
    }

    Ok(contexts)
}

#[tauri::command]
pub async fn use_docker_context(name: String) -> Result<(), String> {
    let output = std::process::Command::new("docker")
        .args(["context", "use", &name])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn create_docker_context(name: String, host: String) -> Result<(), String> {
    let output = std::process::Command::new("docker")
        .args(["context", "create", &name, "--docker", &format!("host={}", host)])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_docker_context(name: String) -> Result<(), String> {
    if name == "default" {
        return Err("Cannot remove default context".to_string());
    }

    let output = std::process::Command::new("docker")
        .args(["context", "rm", &name])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}
