/*
 * File: volumes.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 *
 * Last Modified: Wed Apr 15 2026
 * Modified By: Pedro Farias
 *
 */

use crate::models::VolumeInfo;
use crate::utils::get_docker;
use bollard::models::VolumeCreateRequest;
use bollard::query_parameters::{
    DataUsageOptions, ListContainersOptions, ListVolumesOptions, PruneVolumesOptions,
    RemoveVolumeOptions,
};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

#[derive(serde::Serialize)]
pub struct FileEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

fn get_docker_command() -> std::process::Command {
    // Try to get current context
    let output = std::process::Command::new("docker")
        .args(["context", "show"])
        .output();

    let mut cmd = std::process::Command::new("docker");
    if let Ok(out) = output {
        let context = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !context.is_empty() && context != "default" {
            cmd.args(["--context", &context]);
        }
    }
    cmd
}

#[tauri::command]
pub async fn list_volume_files(
    volume_name: String,
    sub_path: String,
) -> Result<Vec<FileEntry>, String> {
    // Always use 'docker run' to list files to ensure consistency
    let target_path = if sub_path == "/" || sub_path.is_empty() {
        "/data".to_string()
    } else {
        format!("/data/{}", sub_path.trim_start_matches('/'))
    };

    let mut cmd = get_docker_command();
    cmd.args([
        "run",
        "--rm",
        "-v",
        &format!("{}:/data", volume_name),
        "alpine",
        "ls",
        "-1p",
        &target_path,
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute docker: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Docker error: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let name = line.trim_end_matches('/');
        let is_dir = line.ends_with('/');

        entries.push(FileEntry {
            name: name.to_string(),
            path: format!("{}/{}", sub_path.trim_end_matches('/'), name)
                .trim_start_matches('/')
                .to_string(),
            is_dir,
            size: 0, // Simplified for now
        });
    }

    Ok(entries)
}

#[tauri::command]
pub async fn read_volume_file(volume_name: String, file_path: String) -> Result<String, String> {
    let mut cmd = get_docker_command();
    cmd.args([
        "run",
        "--rm",
        "-v",
        &format!("{}:/data", volume_name),
        "alpine",
        "cat",
        &format!("/data/{}", file_path.trim_start_matches('/')),
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to read file: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to read file: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn upload_volume_file(
    volume_name: String,
    target_path: String,
    file_content: Vec<u8>,
) -> Result<(), String> {
    // 1. Write content to a temporary file on host
    let temp_dir = std::env::temp_dir();
    let temp_file_name = format!("dnm-upload-{}", uuid::Uuid::new_v4());
    let temp_file_path = temp_dir.join(&temp_file_name);
    fs::write(&temp_file_path, file_content)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;

    // 2. Run a temporary container to facilitate the upload
    let mut cmd = get_docker_command();
    cmd.args([
        "run",
        "-d",
        "--name",
        &temp_file_name,
        "-v",
        &format!("{}:/data", volume_name),
        "alpine",
        "tail",
        "-f",
        "/dev/null",
    ]);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to start temp container: {}", e))?;
    if !output.status.success() {
        let _ = fs::remove_file(&temp_file_path);
        return Err(format!(
            "Failed to start temp container: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    let container_id = temp_file_name;

    // 3. Ensure target directory exists
    let target_dir = Path::new(&target_path).parent().unwrap_or(Path::new("/"));
    let mut mkdir_cmd = get_docker_command();
    mkdir_cmd.args([
        "exec",
        &container_id,
        "mkdir",
        "-p",
        &format!(
            "/data/{}",
            target_dir.to_string_lossy().trim_start_matches('/')
        ),
    ]);
    let _ = mkdir_cmd.output(); // Ignore error if it exists

    // 4. Use docker cp to upload file
    let mut cp_cmd = get_docker_command();
    cp_cmd.args([
        "cp",
        &temp_file_path.to_string_lossy(),
        &format!(
            "{}:/data/{}",
            container_id,
            target_path.trim_start_matches('/')
        ),
    ]);
    let cp_output = cp_cmd
        .output()
        .map_err(|e| format!("Failed to copy file: {}", e))?;

    // 5. Cleanup
    let mut rm_cmd = get_docker_command();
    rm_cmd.args(["rm", "-f", &container_id]);
    let _ = rm_cmd.output();
    let _ = fs::remove_file(&temp_file_path);

    if !cp_output.status.success() {
        return Err(format!(
            "Failed to upload file: {}",
            String::from_utf8_lossy(&cp_output.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_volume_file(volume_name: String, file_path: String) -> Result<(), String> {
    let mut cmd = get_docker_command();
    cmd.args([
        "run",
        "--rm",
        "-v",
        &format!("{}:/data", volume_name),
        "alpine",
        "rm",
        "-rf",
        &format!("/data/{}", file_path.trim_start_matches('/')),
    ]);

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to delete file: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to delete file: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn get_volumes() -> Result<Vec<VolumeInfo>, String> {
    let docker = get_docker().await?;

    let (volumes, df) = tokio::join!(
        docker.list_volumes(None::<ListVolumesOptions>),
        docker.df(None::<DataUsageOptions>),
    );

    let volumes = volumes.map_err(|e| e.to_string())?;
    let df = df.map_err(|e| e.to_string())?;

    // As of newer bollard/Docker API versions, `df.volume_usage` is an aggregate
    // summary object whose per-volume detail lives in `items` as raw JSON
    // (`Vec<serde_json::Value>`) rather than a typed `Vec<Volume>`. We deserialize
    // each item back into a `Volume` ourselves to recover `usage_data`
    // (size / ref_count), which `list_volumes` does not return.
    let usage_by_name: std::collections::HashMap<String, (i64, i64)> = df
        .volume_usage
        .and_then(|vu| vu.items)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| {
            let volume: bollard::models::Volume = serde_json::from_value(item).ok()?;
            let usage = volume.usage_data?;
            Some((volume.name, (usage.size, usage.ref_count)))
        })
        .collect();

    Ok(volumes
        .volumes
        .unwrap_or_default()
        .into_iter()
        .map(|v| {
            let usage = usage_by_name.get(&v.name).copied().unwrap_or((-1, -1));
            VolumeInfo {
                name: v.name,
                driver: v.driver,
                mountpoint: v.mountpoint,
                created_at: v
                    .created_at
                    .map(|t| {
                        format!(
                            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
                            t.year(),
                            t.month() as u8,
                            t.day(),
                            t.hour(),
                            t.minute(),
                            t.second()
                        )
                    })
                    .unwrap_or_default(),
                labels: v.labels,
                size: usage.0,
                usage_count: usage.1,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_volume_containers(name: String) -> Result<Vec<String>, String> {
    let docker = get_docker().await?;
    let containers = docker
        .list_containers(Some(ListContainersOptions {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut using_containers = Vec::new();
    for c in containers {
        if let Some(mounts) = c.mounts {
            if mounts.iter().any(|m| m.name.as_deref() == Some(&name)) {
                using_containers.push(
                    c.names
                        .unwrap_or_default()
                        .first()
                        .map(|s| s.trim_start_matches('/').to_string())
                        .unwrap_or_else(|| c.id.unwrap_or_default().chars().take(12).collect()),
                );
            }
        }
    }
    Ok(using_containers)
}

#[tauri::command]
pub async fn prune_volumes() -> Result<String, String> {
    let docker = get_docker().await?;
    let result = docker
        .prune_volumes(None::<PruneVolumesOptions>)
        .await
        .map_err(|e| e.to_string())?;

    let reclaimed = result.space_reclaimed.unwrap_or(0);
    let count = result.volumes_deleted.unwrap_or_default().len();

    Ok(format!(
        "Deleted {} volumes, reclaimed {:.2} MB",
        count,
        reclaimed as f64 / 1024.0 / 1024.0
    ))
}

#[tauri::command]
pub async fn delete_volume(name: String) -> Result<(), String> {
    let docker = get_docker().await?;
    docker
        .remove_volume(&name, None::<RemoveVolumeOptions>)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_volume(
    name: String,
    driver: String,
    labels: HashMap<String, String>,
) -> Result<(), String> {
    let docker = get_docker().await?;
    let options = VolumeCreateRequest {
        name: Some(name),
        driver: Some(driver),
        labels: Some(labels),
        ..Default::default()
    };
    docker
        .create_volume(options)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn inspect_volume(name: String) -> Result<String, String> {
    let docker = get_docker().await?;
    let inspect = docker
        .inspect_volume(&name)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}
