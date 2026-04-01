/*
 * File: stacks.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Wed Apr 01 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::container::ListContainersOptions;
use std::collections::HashMap;
use tauri::AppHandle;
use crate::models::StackInfo;
use crate::utils::get_docker;

#[tauri::command]
pub async fn get_stacks() -> Result<Vec<StackInfo>, String> {
    let docker = get_docker()?;
    
    // 1. Get all containers for Compose stacks
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    struct StackStats {
        total: usize,
        running: usize,
        exited: usize,
        completed: usize,
        failed: usize,
        created: i64,
        updated: i64,
        stack_type: String,
    }

    let mut stacks: HashMap<String, StackStats> = HashMap::new();

    // Process containers (mainly for Compose)
    for c in containers {
        if let Some(labels) = c.labels {
            if let Some(name) = labels.get("com.docker.compose.project") {
                let created = c.created.unwrap_or(0);
                let state = c.state.as_deref().unwrap_or("");
                let status = c.status.as_deref().unwrap_or("");
                
                let stats = stacks.entry(name.clone()).or_insert_with(|| {
                    StackStats {
                        total: 0,
                        running: 0,
                        exited: 0,
                        completed: 0,
                        failed: 0,
                        created,
                        updated: created,
                        stack_type: "Compose".into(),
                    }
                });

                stats.total += 1;
                match state {
                    "running" => stats.running += 1,
                    "exited" => {
                        stats.exited += 1;
                        if status.contains("Exited (0)") {
                            stats.completed += 1;
                        } else {
                            stats.failed += 1;
                        }
                    }
                    _ => {}
                }

                if created != 0 && (stats.created == 0 || created < stats.created) {
                    stats.created = created;
                }
                if created > stats.updated {
                    stats.updated = created;
                }
            }
        }
    }

    // 2. Check for Swarm stacks via CLI (Cluster-wide) - OPTIMIZED & ROBUST
    if let Ok(info) = docker.info().await {
        let is_swarm = info.swarm.and_then(|s| s.local_node_state).map(|st| st == bollard::models::LocalNodeState::ACTIVE).unwrap_or(false);
        
        if is_swarm {
            // Get all service IDs first
            let list_output = std::process::Command::new("docker")
                .args(["service", "ls", "-q"])
                .output()
                .ok();

            if let Some(l_out) = list_output {
                if l_out.status.success() {
                    let ids_str = String::from_utf8_lossy(&l_out.stdout);
                    let ids: Vec<&str> = ids_str.lines().filter(|l| !l.trim().is_empty()).collect();

                    if !ids.is_empty() {
                        // Inspect all services in one go to get full details (including labels and replicas)
                        let mut inspect_args = vec!["service", "inspect", "--format", "{{json .}}"];
                        inspect_args.extend(ids);

                        let inspect_output = std::process::Command::new("docker")
                            .args(inspect_args)
                            .output()
                            .ok();

                        if let Some(i_out) = inspect_output {
                            if i_out.status.success() {
                                let stdout = String::from_utf8_lossy(&i_out.stdout);
                                for line in stdout.lines() {
                                    if line.trim().is_empty() { continue; }
                                    // docker service inspect --format "{{json .}}" returns one JSON per line
                                    if let Ok(service) = serde_json::from_str::<serde_json::Value>(line) {
                                        let labels = service.get("Spec").and_then(|s| s.get("Labels"));
                                        if let Some(stack_name) = labels.and_then(|l| l.get("com.docker.stack.namespace")).and_then(|n| n.as_str()) {
                                            let stats = stacks.entry(stack_name.to_string()).or_insert_with(|| {
                                                StackStats {
                                                    total: 0,
                                                    running: 0,
                                                    exited: 0,
                                                    completed: 0,
                                                    failed: 0,
                                                    created: 0,
                                                    updated: 0,
                                                    stack_type: "Swarm".into(),
                                                }
                                            });

                                            stats.total += 1;

                                            // Determine health from Service Status (populated by --status flag)
                                            let mut running = service.get("ServiceStatus")
                                                .and_then(|s| s.get("RunningTasks"))
                                                .and_then(|v| v.as_u64())
                                                .unwrap_or(0);
                                            let mut desired = service.get("ServiceStatus")
                                                .and_then(|s| s.get("DesiredTasks"))
                                                .and_then(|v| v.as_u64())
                                                .unwrap_or(0);

                                            // Fallback if ServiceStatus is missing or empty
                                            if desired == 0 {
                                                if let Some(spec_mode) = service.get("Spec").and_then(|s| s.get("Mode")) {
                                                    if let Some(replicated) = spec_mode.get("Replicated") {
                                                        desired = replicated.get("Replicas").and_then(|r| r.as_u64()).unwrap_or(0);
                                                    } else if spec_mode.get("Global").is_some() {
                                                        // Global services have no fixed desired replicas in Spec, 
                                                        // but they are intended to run. 
                                                        desired = 1; 
                                                    }
                                                }
                                                // If we found a desired count > 0 but have no running info (missing ServiceStatus),
                                                // assume it is running for status purposes to avoid "Stopped" false positives.
                                                if running == 0 && desired > 0 {
                                                    running = desired;
                                                }
                                            }

                                            if desired > 0 {
                                                if running == desired {
                                                    stats.running += 1;
                                                } else if running > 0 {
                                                    stats.running += 1; // Partial counts as running for overall stack status
                                                } else {
                                                    stats.exited += 1;
                                                }
                                            } else {
                                                stats.exited += 1;
                                            }

                                            // Created time
                                            if let Some(created_str) = service.get("CreatedAt").and_then(|c| c.as_str()) {
                                                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(created_str) {
                                                    let ts = dt.timestamp();
                                                    if stats.created == 0 || ts < stats.created {
                                                        stats.created = ts;
                                                    }
                                                    if ts > stats.updated {
                                                        stats.updated = ts;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut result: Vec<StackInfo> = stacks
        .into_iter()
        .map(|(name, stats)| {
            let status = if stats.total == 0 {
                "inactive".into()
            } else if stats.running == stats.total {
                "running".into()
            } else if stats.completed == stats.total {
                "completed".into()
            } else if stats.exited == stats.total {
                if stats.failed > 0 { "failed".into() } else { "stopped".into() }
            } else if stats.running > 0 {
                "partial".into()
            } else if stats.failed > 0 {
                "failed".into()
            } else {
                "degraded".into()
            };

            StackInfo {
                name,
                services: stats.total,
                status,
                created: stats.created,
                updated: stats.updated,
                stack_type: stats.stack_type,
            }
        })
        .collect();

    // Sort by Created descending (most recent first)
    result.sort_by(|a, b| b.created.cmp(&a.created));

    Ok(result)
}

#[tauri::command]
pub async fn deploy_stack(app: AppHandle, name: String, compose_content: String, env_content: Option<String>, stack_type: String) -> Result<(), String> {
    use std::io::Write;
    use tauri::Manager;
    use uuid::Uuid;

    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    std::fs::create_dir_all(&stacks_dir).map_err(|e| e.to_string())?;
    
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));
    
    let mut file = std::fs::File::create(&compose_file).map_err(|e| e.to_string())?;
    file.write_all(compose_content.as_bytes()).map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new("docker");
    
    if stack_type == "Swarm" {
        cmd.arg("stack").arg("deploy").arg("-c").arg(&compose_file).arg(&name);
    } else {
        cmd.arg("compose")
            .arg("-p")
            .arg(&name)
            .arg("-f")
            .arg(&compose_file);

        let mut temp_env_file: Option<std::path::PathBuf> = None;
        if let Some(env_c) = env_content {
            let env_filename = format!(".env.{}", Uuid::new_v4());
            let env_file_path = stacks_dir.join(env_filename);
            let mut env_file = std::fs::File::create(&env_file_path).map_err(|e| e.to_string())?;
            env_file.write_all(env_c.as_bytes()).map_err(|e| e.to_string())?;
            cmd.arg("--env-file").arg(&env_file_path);
            temp_env_file = Some(env_file_path);
        }

        cmd.arg("up").arg("-d");

        let output = cmd.output().map_err(|e| e.to_string())?;

        // Clean up temporary .env file
        if let Some(path) = temp_env_file {
            let _ = std::fs::remove_file(path);
        }

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        return Ok(());
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_stack(name: String, stack_type: String) -> Result<(), String> {
    let mut cmd = std::process::Command::new("docker");
    if stack_type == "Swarm" {
        cmd.arg("stack").arg("rm").arg(&name);
    } else {
        cmd.arg("compose").arg("-p").arg(&name).arg("down");
    }
    
    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_stack(name: String, stack_type: String) -> Result<(), String> {
    if stack_type == "Swarm" {
        // Find all services in this stack
        let output = std::process::Command::new("docker")
            .args(["service", "ls", "--filter", &format!("label=com.docker.stack.namespace={}", name), "--format", "{{.ID}}"])
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for service_id in stdout.lines() {
            if service_id.trim().is_empty() { continue; }
            let _ = std::process::Command::new("docker")
                .args(["service", "scale", &format!("{}=0", service_id.trim())])
                .output();
        }
        return Ok(());
    }
    let output = std::process::Command::new("docker")
        .arg("compose")
        .arg("-p")
        .arg(&name)
        .arg("stop")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn start_stack(app: AppHandle, name: String, stack_type: String) -> Result<(), String> {
    if stack_type == "Swarm" {
        // Try to find services first. If they exist but are scaled to 0, we can start them.
        // If we have a compose file, redeploying is better.
        use tauri::Manager;
        let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
        let stacks_dir = app_dir.join("stacks");
        let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));
        
        if compose_file.exists() {
            let output = std::process::Command::new("docker")
                .arg("stack")
                .arg("deploy")
                .arg("-c")
                .arg(&compose_file)
                .arg(&name)
                .output()
                .map_err(|e| e.to_string())?;
            
            if !output.status.success() {
                return Err(String::from_utf8_lossy(&output.stderr).to_string());
            }
            return Ok(());
        } else {
            // No compose file, but maybe services exist (remote context case)
            // Scale them to 1
            let output = std::process::Command::new("docker")
                .args(["service", "ls", "--filter", &format!("label=com.docker.stack.namespace={}", name), "--format", "{{.ID}}"])
                .output()
                .map_err(|e| e.to_string())?;

            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let ids: Vec<&str> = stdout.lines().filter(|l| !l.trim().is_empty()).collect();
                
                if !ids.is_empty() {
                    for service_id in ids {
                        let _ = std::process::Command::new("docker")
                            .args(["service", "scale", &format!("{}=1", service_id.trim())])
                            .output();
                    }
                    return Ok(());
                }
            }
            return Err("Compose file not found and no services found for this Swarm stack.".into());
        }
    }

    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));

    let mut cmd = std::process::Command::new("docker");
    cmd.arg("compose").arg("-p").arg(&name);

    if compose_file.exists() {
        cmd.arg("-f").arg(&compose_file).arg("up").arg("-d");
    } else {
        cmd.arg("start");
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn restart_stack(name: String, stack_type: String) -> Result<(), String> {
    if stack_type == "Swarm" {
        // Find all services in this stack and update --force
        let output = std::process::Command::new("docker")
            .args(["service", "ls", "--filter", &format!("label=com.docker.stack.namespace={}", name), "--format", "{{.ID}}"])
            .output()
            .map_err(|e| e.to_string())?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for service_id in stdout.lines() {
            if service_id.trim().is_empty() { continue; }
            let _ = std::process::Command::new("docker")
                .args(["service", "update", "--force", service_id.trim()])
                .output();
        }
        return Ok(());
    }
    let output = std::process::Command::new("docker")
        .arg("compose")
        .arg("-p")
        .arg(&name)
        .arg("restart")
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn update_stack(app: AppHandle, name: String, stack_type: String) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));

    if !compose_file.exists() {
        return Err("Compose file not found. Cannot update stack created outside this app.".into());
    }

    if stack_type == "Swarm" {
        // For swarm, update is just redeploying with latest images (if images are pulled)
        // Note: docker stack deploy --resolve-image=always is often used
        let output = std::process::Command::new("docker")
            .arg("stack")
            .arg("deploy")
            .arg("-c")
            .arg(&compose_file)
            .arg(&name)
            .output()
            .map_err(|e| e.to_string())?;
        
        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }
        return Ok(());
    }

    // Pull latest images
    let _ = std::process::Command::new("docker")
        .arg("compose")
        .arg("-p")
        .arg(&name)
        .arg("-f")
        .arg(&compose_file)
        .arg("pull")
        .output()
        .map_err(|e| e.to_string())?;

    // Up -d to recreate containers with new images
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
pub async fn get_stack_logs(app: AppHandle, name: String, tail: Option<usize>) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));

    let mut cmd = std::process::Command::new("docker");
    cmd.arg("compose").arg("-p").arg(&name);
    
    if compose_file.exists() {
        cmd.arg("-f").arg(&compose_file);
    }

    cmd.arg("logs").arg("--no-color");

    if let Some(t) = tail {
        cmd.arg("--tail").arg(t.to_string());
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string() + &String::from_utf8_lossy(&output.stderr))
}

#[tauri::command]
pub async fn get_stack_compose(app: AppHandle, name: String) -> Result<String, String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));
    
    match std::fs::read_to_string(&compose_file) {
        Ok(content) => Ok(content),
        Err(_) => Err("Compose file not found. It might have been created outside this app.".to_string()),
    }
}

#[tauri::command]
pub async fn scale_stack_service(app: AppHandle, name: String, service: String, scale: u32) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));

    let mut cmd = std::process::Command::new("docker");
    cmd.arg("compose").arg("-p").arg(&name);

    if compose_file.exists() {
        cmd.arg("-f").arg(&compose_file);
    }

    let output = cmd
        .arg("up")
        .arg("-d")
        .arg("--scale")
        .arg(format!("{}={}", service, scale))
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}
