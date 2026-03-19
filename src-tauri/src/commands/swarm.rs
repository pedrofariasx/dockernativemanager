/*
 * File: swarm.rs
 * Project: docker-native-manager
 * Created: 2026-03-19
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 */

use bollard::service::ListServicesOptions;
use bollard::models::LocalNodeState;
use crate::models::{SwarmInfo, NodeInfo, ServiceInfo};
use crate::utils::get_docker;

#[tauri::command]
pub async fn get_swarm_info() -> Result<Option<SwarmInfo>, String> {
    let docker = get_docker()?;
    let info = docker.info().await.map_err(|e: bollard::errors::Error| e.to_string())?;

    // Check if swarm is active
    let swarm_state = info.swarm.as_ref().and_then(|s| s.local_node_state.as_ref());
    if swarm_state != Some(&LocalNodeState::ACTIVE) {
        return Ok(None);
    }

    let swarm = info.swarm.ok_or("Swarm info missing")?;
    let id = swarm.node_id.unwrap_or_default();
    let is_manager = swarm.control_available.unwrap_or(false);

    // Get nodes to count them
    let nodes_count = swarm.nodes.unwrap_or(0) as usize;

    // Get managers count if possible
    let managers_count = swarm.managers.unwrap_or(0) as usize;

    Ok(Some(SwarmInfo {
        id,
        created_at: "".to_string(), // Not easily available in info
        updated_at: "".to_string(),
        nodes: nodes_count,
        managers: managers_count,
        is_manager,
    }))
}

/*
#[tauri::command]
pub async fn list_nodes() -> Result<Vec<NodeInfo>, String> {
    let docker = get_docker()?;
    let nodes = docker.list_nodes(None::<bollard::node::ListNodesOptions<String>>).await.map_err(|e: bollard::errors::Error| e.to_string())?;

    Ok(nodes.into_iter().map(|n| {
        let id = n.id.unwrap_or_default();
        let hostname = n.description.as_ref().and_then(|d| d.hostname.clone()).unwrap_or_default();
        let role = match n.spec.as_ref().and_then(|s| s.role.as_ref()) {
            Some(bollard::models::NodeSpecRoleEnum::MANAGER) => "manager".to_string(),
            Some(bollard::models::NodeSpecRoleEnum::WORKER) => "worker".to_string(),
            _ => "unknown".to_string(),
        };
        let status = n.status.as_ref().and_then(|s| s.state.as_ref()).map(|s| format!("{:?}", s)).unwrap_or_default();
        let availability = n.spec.as_ref().and_then(|s| s.availability.as_ref()).map(|a| format!("{:?}", a)).unwrap_or_default();
        let ip_address = n.status.as_ref().and_then(|s| s.addr.clone()).unwrap_or_default();
        let engine_version = n.description.as_ref().and_then(|d| d.engine.as_ref()).and_then(|e| e.engine_version.clone()).unwrap_or_default();

        NodeInfo {
            id,
            hostname,
            role,
            status,
            availability,
            ip_address,
            engine_version,
        }
    }).collect())
}
*/
#[derive(serde::Deserialize)]
struct DockerNodeLsOutput {
    #[serde(rename = "ID", default)]
    id: String,
    #[serde(rename = "Hostname", default)]
    hostname: String,
    #[serde(rename = "Status", default)]
    status: String,
    #[serde(rename = "Availability", default)]
    availability: String,
    #[serde(rename = "ManagerStatus", default)]
    manager_status: String,
    #[serde(rename = "EngineVersion", default)]
    engine_version: String,
}

#[tauri::command]
pub async fn list_nodes() -> Result<Vec<NodeInfo>, String> {
    let output = std::process::Command::new("docker")
        .args(["node", "ls", "--format", "{{json .}}"])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut nodes = Vec::new();

    for line in stdout.lines() {
        if line.trim().is_empty() { continue; }
        if let Ok(parsed) = serde_json::from_str::<DockerNodeLsOutput>(line) {
            let role = if parsed.manager_status.is_empty() { "worker".to_string() } else { "manager".to_string() };
            nodes.push(NodeInfo {
                id: parsed.id,
                hostname: parsed.hostname,
                role,
                status: parsed.status,
                availability: parsed.availability,
                ip_address: "".to_string(), // IP address requires `docker node inspect`
                engine_version: parsed.engine_version,
            });
        }
    }

    Ok(nodes)
}

#[tauri::command]
pub async fn list_services() -> Result<Vec<ServiceInfo>, String> {
    let docker = get_docker()?;
    let services = docker.list_services(None::<ListServicesOptions<String>>).await.map_err(|e: bollard::errors::Error| e.to_string())?;

    Ok(services.into_iter().map(|s| {
        let id = s.id.unwrap_or_default();
        let name = s.spec.as_ref().and_then(|spec| spec.name.clone()).unwrap_or_default();
        let image = s.spec.as_ref()
            .and_then(|spec| spec.task_template.as_ref())
            .and_then(|tt| tt.container_spec.as_ref())
            .and_then(|cs| cs.image.clone())
            .unwrap_or_default();
        
        let stack = s.spec.as_ref()
            .and_then(|spec| spec.labels.as_ref())
            .and_then(|l| l.get("com.docker.stack.namespace").cloned())
            .unwrap_or_default();

        let updated_at = s.updated_at.as_ref().map(|t| t.to_string()).unwrap_or_default();

        // Bollard doesn't give replicas status in list_services, just the spec.
        // To get running/total, we'd need to list tasks for each service, which is expensive here.
        // For now, let's just show total replicas from spec if replicated.
        let replicas = match s.spec.as_ref().and_then(|spec| spec.mode.as_ref()) {
            Some(mode) => {
                if let Some(r) = mode.replicated.as_ref().and_then(|rep| rep.replicas) {
                    format!("{}/{}", r, r) // Placeholder until we count tasks
                } else if mode.global.is_some() {
                    "global".to_string()
                } else {
                    "unknown".to_string()
                }
            },
            None => "unknown".to_string(),
        };

        let ports = s.endpoint.as_ref().and_then(|e| e.ports.as_ref()).map(|ports| {
            ports.iter().map(|p| {
                let target = p.target_port.unwrap_or(0);
                let published = p.published_port.unwrap_or(0);
                format!("{}:{}", published, target)
            }).collect::<Vec<String>>().join(", ")
        }).unwrap_or_default();

        ServiceInfo {
            id,
            name,
            image,
            replicas,
            ports,
            updated_at,
            stack,
        }
    }).collect())
}

#[tauri::command]
pub async fn inspect_service(id: String) -> Result<String, String> {
    let docker = get_docker()?;
    let service = docker.inspect_service(&id, None::<bollard::service::InspectServiceOptions>).await.map_err(|e: bollard::errors::Error| e.to_string())?;
    serde_json::to_string_pretty(&service).map_err(|e: serde_json::Error| e.to_string())
}

/*
#[tauri::command]
pub async fn inspect_node(id: String) -> Result<String, String> {
    let docker = get_docker()?;
    let node = docker.inspect_node(&id).await.map_err(|e: bollard::errors::Error| e.to_string())?;
    serde_json::to_string_pretty(&node).map_err(|e: serde_json::Error| e.to_string())
}
*/
#[tauri::command]
pub async fn inspect_node(id: String) -> Result<String, String> {
    let output = std::process::Command::new("docker")
        .args(["node", "inspect", &id])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn init_swarm(advertise_addr: Option<String>) -> Result<String, String> {
    let mut args = vec!["swarm", "init"];
    if let Some(ref addr) = advertise_addr {
        if !addr.is_empty() {
            args.push("--advertise-addr");
            args.push(addr);
        }
    }

    let output = std::process::Command::new("docker")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
pub async fn leave_swarm(force: bool) -> Result<String, String> {
    let mut args = vec!["swarm", "leave"];
    if force {
        args.push("--force");
    }

    let output = std::process::Command::new("docker")
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

