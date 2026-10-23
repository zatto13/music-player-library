use rodio::{OutputStreamHandle, Sink};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album_artist: String,
    pub album: String,
    pub genre: String,
    pub duration: u32,
    pub track_number: Option<u32>,
}

#[derive(Clone, Serialize)]
pub struct ScanProgressPayload {
    pub scanned: usize,
    pub is_finished: bool,
}

pub struct AudioPlayer {
    pub stream_handle: OutputStreamHandle,
    pub sink: Mutex<Option<Sink>>,
    pub volume: Mutex<f32>,
}

pub struct AppState {
    pub db: Arc<Mutex<Connection>>,
    pub player: AudioPlayer,
    pub is_scanning: Arc<AtomicBool>,
}