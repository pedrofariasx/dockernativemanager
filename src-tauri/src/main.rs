/*
 * File: main.rs
 * Project: docker-native-manager
 * Created: 2026-03-13
 * 
 * Last Modified: Thu Mar 19 2026
 * Modified By: Pedro Farias
 * 
 * Copyright (c) 2026 Pedro Farias
 * License: MIT
 */

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod utils;
mod commands;
mod tasks;

use std::collections::HashMap;
use utils::TerminalSenders;
use commands::containers::*;
use commands::images::*;
use commands::volumes::*;
use commands::networks::*;
use commands::stacks::*;
use commands::system::*;
use commands::swarm::*;
use tasks::{listen_to_docker_events, emit_container_stats, emit_host_stats};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let handle_stats = app.handle().clone();
            let handle_host_stats = app.handle().clone();
            
            tauri::async_runtime::spawn(async move {
                listen_to_docker_events(handle).await;
            });

            tauri::async_runtime::spawn(async move {
                emit_container_stats(handle_stats).await;
            });

            tauri::async_runtime::spawn(async move {
                emit_host_stats(handle_host_stats).await;
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
            prune_images,
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
            write_stdin,
            prune_volumes,
            get_volume_containers,
            prune_networks,
            connect_container_to_network,
            disconnect_container_from_network,
            update_stack,
            get_stack_logs,
            scale_stack_service,
            start_stack,
            stop_stack,
            restart_stack,
            manage_docker_service,
            get_swarm_info,
            list_nodes,
            list_services,
            inspect_service,
            inspect_node,
            init_swarm,
            leave_swarm,
            list_docker_contexts,
            use_docker_context,
            create_docker_context,
            remove_docker_context
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
