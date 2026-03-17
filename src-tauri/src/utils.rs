/*
 * File: utils.rs
 * Project: docker-native-manager
 * Created: 2026-03-17
 * 
 * Last Modified: Tue Mar 17 2026
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

pub fn get_docker() -> Result<Docker, String> {
    if IS_STOPPED_INTENTIONALLY.load(Ordering::SeqCst) {
        return Err("Docker is intentionally stopped".into());
    }
    Docker::connect_with_local_defaults().map_err(|e| e.to_string())
}
