/*
 * File: networks.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::network::{ListNetworksOptions, CreateNetworkOptions, InspectNetworkOptions, ConnectNetworkOptions, DisconnectNetworkOptions, PruneNetworksOptions};
use std::collections::HashMap;
use crate::models::NetworkInfo;
use crate::utils::get_docker;

#[tauri::command]
pub async fn get_networks() -> Result<Vec<NetworkInfo>, String> {
    let docker = get_docker()?;
    let networks = docker.list_networks(None::<ListNetworksOptions<String>>).await.map_err(|e| e.to_string())?;
    
    Ok(networks.into_iter().map(|n| NetworkInfo {
        id: n.id.unwrap_or_default().chars().take(12).collect(),
        name: n.name.unwrap_or_default(),
        driver: n.driver.unwrap_or_default(),
        scope: n.scope.unwrap_or_default(),
    }).collect())
}

#[tauri::command]
pub async fn delete_network(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.remove_network(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_network(name: String, driver: String, internal: bool, attachable: bool, labels: HashMap<String, String>) -> Result<(), String> {
    let docker = get_docker()?;
    let options = CreateNetworkOptions {
        name,
        driver,
        internal,
        attachable,
        labels,
        ..Default::default()
    };
    docker.create_network(options).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn connect_container_to_network(network_id: String, container_id: String) -> Result<(), String> {
    let docker = get_docker()?;
    let options = ConnectNetworkOptions {
        container: container_id,
        ..Default::default()
    };
    docker.connect_network(&network_id, options).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect_container_from_network(network_id: String, container_id: String, force: bool) -> Result<(), String> {
    let docker = get_docker()?;
    let options = DisconnectNetworkOptions {
        container: container_id,
        force,
    };
    docker.disconnect_network(&network_id, options).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn prune_networks() -> Result<String, String> {
    let docker = get_docker()?;
    let result = docker.prune_networks(None::<PruneNetworksOptions<String>>).await.map_err(|e| e.to_string())?;
    
    let count = result.networks_deleted.unwrap_or_default().len();
    Ok(format!("Deleted {} unused networks", count))
}

#[tauri::command]
pub async fn inspect_network(id: String) -> Result<String, String> {
    let docker = get_docker()?;
    let inspect = docker.inspect_network(&id, None::<InspectNetworkOptions<String>>).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}
