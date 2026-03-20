/*
 * File: tasks.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Fri Mar 20 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::container::{ListContainersOptions, StatsOptions, MemoryStatsStats};
use bollard::system::EventsOptions;
use futures_util::stream::StreamExt;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};
use crate::models::{ContainerStats, HostStats};
use crate::utils::{get_docker, IS_STOPPED_INTENTIONALLY};

pub async fn listen_to_docker_events(app_handle: AppHandle) {
    // Immediate check on startup
    match get_docker() {
        Ok(docker) => {
            if docker.ping().await.is_ok() {
                let _ = app_handle.emit("docker-connection-status", true);
            } else {
                let _ = app_handle.emit("docker-connection-status", false);
            }
        }
        Err(_) => {
            let _ = app_handle.emit("docker-connection-status", false);
        }
    }

    loop {
        if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
            let _ = app_handle.emit("docker-connection-status", false);
            tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            continue;
        }

        match get_docker() {
            Ok(docker) => {
                if docker.ping().await.is_err() {
                    let _ = app_handle.emit("docker-connection-status", false);
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    continue;
                }

                let _ = app_handle.emit("docker-connection-status", true);
                let mut events = docker.events(None::<EventsOptions<String>>);

                loop {
                    tokio::select! {
                        event_res = events.next() => {
                            match event_res {
                                Some(Ok(event)) => {
                                    let _ = app_handle.emit("docker-event", event);
                                }
                                _ => break, // Connection lost or stream ended
                            }
                        }
                        _ = tokio::time::sleep(tokio::time::Duration::from_secs(3)) => {
                            // Periodically ping to ensure connection is still alive
                            if docker.ping().await.is_err() {
                                break;
                            }
                        }
                    }
                }
                let _ = app_handle.emit("docker-connection-status", false);
            }
            Err(_) => {
                let _ = app_handle.emit("docker-connection-status", false);
            }
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
    }
}

pub async fn emit_container_stats(app_handle: AppHandle) {
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

        if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
            continue;
        }

        let docker = match get_docker() {
            Ok(d) => d,
            Err(_) => continue,
        };

        let containers = match docker.list_containers(Some(ListContainersOptions::<String> {
            all: false, // only running
            ..Default::default()
        })).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        for c in containers {
            if let Some(id) = c.id {
                let id_clone = id.clone();
                let mut stats_stream = docker.stats(&id_clone, Some(StatsOptions {
                    stream: false,
                    one_shot: false,
                }));

                if let Some(Ok(stats)) = stats_stream.next().await {
                    let cpu_delta = stats.cpu_stats.cpu_usage.total_usage as f64 - stats.precpu_stats.cpu_usage.total_usage as f64;
                    let system_delta = stats.cpu_stats.system_cpu_usage.unwrap_or(0) as f64 - stats.precpu_stats.system_cpu_usage.unwrap_or(0) as f64;
                    let mut cpu_percent = 0.0;
                    
                    if system_delta > 0.0 && cpu_delta > 0.0 {
                        let num_cpus = stats.cpu_stats.online_cpus.unwrap_or(1) as f64;
                        cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0;
                    }

                    let memory_usage = stats.memory_stats.usage.unwrap_or(0);
                    let memory_limit = stats.memory_stats.limit.unwrap_or(0);
                    
                    let mut actual_memory = memory_usage;
                    if let Some(stats_detail) = stats.memory_stats.stats {
                        match stats_detail {
                            MemoryStatsStats::V1(v1) => {
                                actual_memory = memory_usage.saturating_sub(v1.cache);
                            }
                            MemoryStatsStats::V2(v2) => {
                                actual_memory = memory_usage.saturating_sub(v2.inactive_file);
                            }
                        }
                    }

                    let mut net_rx = 0;
                    let mut net_tx = 0;
                    if let Some(networks) = stats.networks {
                        for net in networks.values() {
                            net_rx += net.rx_bytes;
                            net_tx += net.tx_bytes;
                        }
                    }

                    let mut disk_read = 0;
                    let mut disk_write = 0;
                    if let Some(ios) = stats.blkio_stats.io_service_bytes_recursive {
                        for io in ios {
                            match io.op.to_lowercase().as_str() {
                                "read" => disk_read += io.value,
                                "write" => disk_write += io.value,
                                _ => {}
                            }
                        }
                    }

                    let payload = ContainerStats {
                        cpu_percent,
                        memory_usage: actual_memory,
                        memory_limit,
                        disk_read,
                        disk_write,
                        net_rx,
                        net_tx,
                    };

                    let _ = app_handle.emit(&format!("container-stats-{}", id_clone), payload);
                }
            }
        }
    }
}

pub async fn emit_host_stats(app_handle: AppHandle) {
    use sysinfo::{System, Networks};
    let mut sys = System::new_all();
    let mut networks = Networks::new_with_refreshed_list();
    
    let mut last_disk_read: u64 = 0;
    let mut last_disk_write: u64 = 0;
    let mut last_net_rx: u64 = 0;
    let mut last_net_tx: u64 = 0;

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
            continue;
        }

        sys.refresh_all();
        networks.refresh(true);
        
        let cpu_usage = sys.global_cpu_usage();
        let memory_used = sys.used_memory();
        let memory_total = sys.total_memory();
        
        let mut current_read: u64 = 0;
        let mut current_write: u64 = 0;
        for process in sys.processes().values() {
            let disk_usage = process.disk_usage();
            current_read += disk_usage.read_bytes;
            current_write += disk_usage.written_bytes;
        }

        let mut current_net_rx: u64 = 0;
        let mut current_net_tx: u64 = 0;
        for (_, data) in &networks {
            current_net_rx += data.total_received();
            current_net_tx += data.total_transmitted();
        }

        let payload = HostStats {
            cpu_usage,
            memory_used,
            memory_total,
            disk_read_bytes: current_read.saturating_sub(last_disk_read) / 2,
            disk_write_bytes: current_write.saturating_sub(last_disk_write) / 2,
            net_rx_bytes: current_net_rx.saturating_sub(last_net_rx) / 2,
            net_tx_bytes: current_net_tx.saturating_sub(last_net_tx) / 2,
        };

        if last_disk_read > 0 {
            let _ = app_handle.emit("host-stats", payload);
        }

        last_disk_read = current_read;
        last_disk_write = current_write;
        last_net_rx = current_net_rx;
        last_net_tx = current_net_tx;
    }
}
