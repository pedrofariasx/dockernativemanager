#[cfg(test)]
mod tests {
    use crate::models::*;

    #[test]
    fn test_host_stats_serialization() {
        let stats = HostStats {
            cpu_usage: 45.5,
            memory_used: 8_000_000_000,
            memory_total: 16_000_000_000,
            disk_read_bytes: 1_000,
            disk_write_bytes: 500,
            net_rx_bytes: 200,
            net_tx_bytes: 100,
        };

        let serialized = serde_json::to_string(&stats).unwrap();
        assert!(serialized.contains("\"cpu_usage\":45.5"));
        assert!(serialized.contains("\"memory_used\":8000000000"));
    }

    #[test]
    fn test_container_stats_defaults() {
        let stats = ContainerStats {
            cpu_percent: 0.0,
            memory_usage: 0,
            memory_limit: 0,
            disk_read: 0,
            disk_write: 0,
            net_rx: 0,
            net_tx: 0,
        };

        let json = serde_json::to_value(&stats).unwrap();
        assert_eq!(json["cpu_percent"], 0.0);
        assert_eq!(json["memory_usage"], 0);
    }

    #[test]
    fn test_system_info_structure() {
        let info = SystemInfo {
            containers: 10,
            containers_running: 5,
            containers_paused: 1,
            containers_stopped: 4,
            images: 20,
            version: "24.0.7".to_string(),
            operating_system: "Linux".to_string(),
            kernel_version: "6.5.0".to_string(),
            storage_driver: "overlay2".to_string(),
            logging_driver: "json-file".to_string(),
            architecture: "x86_64".to_string(),
            ncpu: 8,
            mem_total: 16_000_000_000,
        };

        assert_eq!(
            info.containers,
            info.containers_running + info.containers_paused + info.containers_stopped
        );
        assert_eq!(info.ncpu, 8);
    }

    #[test]
    fn test_swarm_info_validation() {
        let swarm = SwarmInfo {
            id: "swarm-abc".to_string(),
            created_at: "2024-01-01T00:00:00Z".to_string(),
            updated_at: "2024-06-01T00:00:00Z".to_string(),
            nodes: 5,
            managers: 2,
            is_manager: true,
        };

        assert!(swarm.managers <= swarm.nodes);
        assert_eq!(swarm.is_manager, true);
    }

    #[test]
    fn test_volume_info_serialization() {
        let mut labels = std::collections::HashMap::new();
        labels.insert("project".to_string(), "demo".to_string());

        let volume = VolumeInfo {
            name: "my-volume".to_string(),
            driver: "local".to_string(),
            mountpoint: "/var/lib/docker/volumes/my-volume/_data".to_string(),
            created_at: "2024-01-15T10:00:00Z".to_string(),
            labels,
            size: 1048576,
            usage_count: 1,
        };

        let json = serde_json::to_value(&volume).unwrap();
        assert_eq!(json["name"], "my-volume");
        assert_eq!(json["driver"], "local");
        assert_eq!(json["labels"]["project"], "demo");
    }

    #[test]
    fn test_parse_ssh_target() {
        use crate::commands::system::parse_ssh_target;

        let res = parse_ssh_target("ssh://ubuntu@192.168.0.200").unwrap();
        assert_eq!(res, ("ubuntu".to_string(), "192.168.0.200".to_string(), 22));

        let res2 = parse_ssh_target("ssh://ubuntu@192.168.0.200:2222").unwrap();
        assert_eq!(
            res2,
            ("ubuntu".to_string(), "192.168.0.200".to_string(), 2222)
        );

        let res3 = parse_ssh_target("ubuntu@192.168.0.200").unwrap();
        assert_eq!(
            res3,
            ("ubuntu".to_string(), "192.168.0.200".to_string(), 22)
        );

        let res4 = parse_ssh_target("root@server.local:2200").unwrap();
        assert_eq!(res4, ("root".to_string(), "server.local".to_string(), 2200));

        assert!(parse_ssh_target("").is_err());
    }
}
