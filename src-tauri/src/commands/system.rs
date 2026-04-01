/*
 * File: system.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 31 2026
 * Modified By: Pedro Farias
 * 
 */

use crate::models::SystemInfo;
use crate::utils::{get_docker, stop_ssh_tunnel, IS_STOPPED_INTENTIONALLY};
use std::sync::atomic::Ordering;

#[tauri::command]
pub async fn open_external_link(url: String) -> Result<(), String> {
    // Basic security check - only allow http/https
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Invalid URL".to_string());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn download_update(url: String, filename: String) -> Result<String, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let download_path = format!("{}/Downloads/{}", home, filename);

    // Using curl to download the file - common on Linux/macOS
    let output = std::process::Command::new("curl")
        .arg("-L")
        .arg("-o")
        .arg(&download_path)
        .arg(&url)
        .output()
        .map_err(|e| format!("Failed to execute curl: {}", e))?;

    if !output.status.success() {
        return Err(format!("Download failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok(download_path)
}

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
            // Stop any existing SSH tunnel so it will be re-established on next get_docker() call
            stop_ssh_tunnel();
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

#[tauri::command]
pub async fn test_docker_connection(host: String, ssh_key: Option<String>) -> Result<String, String> {
    if host.starts_with("ssh://") {
        // For SSH URLs, connect via SSH and run docker info on the remote host
        let url_part = host.trim_start_matches("ssh://");
        
        let mut ssh_cmd = std::process::Command::new("ssh");
        ssh_cmd
            .arg("-o").arg("StrictHostKeyChecking=accept-new")
            .arg("-o").arg("ConnectTimeout=10")
            .arg("-o").arg("BatchMode=yes");
        
        // If an SSH key is provided, use it
        if let Some(ref key) = ssh_key {
            if !key.is_empty() {
                ssh_cmd.arg("-i").arg(key);
            }
        }
        
        // Parse user@host[:port]
        if let Some(at_pos) = url_part.find('@') {
            let user = &url_part[..at_pos];
            let host_part = &url_part[at_pos + 1..];
            
            if let Some(colon_pos) = host_part.rfind(':') {
                let hostname = &host_part[..colon_pos];
                let port = &host_part[colon_pos + 1..];
                ssh_cmd.arg("-p").arg(port);
                ssh_cmd.arg(format!("{}@{}", user, hostname));
            } else {
                ssh_cmd.arg(format!("{}@{}", user, host_part));
            }
        } else {
            // No user specified
            if let Some(colon_pos) = url_part.rfind(':') {
                let hostname = &url_part[..colon_pos];
                let port = &url_part[colon_pos + 1..];
                ssh_cmd.arg("-p").arg(port);
                ssh_cmd.arg(hostname);
            } else {
                ssh_cmd.arg(url_part);
            }
        }
        
        // Run docker info on the remote host
        ssh_cmd.arg("docker").arg("info").arg("--format").arg("{{.Name}}");
        
        let output = ssh_cmd
            .output()
            .map_err(|e| format!("Failed to execute SSH command: {}", e))?;
        
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.contains("Permission denied") || stderr.contains("publickey") {
                return Err(format!("SSH authentication failed. Make sure you have selected the correct SSH key and that it is authorized on the remote server.\n\nDetails: {}", stderr.trim()));
            }
            if stderr.contains("Connection refused") || stderr.contains("Connection timed out") || stderr.contains("No route to host") {
                return Err(format!("Cannot reach the remote host. Check the hostname/IP and that SSH port is open.\n\nDetails: {}", stderr.trim()));
            }
            if stderr.contains("docker: not found") || stderr.contains("command not found") {
                return Err("SSH connection successful, but Docker is not installed on the remote host.".to_string());
            }
            if stderr.contains("permission denied") && stderr.contains("docker.sock") {
                return Err("SSH connection successful, but the remote user does not have permission to access Docker.\n\nFix: Run on the remote server:\n  sudo usermod -aG docker YOUR_USER\n  # then logout and login again".to_string());
            }
            if stderr.is_empty() {
                return Err("SSH connection failed. Check your host URL and SSH key configuration.".to_string());
            }
            return Err(format!("Remote Docker error: {}", stderr.trim()));
        }
        
        let hostname = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if hostname.is_empty() {
            return Err("SSH connection successful but Docker returned empty hostname. Is the Docker daemon running on the remote host?".to_string());
        }
        
        Ok(hostname)
    } else {
        // For TCP and other protocols, use DOCKER_HOST env var
        let output = std::process::Command::new("docker")
            .env("DOCKER_HOST", &host)
            .args(["info", "--format", "{{.Name}}"])
            .output()
            .map_err(|e| format!("Failed to execute docker command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            if stderr.is_empty() {
                return Err("Failed to connect to Docker daemon. Check your host URL and ensure the remote Docker daemon is accessible.".to_string());
            }
            return Err(stderr);
        }

        let hostname = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if hostname.is_empty() {
            return Err("Connected but could not retrieve hostname. The Docker daemon may not be fully accessible.".to_string());
        }

        Ok(hostname)
    }
}

#[tauri::command]
pub async fn list_ssh_keys() -> Result<Vec<crate::models::SshKeyInfo>, String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let ssh_dir = std::path::Path::new(&home).join(".ssh");

    if !ssh_dir.exists() {
        return Ok(vec![]);
    }

    let mut keys = Vec::new();
    let entries = std::fs::read_dir(&ssh_dir).map_err(|e| format!("Failed to read ~/.ssh: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        // Skip directories, .pub files, known_hosts, config, authorized_keys
        if path.is_dir() { continue; }
        let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
        if filename.ends_with(".pub")
            || filename == "known_hosts"
            || filename == "known_hosts.old"
            || filename == "config"
            || filename == "authorized_keys"
            || filename.starts_with(".")
        {
            continue;
        }

        // Try to detect if it's a private key by reading first line
        if let Ok(content) = std::fs::read_to_string(&path) {
            let first_line = content.lines().next().unwrap_or("");
            if first_line.contains("PRIVATE KEY") || first_line.contains("OPENSSH PRIVATE KEY") {
                let has_pub = ssh_dir.join(format!("{}.pub", filename)).exists();
                keys.push(crate::models::SshKeyInfo {
                    name: filename,
                    path: path.to_string_lossy().to_string(),
                    has_public_key: has_pub,
                });
            }
        }
    }

    keys.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(keys)
}

#[tauri::command]
pub async fn configure_ssh_host(hostname: String, user: String, port: Option<u16>, identity_file: String) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let ssh_dir = std::path::Path::new(&home).join(".ssh");
    let config_path = ssh_dir.join("config");

    // Ensure ~/.ssh directory exists
    if !ssh_dir.exists() {
        std::fs::create_dir_all(&ssh_dir).map_err(|e| format!("Failed to create ~/.ssh: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&ssh_dir, std::fs::Permissions::from_mode(0o700))
                .map_err(|e| format!("Failed to set permissions on ~/.ssh: {}", e))?;
        }
    }

    // Validate identity file exists
    if !std::path::Path::new(&identity_file).exists() {
        return Err(format!("SSH key file not found: {}", identity_file));
    }

    // Build the new host block
    let port_val = port.unwrap_or(22);
    let host_block = format!(
        "\n# Docker NM - Managed entry for {hostname}\nHost {hostname}\n    HostName {hostname}\n    User {user}\n    Port {port_val}\n    IdentityFile {identity_file}\n    StrictHostKeyChecking accept-new\n",
    );

    // Read existing config
    let existing_config = if config_path.exists() {
        std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read SSH config: {}", e))?
    } else {
        String::new()
    };

    // Check if a host entry already exists for this hostname (managed by Docker NM)
    let marker = format!("# Docker NM - Managed entry for {}", hostname);
    if existing_config.contains(&marker) {
        // Replace the existing block
        let mut new_config = String::new();
        let mut skip = false;
        for line in existing_config.lines() {
            if line.contains(&marker) {
                skip = true;
                continue;
            }
            if skip {
                // Skip until we find a line that starts a new Host block or marker
                if line.starts_with("Host ") || line.starts_with("# Docker NM -") {
                    skip = false;
                    new_config.push_str(line);
                    new_config.push('\n');
                }
                // else skip
                continue;
            }
            new_config.push_str(line);
            new_config.push('\n');
        }
        new_config.push_str(&host_block);
        std::fs::write(&config_path, new_config)
            .map_err(|e| format!("Failed to write SSH config: {}", e))?;
    } else {
        // Append
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&config_path)
            .map_err(|e| format!("Failed to open SSH config: {}", e))?;
        use std::io::Write;
        file.write_all(host_block.as_bytes())
            .map_err(|e| format!("Failed to write SSH config: {}", e))?;
    }

    // Set proper permissions on config file
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("Failed to set permissions on SSH config: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_ssh_host_config(hostname: String) -> Result<(), String> {
    let home = std::env::var("HOME").map_err(|_| "Could not find HOME directory".to_string())?;
    let config_path = std::path::Path::new(&home).join(".ssh").join("config");

    if !config_path.exists() {
        return Ok(());
    }

    let existing_config = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read SSH config: {}", e))?;

    let marker = format!("# Docker NM - Managed entry for {}", hostname);
    if !existing_config.contains(&marker) {
        return Ok(()); // Nothing to remove
    }

    let mut new_config = String::new();
    let mut skip = false;
    for line in existing_config.lines() {
        if line.contains(&marker) {
            skip = true;
            continue;
        }
        if skip {
            if line.starts_with("Host ") || line.starts_with("# Docker NM -") || (line.trim().is_empty() && !new_config.is_empty()) {
                if line.starts_with("Host ") || line.starts_with("# Docker NM -") {
                    skip = false;
                    new_config.push_str(line);
                    new_config.push('\n');
                }
                continue;
            }
            continue;
        }
        new_config.push_str(line);
        new_config.push('\n');
    }

    std::fs::write(&config_path, new_config)
        .map_err(|e| format!("Failed to write SSH config: {}", e))?;

    Ok(())
}
