pub mod db;
pub mod player;
pub mod scanner;
pub mod state;
pub mod tags;

use player::*;
use rodio::OutputStream;
use scanner::*;
use state::{AppState, AudioPlayer};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tags::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (stream, stream_handle) =
        OutputStream::try_default().expect("Failed to initialize audio output stream");
    Box::leak(Box::new(stream));

    let player = AudioPlayer {
        stream_handle,
        sink: Mutex::new(None),
        volume: Mutex::new(1.0),
    };

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let conn = db::init_database(&app_dir);

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                player,
                is_scanning: Arc::new(AtomicBool::new(false)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_scan_directory,
            get_tracks,
            play_track,
            toggle_play_pause,
            set_volume,
            delete_track,
            update_track_tags,
            get_playback_position,
            seek_track,
            get_album_art,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}