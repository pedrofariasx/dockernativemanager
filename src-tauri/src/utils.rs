/*
 * File: utils.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 31 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::Docker;
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::mpsc;

pub static IS_STOPPED_INTENTIONALLY: AtomicBool = AtomicBool::new(false);

pub type TerminalSenders = Mutex<HashMap<String, mpsc::Sender<String>>>;

// Global SSH tunnel process handle
lazy_static::lazy_static! {
    static ref SSH_TUNNEL: Mutex<Option<SshTunnel>> = Mutex::new(None);
}

struct SshTunnel {
    child: std::process::Child,
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

/// Start an SSH tunnel for Docker socket forwarding
/// Returns the local socket path on success
fn start_ssh_tunnel(ssh_url: &str) -> Result<String, String> {
    // Stop any existing tunnel first
    stop_ssh_tunnel();

    // Parse ssh://user@host[:port]
    let url_part = ssh_url.trim_start_matches("ssh://");
    
    // Build the local socket path
    let socket_path = format!("/tmp/docker-nm-ssh-{}.sock", std::process::id());
    
    // Remove stale socket file if it exists
    let _ = std::fs::remove_file(&socket_path);

    // Build SSH command: forward remote Docker socket to local socket
    let mut cmd = std::process::Command::new("ssh");
    cmd.arg("-N")                                    // Don't execute remote command
       .arg("-o").arg("StrictHostKeyChecking=accept-new")
       .arg("-o").arg("ConnectTimeout=10")
       .arg("-o").arg("ServerAliveInterval=30")
       .arg("-o").arg("ServerAliveCountMax=3")
       .arg("-o").arg("ExitOnForwardFailure=yes")
       .arg("-L").arg(format!("{}:/var/run/docker.sock", socket_path));

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
        // Check if socket has appeared
        if socket.exists() {
            break;
        }
        
        // Check if SSH process has exited (error)
        match child.try_wait() {
            Ok(Some(status)) => {
                // Process exited - get error message
                let mut err_msg = String::new();
                if let Some(stderr) = child.stderr.take() {
                    use std::io::Read;
                    let mut reader = std::io::BufReader::new(stderr);
                    let _ = reader.read_to_string(&mut err_msg);
                }
                let _ = std::fs::remove_file(&socket_path);
                
                if err_msg.contains("Permission denied") || err_msg.contains("publickey") {
                    return Err(format!("SSH authentication failed. Check your SSH key configuration.\n\nDetails: {}", err_msg.trim()));
                }
                if err_msg.contains("Connection refused") || err_msg.contains("Connection timed out") {
                    return Err(format!("Cannot reach remote host. Check hostname/IP and SSH port.\n\nDetails: {}", err_msg.trim()));
                }
                if !err_msg.trim().is_empty() {
                    return Err(format!("SSH tunnel exited (code {}): {}", status, err_msg.trim()));
                }
                return Err(format!("SSH tunnel exited with code {}. Check SSH connectivity.", status));
            },
            Ok(None) => {
                // Process still running, continue waiting
            },
            Err(e) => {
                let _ = std::fs::remove_file(&socket_path);
                return Err(format!("Failed to check SSH tunnel status: {}", e));
            }
        }
        
        // Check timeout
        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            let _ = std::fs::remove_file(&socket_path);
            return Err("SSH tunnel timed out waiting for socket. Check SSH connectivity and that Docker is running on the remote host.".to_string());
        }
        
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    // Store the tunnel handle
    let mut tunnel_lock = SSH_TUNNEL.lock().unwrap();
    *tunnel_lock = Some(SshTunnel {
        child,
        socket_path: socket_path.clone(),
    });

    Ok(socket_path)
}

pub fn get_docker() -> Result<Docker, String> {
    if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
        return Err("Docker is intentionally stopped".into());
    }

    // Get the current context's endpoint
    let output = std::process::Command::new("docker")
        .args(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])
        .output()
        .map_err(|e| format!("Failed to get docker context: {}", e))?;

    if !output.status.success() {
        // Fallback to local defaults if context command fails
        stop_ssh_tunnel();
        return Docker::connect_with_local_defaults().map_err(|e| e.to_string());
    }

    let host = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if host.is_empty() || host.starts_with("unix://") || host.starts_with("/") {
        // Local connection - stop any SSH tunnel
        stop_ssh_tunnel();
        Docker::connect_with_local_defaults().map_err(|e| e.to_string())
    } else if host.starts_with("ssh://") {
        // SSH connection - check if tunnel is already running
        {
            let mut tunnel_lock = SSH_TUNNEL.lock().unwrap();
            if let Some(ref mut tunnel) = *tunnel_lock {
                // Check if socket still exists AND process is still alive
                let socket_exists = std::path::Path::new(&tunnel.socket_path).exists();
                let process_alive = tunnel.child.try_wait().map(|s| s.is_none()).unwrap_or(false);
                
                if socket_exists && process_alive {
                    let socket = tunnel.socket_path.clone();
                    drop(tunnel_lock);
                    return Docker::connect_with_socket(&socket, 120, bollard::API_DEFAULT_VERSION)
                        .map_err(|e| e.to_string());
                }
                // Tunnel is dead, clean up and create new one below
            }
        }
        // Stop dead tunnel and create fresh one
        stop_ssh_tunnel();

        // Start new tunnel
        let socket_path = start_ssh_tunnel(&host)?;
        Docker::connect_with_socket(&socket_path, 120, bollard::API_DEFAULT_VERSION)
            .map_err(|e| e.to_string())
    } else if host.starts_with("tcp://") {
        stop_ssh_tunnel();
        let addr = host.trim_start_matches("tcp://");
        Docker::connect_with_http(addr, 120, bollard::API_DEFAULT_VERSION).map_err(|e| e.to_string())
    } else {
        // Generic fallback
        stop_ssh_tunnel();
        Docker::connect_with_local_defaults().map_err(|e| e.to_string())
    }
}
