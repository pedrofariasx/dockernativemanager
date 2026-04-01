/*
 * File: tasks.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Wed Apr 01 2026
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
        // Short delay before retry - allows SSH tunnel to establish on context switch
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
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
    let mut last_remote_cpu_idle: u64 = 0;
    let mut last_remote_cpu_total: u64 = 0;
    let mut last_remote_disk_read: u64 = 0;
    let mut last_remote_disk_write: u64 = 0;
    let mut last_remote_net_rx: u64 = 0;
    let mut last_remote_net_tx: u64 = 0;

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
        
        if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
            continue;
        }

        // Check if we're on a remote context
        let is_remote = is_remote_context();

        if is_remote {
            // For remote contexts, get stats via Docker API (through the SSH tunnel)
            match get_docker() {
                Ok(docker) => {
                    match docker.info().await {
                        Ok(info) => {
                            let mem_total = info.mem_total.unwrap_or(0) as u64;
                            
                            // Try to get real stats via SSH
                            if let Some(remote_stats) = get_remote_host_stats() {
                                let cpu_delta_idle = remote_stats.cpu_idle.saturating_sub(last_remote_cpu_idle);
                                let cpu_delta_total = remote_stats.cpu_total.saturating_sub(last_remote_cpu_total);
                                let cpu_usage = if cpu_delta_total > 0 && last_remote_cpu_total > 0 {
                                    ((cpu_delta_total - cpu_delta_idle) as f32 / cpu_delta_total as f32) * 100.0
                                } else {
                                    0.0
                                };
                                
                                last_remote_cpu_idle = remote_stats.cpu_idle;
                                last_remote_cpu_total = remote_stats.cpu_total;

                                let disk_read = if last_remote_disk_read > 0 { remote_stats.disk_read.saturating_sub(last_remote_disk_read) / 2 } else { 0 };
                                let disk_write = if last_remote_disk_write > 0 { remote_stats.disk_write.saturating_sub(last_remote_disk_write) / 2 } else { 0 };
                                let net_rx = if last_remote_net_rx > 0 { remote_stats.net_rx.saturating_sub(last_remote_net_rx) / 2 } else { 0 };
                                let net_tx = if last_remote_net_tx > 0 { remote_stats.net_tx.saturating_sub(last_remote_net_tx) / 2 } else { 0 };

                                last_remote_disk_read = remote_stats.disk_read;
                                last_remote_disk_write = remote_stats.disk_write;
                                last_remote_net_rx = remote_stats.net_rx;
                                last_remote_net_tx = remote_stats.net_tx;

                                let payload = HostStats {
                                    cpu_usage,
                                    memory_used: remote_stats.mem_used,
                                    memory_total: remote_stats.mem_total,
                                    disk_read_bytes: disk_read,
                                    disk_write_bytes: disk_write,
                                    net_rx_bytes: net_rx,
                                    net_tx_bytes: net_tx,
                                };
                                let _ = app_handle.emit("host-stats", payload);
                            } else {
                                // Fallback: use Docker info for basic memory data
                                let payload = HostStats {
                                    cpu_usage: 0.0,
                                    memory_used: 0,
                                    memory_total: mem_total,
                                    disk_read_bytes: 0,
                                    disk_write_bytes: 0,
                                    net_rx_bytes: 0,
                                    net_tx_bytes: 0,
                                };
                                let _ = app_handle.emit("host-stats", payload);
                            }
                        }
                        Err(_) => continue,
                    }
                }
                Err(_) => continue,
            }
        } else {
            // Local context - use sysinfo as before
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
}

struct RemoteHostStats {
    cpu_idle: u64,
    cpu_total: u64,
    mem_total: u64,
    mem_used: u64,
    disk_read: u64,
    disk_write: u64,
    net_rx: u64,
    net_tx: u64,
}

/// Check if the current Docker context is remote (SSH)
fn is_remote_context() -> bool {
    let output = std::process::Command::new("docker")
        .args(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
        .output();
    
    match output {
        Ok(out) if out.status.success() => {
            let host = String::from_utf8_lossy(&out.stdout).trim().to_string();
            host.starts_with("ssh://") || host.starts_with("tcp://")
        }
        _ => false,
    }
}

/// Get host stats from remote machine via SSH
fn get_remote_host_stats() -> Option<RemoteHostStats> {
    // Get the SSH host from current docker context
    let output = std::process::Command::new("docker")
        .args(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
        .output()
        .ok()?;
    
    let host = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !host.starts_with("ssh://") {
        return None;
    }

    let url_part = host.trim_start_matches("ssh://");
    
    // Build SSH command to get /proc/stat and /proc/meminfo
    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-o").arg("ConnectTimeout=5")
       .arg("-o").arg("BatchMode=yes");

    // Parse user@host[:port]
    if let Some(at_pos) = url_part.find('@') {
        let user = &url_part[..at_pos];
        let host_part = &url_part[at_pos + 1..];
        if let Some(colon_pos) = host_part.rfind(':') {
            let hostname = &host_part[..colon_pos];
            let port = &host_part[colon_pos + 1..];
            cmd.arg("-p").arg(port);
            cmd.arg(format!("{}@{}", user, hostname));
        } else {
            cmd.arg(format!("{}@{}", user, host_part));
        }
    } else {
        cmd.arg(url_part);
    }

    // Get CPU, memory, disk and net stats in one command
    cmd.arg("cat /proc/stat /proc/meminfo /proc/diskstats /proc/net/dev");

    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let mut cpu_total: u64 = 0;
    let mut cpu_idle: u64 = 0;
    let mut mem_total: u64 = 0;
    let mut mem_available: u64 = 0;
    let mut disk_read: u64 = 0;
    let mut disk_write: u64 = 0;
    let mut net_rx: u64 = 0;
    let mut net_tx: u64 = 0;
    
    for line in stdout.lines() {
        if line.starts_with("cpu ") {
            // cpu  user nice system idle iowait irq softirq steal guest guest_nice
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let values: Vec<u64> = parts[1..].iter()
                    .filter_map(|s| s.parse().ok())
                    .collect();
                cpu_total = values.iter().sum();
                cpu_idle = *values.get(3).unwrap_or(&0); // idle is the 4th value
            }
        } else if line.starts_with("MemTotal:") {
            if let Some(val) = line.split_whitespace().nth(1) {
                mem_total = val.parse::<u64>().unwrap_or(0) * 1024; // Convert kB to bytes
            }
        } else if line.starts_with("MemAvailable:") {
            if let Some(val) = line.split_whitespace().nth(1) {
                mem_available = val.parse::<u64>().unwrap_or(0) * 1024; // Convert kB to bytes
            }
        } else if line.trim().starts_with("sd") || line.trim().starts_with("nvme") || line.trim().starts_with("vd") {
            // /proc/diskstats format: major minor name reads_completed reads_merged sectors_read time_reading writes_completed writes_merged sectors_written time_writing ...
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 10 {
                // sectors_read (column 6) * 512, sectors_written (column 10) * 512
                disk_read += parts[5].parse::<u64>().unwrap_or(0) * 512;
                disk_write += parts[9].parse::<u64>().unwrap_or(0) * 512;
            }
        } else if line.contains(':') && !line.contains("Mem") && !line.contains("cpu") {
            // /proc/net/dev format: eth0: 123 123 ...
            let parts: Vec<&str> = line.split(':').collect();
            if parts.len() == 2 {
                let stats: Vec<&str> = parts[1].split_whitespace().collect();
                if stats.len() >= 10 {
                    net_rx += stats[0].parse::<u64>().unwrap_or(0);
                    net_tx += stats[8].parse::<u64>().unwrap_or(0);
                }
            }
        }
    }

    Some(RemoteHostStats {
        cpu_idle,
        cpu_total,
        mem_total,
        mem_used: mem_total.saturating_sub(mem_available),
        disk_read,
        disk_write,
        net_rx,
        net_tx,
    })
}
