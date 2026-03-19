/*
 * File: models.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 */

use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone)]
pub struct HostStats {
    pub cpu_usage: f32,
    pub memory_used: u64,
    pub memory_total: u64,
    pub disk_read_bytes: u64,
    pub disk_write_bytes: u64,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
}

#[derive(Serialize)]
pub struct ContainerInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created: i64,
    pub ip_address: String,
    pub labels: HashMap<String, String>,
    pub stack: String,
    pub host: String,
}

#[derive(Serialize)]
pub struct ImageInfo {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct VolumeInfo {
    pub name: String,
    pub driver: String,
    pub mountpoint: String,
    pub created_at: String,
    pub labels: HashMap<String, String>,
    pub size: i64,
    pub usage_count: i64,
}

#[derive(Serialize)]
pub struct NetworkInfo {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
}

#[derive(Serialize)]
pub struct StackInfo {
    pub name: String,
    pub status: String,
    pub services: usize,
    pub created: i64,
    pub updated: i64,
    pub stack_type: String,
}

#[derive(Serialize, Clone)]
pub struct ContainerStats {
    pub cpu_percent: f64,
    pub memory_usage: u64,
    pub memory_limit: u64,
    pub disk_read: u64,
    pub disk_write: u64,
    pub net_rx: u64,
    pub net_tx: u64,
}

#[derive(Serialize)]
pub struct SystemInfo {
    pub containers: usize,
    pub containers_running: usize,
    pub containers_paused: usize,
    pub containers_stopped: usize,
    pub images: usize,
    pub version: String,
    pub operating_system: String,
    pub kernel_version: String,
    pub storage_driver: String,
    pub logging_driver: String,
    pub architecture: String,
    pub ncpu: i64,
    pub mem_total: i64,
}

#[derive(Serialize)]
pub struct SwarmInfo {
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
    pub nodes: usize,
    pub managers: usize,
    pub is_manager: bool,
}

#[derive(Serialize)]
pub struct NodeInfo {
    pub id: String,
    pub hostname: String,
    pub role: String,
    pub status: String,
    pub availability: String,
    pub ip_address: String,
    pub engine_version: String,
}

#[derive(Serialize)]
pub struct ServiceInfo {
    pub id: String,
    pub name: String,
    pub image: String,
    pub replicas: String, // format "running/total"
    pub ports: String,
    pub updated_at: String,
    pub stack: String,
}

#[derive(Serialize)]
pub struct DockerContextInfo {
    pub name: String,
    pub description: String,
    pub docker_endpoint: String,
    pub is_active: bool,
}
