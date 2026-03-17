/*
 * File: containers.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::container::{ListContainersOptions, StartContainerOptions, StopContainerOptions, RemoveContainerOptions, LogsOptions, RestartContainerOptions, CreateContainerOptions, Config, StatsOptions, MemoryStatsStats, InspectContainerOptions};
use bollard::models::{HostConfig, PortBinding};
use bollard::exec::{CreateExecOptions, StartExecResults};
use futures_util::stream::StreamExt;
use std::collections::HashMap;
use tokio::sync::mpsc;
use tokio::io::AsyncWriteExt;
use tauri::{AppHandle, Emitter};
use crate::models::{ContainerInfo, ContainerStats};
use crate::utils::{get_docker, TerminalSenders};

#[tauri::command]
pub async fn get_containers() -> Result<Vec<ContainerInfo>, String> {
    let docker = get_docker()?;
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
        .into_iter()
        .map(|c| {
            let networks = c.network_settings.and_then(|ns| ns.networks);
            let ip_address = networks
                .and_then(|nets| nets.values().next().cloned())
                .and_then(|net| net.ip_address)
                .unwrap_or_else(|| "".to_string());

            ContainerInfo {
                id: c.id.unwrap_or_default(),
                name: c.names.unwrap_or_default().first().map(|s| s.trim_start_matches('/').to_string()).unwrap_or_else(|| "unnamed".to_string()),
                image: c.image.unwrap_or_default(),
                status: c.state.unwrap_or_default(),
                state: c.status.unwrap_or_default(),
                ports: c.ports.unwrap_or_default().iter().map(|p| {
                    let typ = match &p.typ {
                        Some(bollard::models::PortTypeEnum::TCP) => "tcp",
                        Some(bollard::models::PortTypeEnum::UDP) => "udp",
                        Some(bollard::models::PortTypeEnum::SCTP) => "sctp",
                        _ => "",
                    };
                    if let Some(pub_port) = p.public_port {
                        format!("{}:{}->{}/{}", p.ip.as_deref().unwrap_or(""), pub_port, p.private_port, typ)
                    } else {
                        format!("{}/{}", p.private_port, typ)
                    }
                }).collect::<Vec<_>>().join(", "),
                created: c.created.unwrap_or(0),
                ip_address,
                labels: c.labels.unwrap_or_default(),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn start_container(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.start_container(&id, None::<StartContainerOptions<String>>).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn stop_container(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.stop_container(&id, None::<StopContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restart_container(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.restart_container(&id, None::<RestartContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_container(id: String) -> Result<(), String> {
    let docker = get_docker()?;
    docker.remove_container(&id, None::<RemoveContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_container(
    name: String,
    image: String,
    ports: Vec<String>,
    envs: Vec<String>,
    volumes: Vec<String>,
) -> Result<(), String> {
    let docker = get_docker()?;

    let options = if name.trim().is_empty() {
        None
    } else {
        Some(CreateContainerOptions {
            name,
            ..Default::default()
        })
    };

    let mut port_bindings = HashMap::new();
    let mut exposed_ports = HashMap::new();

    for port_mapping in ports {
        let parts: Vec<&str> = port_mapping.split(':').collect();
        if parts.len() == 2 {
            let host_port = parts[0].to_string();
            let mut container_port = parts[1].to_string();
            if !container_port.contains('/') {
                container_port = format!("{}/tcp", container_port);
            }

            port_bindings.insert(
                container_port.clone(),
                Some(vec![PortBinding {
                    host_ip: Some("0.0.0.0".to_string()),
                    host_port: Some(host_port),
                }]),
            );
            exposed_ports.insert(container_port, HashMap::new());
        }
    }

    let host_config = HostConfig {
        port_bindings: if port_bindings.is_empty() {
            None
        } else {
            Some(port_bindings)
        },
        binds: if volumes.is_empty() {
            None
        } else {
            Some(volumes)
        },
        ..Default::default()
    };

    let config = Config {
        image: Some(image),
        env: if envs.is_empty() { None } else { Some(envs) },
        exposed_ports: if exposed_ports.is_empty() {
            None
        } else {
            Some(exposed_ports)
        },
        host_config: Some(host_config),
        ..Default::default()
    };

    docker
        .create_container(options, config)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_container_logs(
    id: String,
    timestamps: bool,
    tail: Option<usize>,
    since: Option<u64>,
) -> Result<String, String> {
    let docker = get_docker()?;

    let logs_options = LogsOptions {
        follow: false,
        stdout: true,
        stderr: true,
        timestamps: timestamps,
        tail: tail.map(|t| t.to_string()).unwrap_or_else(|| "all".to_string()),
        since: since.map(|s| s as i64).unwrap_or(0),
        ..Default::default()
    };

    let mut logs_stream = docker.logs(&id, Some(logs_options));
    let mut logs_output = String::new();

    while let Some(log) = logs_stream.next().await {
        logs_output.push_str(&format!("{}", log.map_err(|e| e.to_string())?));
    }

    Ok(logs_output)
}

#[tauri::command]
pub async fn get_container_stats(id: String) -> Result<ContainerStats, String> {
    let docker = get_docker()?;
    
    let mut stats_stream = docker.stats(&id, Some(StatsOptions {
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

        return Ok(ContainerStats {
            cpu_percent,
            memory_usage: actual_memory,
            memory_limit,
        });
    }

    Err("Could not get stats".into())
}

#[tauri::command]
pub async fn inspect_container(id: String) -> Result<String, String> {
    let docker = get_docker()?;
    let inspect = docker.inspect_container(&id, None::<InspectContainerOptions>).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn exec_container(
    app: AppHandle,
    senders: tauri::State<'_, TerminalSenders>,
    container_id: String,
    shell: String,
    user: Option<String>,
) -> Result<(), String> {
    let docker = get_docker()?;

    let shell_path = match shell.as_str() {
        "bash" => "/bin/bash",
        "ash" => "/bin/ash",
        _ => "/bin/sh",
    };

    let mut exec_config = CreateExecOptions {
        attach_stdout: Some(true),
        attach_stderr: Some(true),
        attach_stdin: Some(true),
        tty: Some(true),
        cmd: Some(vec![shell_path]),
        ..Default::default()
    };

    if let Some(ref u) = user {
        if !u.is_empty() {
            exec_config.user = Some(u.as_str());
        }
    }

    let exec = docker.create_exec(&container_id, exec_config).await.map_err(|e| e.to_string())?;

    if let StartExecResults::Attached { mut output, mut input } = docker
        .start_exec(&exec.id, None)
        .await
        .map_err(|e| e.to_string())?
    {
        let (tx, mut rx) = mpsc::channel::<String>(64);
        {
            let mut map = senders.lock().unwrap();
            map.insert(container_id.clone(), tx);
        }

        // Spawn stdin writer task
        tokio::spawn(async move {
            while let Some(data) = rx.recv().await {
                let _ = input.write_all(data.as_bytes()).await;
            }
        });

        // Read output and emit to frontend
        while let Some(msg) = output.next().await {
            if let Ok(msg) = msg {
                app.emit(&format!("exec-output-{}", container_id), msg.to_string())
                    .map_err(|e| e.to_string())?;
            }
        }

        // Clean up sender when process exits
        senders.lock().unwrap().remove(&container_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn write_stdin(
    senders: tauri::State<'_, TerminalSenders>,
    container_id: String,
    data: String,
) -> Result<(), String> {
    let map = senders.lock().unwrap();
    if let Some(tx) = map.get(&container_id) {
        tx.try_send(data).map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("No active terminal session for this container".to_string())
    }
}
