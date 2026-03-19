/*
 * File: volumes.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::volume::{ListVolumesOptions, RemoveVolumeOptions, CreateVolumeOptions};
use bollard::container::ListContainersOptions;
use std::collections::HashMap;
use crate::models::VolumeInfo;
use crate::utils::get_docker;

#[tauri::command]
pub async fn get_volumes() -> Result<Vec<VolumeInfo>, String> {
    let docker = get_docker()?;
    let volumes = docker.list_volumes(None::<ListVolumesOptions<String>>).await.map_err(|e| e.to_string())?;
    
    Ok(volumes.volumes.unwrap_or_default().into_iter().map(|v| {
        let usage = v.usage_data;
        VolumeInfo {
            name: v.name,
            driver: v.driver,
            mountpoint: v.mountpoint,
            created_at: v.created_at.map(|t| t.to_string()).unwrap_or_default(),
            labels: v.labels,
            size: usage.as_ref().map(|u| u.size).unwrap_or(-1),
            usage_count: usage.as_ref().map(|u| u.ref_count).unwrap_or(-1),
        }
    }).collect())
}

#[tauri::command]
pub async fn get_volume_containers(name: String) -> Result<Vec<String>, String> {
    let docker = get_docker()?;
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut using_containers = Vec::new();
    for c in containers {
        if let Some(mounts) = c.mounts {
            if mounts.iter().any(|m| m.name.as_deref() == Some(&name)) {
                using_containers.push(c.names.unwrap_or_default().first().map(|s| s.trim_start_matches('/').to_string()).unwrap_or_else(|| c.id.unwrap_or_default().chars().take(12).collect()));
            }
        }
    }
    Ok(using_containers)
}

#[tauri::command]
pub async fn prune_volumes() -> Result<String, String> {
    let docker = get_docker()?;
    let result = docker.prune_volumes(None::<bollard::volume::PruneVolumesOptions<String>>).await.map_err(|e| e.to_string())?;
    
    let reclaimed = result.space_reclaimed.unwrap_or(0);
    let count = result.volumes_deleted.unwrap_or_default().len();
    
    Ok(format!("Deleted {} volumes, reclaimed {:.2} MB", count, reclaimed as f64 / 1024.0 / 1024.0))
}

#[tauri::command]
pub async fn delete_volume(name: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.remove_volume(&name, None::<RemoveVolumeOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_volume(name: String, driver: String, labels: HashMap<String, String>) -> Result<(), String> {
    let docker = get_docker()?;
    let options = CreateVolumeOptions {
        name,
        driver,
        labels,
        ..Default::default()
    };
    docker.create_volume(options).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn inspect_volume(name: String) -> Result<String, String> {
    let docker = get_docker()?;
    let inspect = docker.inspect_volume(&name).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}
