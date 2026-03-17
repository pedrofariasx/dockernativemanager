/*
 * File: images.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::image::{ListImagesOptions, RemoveImageOptions, CreateImageOptions, PruneImagesOptions};
use futures_util::stream::StreamExt;
use chrono::{TimeZone, Local};
use tauri::{AppHandle, Emitter};
use crate::models::ImageInfo;
use crate::utils::get_docker;

#[tauri::command]
pub async fn get_images() -> Result<Vec<ImageInfo>, String> {
    let docker = get_docker()?;
    let images = docker
        .list_images(Some(ListImagesOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(images
        .into_iter()
        .map(|img| {
            let repo_tag = img.repo_tags.first().cloned().unwrap_or_else(|| "none:none".to_string());
            let parts: Vec<&str> = repo_tag.split(':').collect();
            ImageInfo {
                id: img.id.replace("sha256:", "").chars().take(12).collect(),
                repository: parts.first().unwrap_or(&"none").to_string(),
                tag: parts.get(1).unwrap_or(&"none").to_string(),
                size: format!("{:.2} MB", img.size as f64 / 1024.0 / 1024.0),
                created: img.created.to_string(),
                created_at: Local.timestamp_opt(img.created, 0)
                    .single()
                    .map(|dt| dt.to_rfc3339())
                    .unwrap_or_else(|| "unknown".to_string()),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn delete_image(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.remove_image(&id, None::<RemoveImageOptions>, None).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pull_image(app_handle: AppHandle, image: String) -> Result<(), String> {
    let docker = get_docker()?;
    
    let full_image = if image.contains(':') {
        image
    } else {
        format!("{}:latest", image)
    };

    let mut stream = docker.create_image(
        Some(CreateImageOptions {
            from_image: full_image.clone(),
            ..Default::default()
        }),
        None,
        None,
    );

    while let Some(item) = stream.next().await {
        match item {
            Ok(progress) => {
                if let Some(error) = progress.error {
                    return Err(format!("Docker pull error: {}", error));
                }
                let _ = app_handle.emit(&format!("pull-progress-{}", full_image), progress);
            }
            Err(e) => return Err(format!("Docker stream error: {}", e)),
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn prune_images() -> Result<String, String> {
    let docker = get_docker()?;
    let result = docker.prune_images(None::<PruneImagesOptions<String>>).await.map_err(|e| e.to_string())?;
    
    let reclaimed = result.space_reclaimed.unwrap_or(0);
    let count = result.images_deleted.unwrap_or_default().len();
    
    Ok(format!("Deleted {} images, reclaimed {:.2} MB", count, reclaimed as f64 / 1024.0 / 1024.0))
}

#[tauri::command]
pub async fn inspect_image(id: String) -> Result<String, String> {
    let docker = get_docker()?;
    let inspect = docker.inspect_image(&id).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}
