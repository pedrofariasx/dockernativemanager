/*
 * File: utils.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 *
 * Last Modified: Wed Apr 01 2026
 * Modified By: Pedro Farias
 *
 */

use crate::models::ContainerStats;
use bollard::models::{ContainerCpuStats, ContainerStatsResponse};
use bollard::{ClientVersion, Docker};
use std::collections::HashMap;
use std::io::Read;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tokio::sync::mpsc;

pub static IS_STOPPED_INTENTIONALLY: AtomicBool = AtomicBool::new(false);

pub type TerminalSenders = Mutex<HashMap<String, mpsc::Sender<String>>>;

const CONNECT_TIMEOUT: u64 = 120;

// Endpoint to fall back on when the active context cannot be read. Mirrors
// bollard's own platform default, which it does not expose at the crate root.
#[cfg(unix)]
const LOCAL_DOCKER_HOST: &str = "unix:///var/run/docker.sock";
#[cfg(windows)]
const LOCAL_DOCKER_HOST: &str = "npipe:////./pipe/docker_engine";

// Global SSH tunnel process handle
lazy_static::lazy_static! {
    static ref SSH_TUNNEL: Mutex<Option<SshTunnel>> = Mutex::new(None);
}

// API version the daemon behind each endpoint accepts, learned on first use.
//
// bollard's `API_DEFAULT_VERSION` tracks the newest Docker release, and a
// daemon rejects any request whose path carries a version above its own
// maximum, so the version has to be negotiated rather than assumed.
lazy_static::lazy_static! {
    static ref ENDPOINT_API_VERSIONS: Mutex<HashMap<String, ClientVersion>> =
        Mutex::new(HashMap::new());
}

struct SshTunnel {
    child: Child,
    socket_path: String,
}

impl Drop for SshTunnel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

/// Stop any existing SSH tunnel
pub fn stop_ssh_tunnel() {
    let mut tunnel = SSH_TUNNEL.lock().unwrap();
    if let Some(mut t) = tunnel.take() {
        let _ = t.child.kill();
        let _ = t.child.wait();
        let _ = std::fs::remove_file(&t.socket_path);
        // Prevent Drop from running again
        std::mem::forget(t);
    }
}

/// Internal helper to start an SSH tunnel without locking the global mutex
fn start_ssh_tunnel_raw(ssh_url: &str) -> Result<(Child, String), String> {
    // Parse ssh://user@host[:port]
    let url_part = ssh_url.trim_start_matches("ssh://");

    // Build the local socket path with a unique ID to avoid conflicts
    let unique_id = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        % 100000;
    let socket_path = format!(
        "/tmp/docker-nm-ssh-{}-{}.sock",
        std::process::id(),
        unique_id
    );

    // Remove stale socket file if it exists
    if std::path::Path::new(&socket_path).exists() {
        let _ = std::fs::remove_file(&socket_path);
    }

    // Build SSH command: forward remote Docker socket to local socket
    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-N") // Don't execute remote command
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("ConnectTimeout=10")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-L")
        .arg(format!("{}:/var/run/docker.sock", socket_path));

    // Parse port if present (user@host:port)
    if let Some(at_pos) = url_part.find('@') {
        let user = &url_part[..at_pos];
        let host_part = &url_part[at_pos + 1..];

        if let Some(colon_pos) = host_part.rfind(':') {
            let host = &host_part[..colon_pos];
            let port = &host_part[colon_pos + 1..];
            cmd.arg("-p").arg(port);
            cmd.arg(format!("{}@{}", user, host));
        } else {
            cmd.arg(format!("{}@{}", user, host_part));
        }
    } else {
        // No user specified, just host
        if let Some(colon_pos) = url_part.rfind(':') {
            let host = &url_part[..colon_pos];
            let port = &url_part[colon_pos + 1..];
            cmd.arg("-p").arg(port);
            cmd.arg(host);
        } else {
            cmd.arg(url_part);
        }
    }

    // Start SSH tunnel process
    let mut child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start SSH tunnel: {}", e))?;

    // Wait for the socket to be created, checking if SSH process is still alive
    let socket = std::path::Path::new(&socket_path);
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(15);

    loop {
        if socket.exists() {
            // Small stabilization delay to ensure SSH is actually ready to forward
            std::thread::sleep(std::time::Duration::from_millis(500));
            break;
        }

        match child.try_wait() {
            Ok(Some(status)) => {
                let mut err_msg = String::new();
                if let Some(mut stderr) = child.stderr.take() {
                    let _ = stderr.read_to_string(&mut err_msg);
                }
                let _ = std::fs::remove_file(&socket_path);

                if err_msg.contains("Permission denied") || err_msg.contains("publickey") {
                    return Err(format!("SSH authentication failed. Check your SSH key configuration.\n\nDetails: {}", err_msg.trim()));
                }
                if err_msg.contains("Connection refused")
                    || err_msg.contains("Connection timed out")
                {
                    return Err(format!(
                        "Cannot reach remote host. Check hostname/IP and SSH port.\n\nDetails: {}",
                        err_msg.trim()
                    ));
                }
                if !err_msg.trim().is_empty() {
                    return Err(format!(
                        "SSH tunnel exited (code {}): {}",
                        status,
                        err_msg.trim()
                    ));
                }
                return Err(format!(
                    "SSH tunnel exited with code {}. Check SSH connectivity.",
                    status
                ));
            }
            Ok(None) => {}
            Err(e) => {
                let _ = std::fs::remove_file(&socket_path);
                return Err(format!("Failed to check SSH tunnel status: {}", e));
            }
        }

        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(&socket_path);
            return Err("SSH tunnel timed out waiting for socket.".to_string());
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    Ok((child, socket_path))
}

/// Endpoint of the active Docker context, or an empty string when there is none.
fn current_endpoint() -> Result<String, String> {
    let output = std::process::Command::new("docker")
        .args([
            "context",
            "inspect",
            "--format",
            "{{.Endpoints.docker.Host}}",
        ])
        .output()
        .map_err(|e| format!("Failed to get docker context: {}", e))?;

    let host = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    } else {
        String::new()
    };

    if host.is_empty() {
        // No usable context: honour DOCKER_HOST the way bollard's own defaults
        // do, and let the caller fall back to the platform socket.
        return Ok(std::env::var("DOCKER_HOST").unwrap_or_default());
    }

    Ok(host)
}

/// Open a connection to `host`, pinning the client to `version`.
fn connect_endpoint(host: &str, version: &ClientVersion) -> Result<Docker, String> {
    if host.starts_with("ssh://") {
        let mut tunnel_lock = SSH_TUNNEL.lock().unwrap();

        // Check if existing tunnel is valid
        if let Some(ref mut tunnel) = *tunnel_lock {
            let socket_exists = std::path::Path::new(&tunnel.socket_path).exists();
            let process_alive = tunnel
                .child
                .try_wait()
                .map(|s| s.is_none())
                .unwrap_or(false);

            if socket_exists && process_alive {
                return Docker::connect_with_socket(&tunnel.socket_path, CONNECT_TIMEOUT, version)
                    .map_err(|e| e.to_string());
            }
        }

        // Restart tunnel atomically
        if let Some(mut t) = tunnel_lock.take() {
            let _ = t.child.kill();
            let _ = t.child.wait();
            let _ = std::fs::remove_file(&t.socket_path);
            std::mem::forget(t);
        }

        let (child, socket_path) = start_ssh_tunnel_raw(host)?;
        let socket_to_return = socket_path.clone();

        *tunnel_lock = Some(SshTunnel { child, socket_path });

        Docker::connect_with_socket(&socket_to_return, CONNECT_TIMEOUT, version)
            .map_err(|e| e.to_string())
    } else if host.starts_with("tcp://") {
        stop_ssh_tunnel();
        let addr = host.trim_start_matches("tcp://");
        Docker::connect_with_http(addr, CONNECT_TIMEOUT, version).map_err(|e| e.to_string())
    } else {
        // Unix socket, Windows named pipe, or a context we could not read.
        stop_ssh_tunnel();
        let addr = if host.is_empty() {
            LOCAL_DOCKER_HOST
        } else {
            host
        };
        Docker::connect_with_local(addr, CONNECT_TIMEOUT, version).map_err(|e| e.to_string())
    }
}

pub async fn get_docker() -> Result<Docker, String> {
    if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
        return Err("Docker is intentionally stopped".into());
    }

    let host = current_endpoint()?;
    let known = ENDPOINT_API_VERSIONS.lock().unwrap().get(&host).copied();

    let docker = connect_endpoint(
        &host,
        known.as_ref().unwrap_or(bollard::API_DEFAULT_VERSION),
    )?;
    if known.is_some() {
        return Ok(docker);
    }

    // First connection to this endpoint: ask the daemon which API version it
    // speaks. `negotiate_version` requests an unversioned `/version`, so it
    // works even when our default is above the daemon's maximum.
    let docker = docker
        .negotiate_version()
        .await
        .map_err(|e| format!("Failed to negotiate the Docker API version: {}", e))?;

    ENDPOINT_API_VERSIONS
        .lock()
        .unwrap()
        .insert(host, docker.client_version());

    Ok(docker)
}

/// Flatten a raw Docker stats sample into the shape the UI consumes.
///
/// Every field of `ContainerStatsResponse` is optional: Windows containers,
/// cgroups v1 and cgroups v2 each omit a different subset, so every metric
/// falls back to zero instead of being unwrapped.
pub fn map_container_stats(stats: &ContainerStatsResponse) -> ContainerStats {
    let total_usage = |cpu: &Option<ContainerCpuStats>| {
        cpu.as_ref()
            .and_then(|c| c.cpu_usage.as_ref())
            .and_then(|u| u.total_usage)
            .unwrap_or(0) as f64
    };
    let system_usage = |cpu: &Option<ContainerCpuStats>| {
        cpu.as_ref().and_then(|c| c.system_cpu_usage).unwrap_or(0) as f64
    };

    let cpu_delta = total_usage(&stats.cpu_stats) - total_usage(&stats.precpu_stats);
    let system_delta = system_usage(&stats.cpu_stats) - system_usage(&stats.precpu_stats);

    let mut cpu_percent = 0.0;
    if system_delta > 0.0 && cpu_delta > 0.0 {
        let num_cpus = stats
            .cpu_stats
            .as_ref()
            .and_then(|c| c.online_cpus)
            .unwrap_or(1) as f64;
        cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0;
    }

    let memory_usage = stats
        .memory_stats
        .as_ref()
        .and_then(|m| m.usage)
        .unwrap_or(0);
    let memory_limit = stats
        .memory_stats
        .as_ref()
        .and_then(|m| m.limit)
        .unwrap_or(0);

    // Memory detail is a flat map now: cgroups v1 reports "cache",
    // cgroups v2 reports "inactive_file".
    let cache = stats
        .memory_stats
        .as_ref()
        .and_then(|m| m.stats.as_ref())
        .and_then(|s| s.get("cache").or_else(|| s.get("inactive_file")))
        .copied()
        .unwrap_or(0);
    let actual_memory = memory_usage.saturating_sub(cache);

    let mut net_rx = 0;
    let mut net_tx = 0;
    if let Some(networks) = stats.networks.as_ref() {
        for net in networks.values() {
            net_rx += net.rx_bytes.unwrap_or(0);
            net_tx += net.tx_bytes.unwrap_or(0);
        }
    }

    let mut disk_read = 0;
    let mut disk_write = 0;
    if let Some(ios) = stats
        .blkio_stats
        .as_ref()
        .and_then(|b| b.io_service_bytes_recursive.as_ref())
    {
        for io in ios {
            let value = io.value.unwrap_or(0);
            match io.op.as_deref().unwrap_or("").to_lowercase().as_str() {
                "read" => disk_read += value,
                "write" => disk_write += value,
                _ => {}
            }
        }
    }

    ContainerStats {
        cpu_percent,
        memory_usage: actual_memory,
        memory_limit,
        disk_read,
        disk_write,
        net_rx,
        net_tx,
    }
}
