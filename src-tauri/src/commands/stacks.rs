/*
 * File: stacks.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
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
    let containers = docker
        .list_containers(Some(ListContainersOptions::<String> {
            all: true,
            ..Default::default()
        }))
        .await
        .map_err(|e| e.to_string())?;

    let mut stacks: HashMap<String, (usize, bool, i64, i64)> = HashMap::new();

    for c in containers {
        if let Some(labels) = c.labels {
            if let Some(stack_name) = labels.get("com.docker.compose.project") {
                let created = c.created.unwrap_or(0);
                let entry = stacks.entry(stack_name.clone()).or_insert((0, true, created, created));
                entry.0 += 1;
                if c.state.as_deref() != Some("running") {
                    entry.1 = false;
                }
                if created < entry.2 && created != 0 {
                    entry.2 = created;
                }
                if created > entry.3 {
                    entry.3 = created;
                }
            }
        }
    }

    Ok(stacks
        .into_iter()
        .map(|(name, (services, all_running, created, updated))| StackInfo {
            name,
            services,
            status: if all_running { "running".into() } else { "degraded".into() },
            created,
            updated,
        })
        .collect())
}

#[tauri::command]
pub async fn deploy_stack(app: AppHandle, name: String, compose_content: String) -> Result<(), String> {
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
pub async fn remove_stack(name: String) -> Result<(), String> {
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
pub async fn stop_stack(name: String) -> Result<(), String> {
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
pub async fn start_stack(app: AppHandle, name: String) -> Result<(), String> {
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
pub async fn restart_stack(name: String) -> Result<(), String> {
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
pub async fn update_stack(app: AppHandle, name: String) -> Result<(), String> {
    use tauri::Manager;
    let app_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
    let stacks_dir = app_dir.join("stacks");
    let compose_file = stacks_dir.join(format!("compose-{}.yaml", name));

    if !compose_file.exists() {
        return Err("Compose file not found. Cannot update stack created outside this app.".into());
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
