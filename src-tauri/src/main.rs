// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use bollard::Docker;
use bollard::container::{ListContainersOptions, StartContainerOptions, StopContainerOptions, RemoveContainerOptions, LogsOptions, RestartContainerOptions, CreateContainerOptions, Config, StatsOptions, MemoryStatsStats, InspectContainerOptions};
use bollard::image::{ListImagesOptions, RemoveImageOptions, CreateImageOptions};
use bollard::models::{HostConfig, PortBinding};
use bollard::volume::{ListVolumesOptions, RemoveVolumeOptions, CreateVolumeOptions};
use bollard::network::{ListNetworksOptions, CreateNetworkOptions, InspectNetworkOptions};
use futures_util::stream::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use bollard::exec::{CreateExecOptions, StartExecResults};
use tokio::sync::mpsc;
use tokio::io::AsyncWriteExt;

type TerminalSenders = Mutex<HashMap<String, mpsc::Sender<String>>>;

#[derive(Serialize)]
struct ContainerInfo {
    id: String,
    name: String,
    image: String,
    status: String,
    state: String,
    ports: String,
    labels: HashMap<String, String>,
}

#[derive(Serialize)]
struct ImageInfo {
    id: String,
    repository: String,
    tag: String,
    size: String,
    created: String,
}

#[derive(Serialize)]
struct VolumeInfo {
    name: String,
    driver: String,
    mountpoint: String,
}

#[derive(Serialize)]
struct NetworkInfo {
    id: String,
    name: String,
    driver: String,
    scope: String,
}

#[derive(Serialize)]
struct StackInfo {
    name: String,
    status: String,
    services: usize,
}

#[tauri::command]
async fn get_containers() -> Result<Vec<ContainerInfo>, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    Ok(containers
        .into_iter()
        .map(|c| ContainerInfo {
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
            labels: c.labels.unwrap_or_default(),
        })
        .collect())
}

#[tauri::command]
async fn get_images() -> Result<Vec<ImageInfo>, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
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
            }
        })
        .collect())
}

#[tauri::command]
async fn start_container(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.start_container(&id, None::<StartContainerOptions<String>>).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn stop_container(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.stop_container(&id, None::<StopContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn restart_container(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.restart_container(&id, None::<RestartContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_container(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.remove_container(&id, None::<RemoveContainerOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_container(
    name: String,
    image: String,
    ports: Vec<String>,
    envs: Vec<String>,
    volumes: Vec<String>,
) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;

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
async fn delete_image(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.remove_image(&id, None::<RemoveImageOptions>, None).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn pull_image(app_handle: AppHandle, image: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    
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
async fn get_volumes() -> Result<Vec<VolumeInfo>, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let volumes = docker.list_volumes(None::<ListVolumesOptions<String>>).await.map_err(|e| e.to_string())?;
    
    Ok(volumes.volumes.unwrap_or_default().into_iter().map(|v| VolumeInfo {
        name: v.name,
        driver: v.driver,
        mountpoint: v.mountpoint,
    }).collect())
}

#[tauri::command]
async fn get_networks() -> Result<Vec<NetworkInfo>, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let networks = docker.list_networks(None::<ListNetworksOptions<String>>).await.map_err(|e| e.to_string())?;
    
    Ok(networks.into_iter().map(|n| NetworkInfo {
        id: n.id.unwrap_or_default().chars().take(12).collect(),
        name: n.name.unwrap_or_default(),
        driver: n.driver.unwrap_or_default(),
        scope: n.scope.unwrap_or_default(),
    }).collect())
}

#[tauri::command]
async fn delete_volume(name: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.remove_volume(&name, None::<RemoveVolumeOptions>).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_volume(name: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let options = CreateVolumeOptions {
        name,
        ..Default::default()
    };
    docker.create_volume(options).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_network(id: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    docker.remove_network(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn create_network(name: String) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let options = CreateNetworkOptions {
        name,
        ..Default::default()
    };
    docker.create_network(options).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_container_logs(
    id: String,
    timestamps: bool,
    tail: Option<usize>,
    since: Option<u64>, // Unix timestamp in seconds
) -> Result<String, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;

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

#[derive(Serialize, Clone)]
struct ContainerStats {
    cpu_percent: f64,
    memory_usage: u64,
    memory_limit: u64,
}

#[tauri::command]
async fn get_container_stats(id: String) -> Result<ContainerStats, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    
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
async fn get_stacks() -> Result<Vec<StackInfo>, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut stacks: HashMap<String, (usize, bool)> = HashMap::new();

    for c in containers {
        if let Some(labels) = c.labels {
            if let Some(stack_name) = labels.get("com.docker.compose.project") {
                let entry = stacks.entry(stack_name.clone()).or_insert((0, true));
                entry.0 += 1;
                if c.state.as_deref() != Some("running") {
                    entry.1 = false;
                }
            }
        }
    }

    Ok(stacks
        .into_iter()
        .map(|(name, (services, all_running))| StackInfo {
            name,
            services,
            status: if all_running { "running".into() } else { "degraded".into() },
        })
        .collect())
}

#[tauri::command]
async fn deploy_stack(app: AppHandle, name: String, compose_content: String) -> Result<(), String> {
    use std::io::Write;
    use tauri::Manager;

    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    std::fs::create_dir_all(&stacks_dir).map_err(|e| e.to_string())?;
    
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));
    
    let mut file = std::fs::File::create(&compose_file).map_err(|e| e.to_string())?;
    file.write_all(compose_content.as_bytes()).map_err(|e| e.to_string())?;

    let output = std::process::Command::new("docker")
        .arg("compose")
        .arg("-p")
        .arg(&name)
        .arg("-f")
        .arg(&compose_file)
        .arg("up")
        .arg("-d")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
async fn remove_stack(name: String) -> Result<(), String> {
    let output = std::process::Command::new("docker")
        .arg("compose")
        .arg("-p")
        .arg(&name)
        .arg("down")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
async fn get_stack_compose(app: AppHandle, name: String) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));
    
    match std::fs::read_to_string(&compose_file) {
        Ok(content) => Ok(content),
        Err(_) => Err("Compose file not found. It might have been created outside this app.".to_string()),
    }
}

use tauri::{AppHandle, Emitter};

#[tauri::command]
async fn docker_system_prune() -> Result<String, String> {
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
async fn inspect_container(id: String) -> Result<String, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let inspect = docker.inspect_container(&id, None::<InspectContainerOptions>).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}

#[tauri::command]
async fn inspect_image(id: String) -> Result<String, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let inspect = docker.inspect_image(&id).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}

#[tauri::command]
async fn exec_container(
    app: AppHandle,
    senders: tauri::State<'_, TerminalSenders>,
    container_id: String,
    shell: String,
    user: Option<String>,
) -> Result<(), String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;

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
async fn write_stdin(
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

#[tauri::command]
async fn inspect_volume(name: String) -> Result<String, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let inspect = docker.inspect_volume(&name).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}

#[tauri::command]
async fn inspect_network(id: String) -> Result<String, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
    let inspect = docker.inspect_network(&id, None::<InspectNetworkOptions<String>>).await.map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&inspect).map_err(|e| e.to_string())
}

#[derive(Serialize)]
struct SystemInfo {
    containers: usize,
    containers_running: usize,
    containers_paused: usize,
    containers_stopped: usize,
    images: usize,
    version: String,
    operating_system: String,
    ncpu: i64,
    mem_total: i64,
}

#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    let docker = Docker::connect_with_local_defaults().map_err(|e| e.to_string())?;
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
        ncpu: info.ncpu.unwrap_or(0),
        mem_total: info.mem_total.unwrap_or(0),
    })
}

use bollard::system::EventsOptions;

async fn listen_to_docker_events(app_handle: AppHandle) {
    let docker = match Docker::connect_with_local_defaults() {
        Ok(d) => d,
        Err(_) => return,
    };

    let mut events = docker.events(None::<EventsOptions<String>>);

    while let Some(event) = events.next().await {
        if let Ok(event) = event {
            let _ = app_handle.emit("docker-event", event);
        }
    }
}

async fn emit_container_stats(app_handle: AppHandle) {
    let docker = match Docker::connect_with_local_defaults() {
        Ok(d) => d,
        Err(_) => return,
    };

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;

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

                    let payload = ContainerStats {
                        cpu_percent,
                        memory_usage: actual_memory,
                        memory_limit,
                    };

                    let _ = app_handle.emit(&format!("container-stats-{}", id_clone), payload);
                }
            }
        }
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let handle_stats = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                listen_to_docker_events(handle).await;
            });

            tauri::async_runtime::spawn(async move {
                emit_container_stats(handle_stats).await;
            });

            Ok(())
        })
        .manage(TerminalSenders::new(HashMap::new()))
        .invoke_handler(tauri::generate_handler![
            get_containers,
            get_images,
            get_volumes,
            get_networks,
            get_stacks,
            deploy_stack,
            remove_stack,
            get_stack_compose,
            start_container,
            stop_container,
            restart_container,
            delete_container,
            create_container,
            delete_image,
            pull_image,
            delete_volume,
            create_volume,
            delete_network,
            create_network,
            get_container_logs,
            get_container_stats,
            docker_system_prune,
            inspect_container,
            inspect_image,
            inspect_volume,
            inspect_network,
            get_system_info,
            exec_container,
            write_stdin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
