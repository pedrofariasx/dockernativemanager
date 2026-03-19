/*
 * File: docker.ts
 * Project: docker-native-manager
 * Created: 2026-03-13
 * 
 * Last Modified: 2026-03-19 12:48:03
 * Modified By: Pedro Farias
 * 
 */

"use client";

import { invoke } from "@tauri-apps/api/core";

// Helper to check if we are running inside Tauri
const isTauri = typeof window !== 'undefined' && !!(window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

export interface Container {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  created: number;
  ip_address: string;
  labels: Record<string, string>;
  stack: string;
  host: string;
}

export interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  disk_read: number;
  disk_write: number;
  net_rx: number;
  net_tx: number;
}

export interface Image {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created: string;
  created_at: string; // Added created_at field
}

export interface Volume {
  name: string;
  driver: string;
  mountpoint: string;
  created_at: string;
  labels: Record<string, string>;
  size: number;
  usage_count: number;
}

export interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
}

export interface SwarmInfo {
  id: string;
  created_at: string;
  updated_at: string;
  nodes: number;
  managers: number;
  is_manager: boolean;
}

export interface NodeInfo {
  id: string;
  hostname: string;
  role: string;
  status: string;
  availability: string;
  ip_address: string;
  engine_version: string;
}

export interface ServiceInfo {
  id: string;
  name: string;
  image: string;
  replicas: string;
  ports: string;
  updated_at: string;
  stack: string;
}

export interface Stack {
  name: string;
  status: string;
  services: number;
  created: number;
  updated: number;
  stack_type: string;
  isDeploying?: boolean;
}

// MOCK DATA for Web Preview
const MOCK_CONTAINERS: Container[] = [
  { id: "c1", name: "nginx-proxy", image: "nginx:latest", status: "running", state: "Up 2 hours", ports: "80:80, 443:443", created: 1710550000, ip_address: "172.17.0.2", labels: {}, stack: "proxy", host: "localhost" },
  { id: "c2", name: "postgres-db", image: "postgres:15-alpine", status: "running", state: "Up 5 hours", ports: "5432:5432", created: 1710540000, ip_address: "172.17.0.3", labels: {}, stack: "database", host: "localhost" },
  { id: "c3", name: "redis-cache", image: "redis:7", status: "exited", state: "Exited (0) 10 mins ago", ports: "6379", created: 1710530000, ip_address: "172.17.0.4", labels: {}, stack: "cache", host: "localhost" },
];

const MOCK_IMAGES: Image[] = [
  { id: "sha256:1", repository: "nginx", tag: "latest", size: "142MB", created: "2 weeks ago", created_at: "2024-02-29T10:00:00Z" },
  { id: "sha256:2", repository: "postgres", tag: "15-alpine", size: "230MB", created: "1 month ago", created_at: "2024-02-15T12:00:00Z" },
  { id: "sha256:3", repository: "node", tag: "20-slim", size: "180MB", created: "3 days ago", created_at: "2024-03-12T08:00:00Z" },
];

const MOCK_VOLUMES: Volume[] = [
  { name: "db_data", driver: "local", mountpoint: "/var/lib/docker/volumes/db_data/_data", created_at: "2023-10-20T10:00:00Z", labels: {}, size: 104857600, usage_count: 1 },
  { name: "cache_data", driver: "local", mountpoint: "/var/lib/docker/volumes/cache_data/_data", created_at: "2023-10-21T12:00:00Z", labels: { "project": "demo" }, size: 52428800, usage_count: 0 },
];

const MOCK_NETWORKS: Network[] = [
  { id: "n1", name: "bridge", driver: "bridge", scope: "local" },
  { id: "n2", name: "host", driver: "host", scope: "local" },
  { id: "n3", name: "none", driver: "null", scope: "local" },
];

export const getContainers = async (): Promise<Container[]> => {
  if (!isTauri) return MOCK_CONTAINERS;
  return await invoke("get_containers");
};

export const getImages = async (): Promise<Image[]> => {
  if (!isTauri) return MOCK_IMAGES;
  return await invoke("get_images");
};

export const getVolumes = async (): Promise<Volume[]> => {
  if (!isTauri) return MOCK_VOLUMES;
  return await invoke("get_volumes");
};

export const getNetworks = async (): Promise<Network[]> => {
  if (!isTauri) return MOCK_NETWORKS;
  return await invoke("get_networks");
};

export const startContainer = async (id: string) => {
  if (!isTauri) return console.log("Mock: Starting container", id);
  return await invoke("start_container", { id });
};

export const stopContainer = async (id: string) => {
  if (!isTauri) return console.log("Mock: Stopping container", id);
  return await invoke("stop_container", { id });
};

export const restartContainer = async (id: string) => {
  if (!isTauri) return console.log("Mock: Restarting container", id);
  return await invoke("restart_container", { id });
};

export const deleteContainer = async (id: string) => {
  if (!isTauri) return console.log("Mock: Deleting container", id);
  return await invoke("delete_container", { id });
};

export const createContainer = async (
  name: string,
  image: string,
  ports: string[] = [],
  envs: string[] = [],
  volumes: string[] = []
) => {
  if (!isTauri) return console.log("Mock: Creating container", name, image, ports, envs, volumes);
  return await invoke("create_container", { name, image, ports, envs, volumes });
};

export const deleteImage = async (id: string) => {
  if (!isTauri) return console.log("Mock: Deleting image", id);
  return await invoke("delete_image", { id });
};

export const getVolumeContainers = async (name: string): Promise<string[]> => {
  if (!isTauri) return ["container-1", "container-2"];
  return await invoke("get_volume_containers", { name });
};

export const deleteVolume = async (name: string) => {
  if (!isTauri) return console.log("Mock: Deleting volume", name);
  return await invoke("delete_volume", { name });
};

export const createVolume = async (name: string, driver?: string, labels?: Record<string, string>) => {
  if (!isTauri) return console.log("Mock: Creating volume", name, driver, labels);
  return await invoke("create_volume", { name, driver: driver || "local", labels: labels || {} });
};

export const pruneVolumes = async (): Promise<string> => {
  if (!isTauri) return "Mock: Pruned volumes. Reclaimed 50MB.";
  return await invoke("prune_volumes");
};

export const deleteNetwork = async (id: string) => {
  if (!isTauri) return console.log("Mock: Deleting network", id);
  return await invoke("delete_network", { id });
};

export const createNetwork = async (
  name: string,
  driver: string = "bridge",
  internal: boolean = false,
  attachable: boolean = false,
  labels: Record<string, string> = {}
) => {
  if (!isTauri) return console.log("Mock: Creating network", name, driver, internal, attachable, labels);
  return await invoke("create_network", { name, driver, internal, attachable, labels });
};

export const pruneNetworks = async (): Promise<string> => {
  if (!isTauri) return "Mock: Pruned networks. Deleted 2 unused networks.";
  return await invoke("prune_networks");
};

export const connectContainerToNetwork = async (networkId: string, containerId: string) => {
  if (!isTauri) return console.log("Mock: Connecting container", containerId, "to network", networkId);
  return await invoke("connect_container_to_network", { networkId, containerId });
};

export const disconnectContainerFromNetwork = async (networkId: string, containerId: string, force: boolean = false) => {
  if (!isTauri) return console.log("Mock: Disconnecting container", containerId, "from network", networkId);
  return await invoke("disconnect_container_from_network", { networkId, containerId, force });
};

export const pullImage = async (image: string) => {
  if (!isTauri) return console.log("Mock: Pulling image", image);
  return await invoke("pull_image", { image });
};

export const pruneImages = async (): Promise<string> => {
  if (!isTauri) return "Mock: Pruned images. Reclaimed 100MB.";
  return await invoke("prune_images");
};

export const getContainerLogs = async (
  id: string,
  timestamps: boolean,
  tail: number | null,
  since: number | null
): Promise<string> => {
  if (!isTauri) return "[MOCK LOGS]\n2023-10-27 10:00:01 INFO: Database connection established\n2023-10-27 10:00:05 DEBUG: Polling for new tasks...";
  return await invoke("get_container_logs", { id, timestamps, tail, since });
};

export const getContainerStats = async (id: string): Promise<ContainerStats> => {
  if (!isTauri) return { cpu_percent: 0, memory_usage: 0, memory_limit: 0, disk_read: 0, disk_write: 0, net_rx: 0, net_tx: 0 };
  return await invoke("get_container_stats", { id });
};

export const getStacks = async (): Promise<Stack[]> => {
  if (!isTauri) return [{ name: "my-app", status: "running", services: 3, created: 1710550000, updated: 1710555000, stack_type: "Compose" }];
  return await invoke("get_stacks");
};

export const deployStack = async (name: string, composeContent: string, envContent: string | null, stackType: string = "Compose"): Promise<void> => {
  if (!isTauri) return console.log("Mock: Deploying stack", name, stackType, envContent ? "with .env" : "without .env");
  await invoke("deploy_stack", { name, composeContent, envContent, stackType });
};

export const removeStack = async (name: string, stackType: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Removing stack", name, stackType);
  await invoke("remove_stack", { name, stackType });
};

export const getStackCompose = async (name: string): Promise<string> => {
  if (!isTauri) return "version: '3'\nservices:\n  web:\n    image: nginx";
  return await invoke("get_stack_compose", { name });
};

export const updateStack = async (name: string, stackType: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Updating stack", name, stackType);
  return await invoke("update_stack", { name, stackType });
};

export const startStack = async (name: string, stackType: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Starting stack", name, stackType);
  return await invoke("start_stack", { name, stackType });
};

export const stopStack = async (name: string, stackType: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Stopping stack", name, stackType);
  return await invoke("stop_stack", { name, stackType });
};

export const restartStack = async (name: string, stackType: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Restarting stack", name, stackType);
  return await invoke("restart_stack", { name, stackType });
};

export const getStackLogs = async (name: string, tail?: number | null): Promise<string> => {
  if (!isTauri) return "Mock stack logs content...";
  return await invoke("get_stack_logs", { name, tail: tail ?? null });
};

export const scaleStackService = async (name: string, service: string, scale: number): Promise<void> => {
  if (!isTauri) return console.log("Mock: Scaling service", name, service, scale);
  return await invoke("scale_stack_service", { name, service, scale });
};

export const getSwarmInfo = async (): Promise<SwarmInfo | null> => {
  if (!isTauri) return { id: "swarm-1", created_at: "", updated_at: "", nodes: 3, managers: 1, is_manager: true };
  return await invoke("get_swarm_info");
};

export const listNodes = async (): Promise<NodeInfo[]> => {
  if (!isTauri) return [
    { id: "n1", hostname: "manager-1", role: "manager", status: "ready", availability: "active", ip_address: "192.168.1.10", engine_version: "24.0.7" },
    { id: "n2", hostname: "worker-1", role: "worker", status: "ready", availability: "active", ip_address: "192.168.1.11", engine_version: "24.0.7" },
    { id: "n3", hostname: "worker-2", role: "worker", status: "ready", availability: "active", ip_address: "192.168.1.12", engine_version: "24.0.7" },
  ];
  return await invoke("list_nodes");
};

export const listServices = async (): Promise<ServiceInfo[]> => {
  if (!isTauri) return [
    { id: "s1", name: "app_web", image: "nginx:latest", replicas: "3/3", ports: "80:80", updated_at: "2024-03-19T00:00:00Z", stack: "app" },
    { id: "s2", name: "app_db", image: "postgres:15-alpine", replicas: "1/1", ports: "5432:5432", updated_at: "2024-03-19T00:00:00Z", stack: "app" },
  ];
  return await invoke("list_services");
};

export const inspectService = async (id: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ id, name: "mock-service" }, null, 2);
  return await invoke("inspect_service", { id });
};

export const inspectNode = async (id: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ id, hostname: "mock-node" }, null, 2);
  return await invoke("inspect_node", { id });
};

export const initSwarm = async (advertiseAddr?: string): Promise<string> => {
  if (!isTauri) return "Mock: Swarm initialized.";
  return await invoke("init_swarm", { advertiseAddr: advertiseAddr || null });
};

export const leaveSwarm = async (force: boolean = false): Promise<string> => {
  if (!isTauri) return "Mock: Left swarm.";
  return await invoke("leave_swarm", { force });
};

export const dockerSystemPrune = async (): Promise<string> => {
  if (!isTauri) return "Mock: System pruned successfully. Reclaimed 0B.";
  return await invoke("docker_system_prune");
};

export const inspectContainer = async (id: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ mock: "data", id }, null, 2);
  return await invoke("inspect_container", { id });
};

export const inspectImage = async (id: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ mock: "image_data", id }, null, 2);
  return await invoke("inspect_image", { id });
};

export const inspectVolume = async (name: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ mock: "volume_data", name }, null, 2);
  return await invoke("inspect_volume", { name });
};

export const inspectNetwork = async (id: string): Promise<string> => {
  if (!isTauri) return JSON.stringify({ mock: "network_data", id }, null, 2);
  return await invoke("inspect_network", { id });
};

export interface SystemInfo {
  containers: number;
  containers_running: number;
  containers_paused: number;
  containers_stopped: number;
  images: number;
  version: string;
  operating_system: string;
  kernel_version: string;
  storage_driver: string;
  logging_driver: string;
  architecture: string;
  ncpu: number;
  mem_total: number;
}

export const getSystemInfo = async (): Promise<SystemInfo> => {
  if (!isTauri) return {
    containers: 5,
    containers_running: 2,
    containers_paused: 0,
    containers_stopped: 3,
    images: 12,
    version: "24.0.7",
    operating_system: "Docker Desktop (Mock)",
    kernel_version: "5.15.0-mock",
    storage_driver: "overlay2",
    logging_driver: "json-file",
    architecture: "x86_64",
    ncpu: 8,
    mem_total: 16000000000
  };
  return await invoke("get_system_info");
};

export const execContainer = async (
  containerId: string,
  shell: string = "sh",
  user?: string
): Promise<void> => {
  if (!isTauri) return console.log("Mock: Executing in container", containerId, shell, user);
  return await invoke("exec_container", { containerId, shell, user: user ?? null });
};

export const writeStdin = async (containerId: string, data: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Writing stdin", containerId, data);
  return await invoke("write_stdin", { containerId, data });
};

export const manageDockerService = async (action: "start" | "stop" | "restart" | "reconnect"): Promise<string> => {
  if (!isTauri) {
    console.log(`Mock: Docker service ${action}`);
    return `Mock: Docker service ${action}ed`;
  }
  return await invoke("manage_docker_service", { action });
};

export interface DockerContext {
  name: string;
  description: string;
  docker_endpoint: string;
  is_active: boolean;
}

export const listDockerContexts = async (): Promise<DockerContext[]> => {
  if (!isTauri) return [
    { name: "default", description: "Default context", docker_endpoint: "unix:///var/run/docker.sock", is_active: true },
    { name: "remote-swarm", description: "Remote Cluster", docker_endpoint: "tcp://192.168.1.100:2376", is_active: false },
  ];
  return await invoke("list_docker_contexts");
};

export const useDockerContext = async (name: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Using context", name);
  return await invoke("use_docker_context", { name });
};

export const createDockerContext = async (name: string, host: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Creating context", name, host);
  return await invoke("create_docker_context", { name, host });
};

export const removeDockerContext = async (name: string): Promise<void> => {
  if (!isTauri) return console.log("Mock: Removing context", name);
  return await invoke("remove_docker_context", { name });
};
