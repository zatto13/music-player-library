use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, Tag, TagExt}; // TagExt を追加
use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs::{create_dir_all, File};
use std::io::BufReader;
use std::sync::Mutex;
use tauri::{Manager, State};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: i64,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: u32,
    pub track_number: Option<u32>,
}

pub struct AudioPlayer {
    stream_handle: OutputStreamHandle,
    sink: Mutex<Option<Sink>>,
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub player: AudioPlayer,
}

#[tauri::command]
fn scan_directory(state: State<AppState>, dir_path: String) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut count = 0;

    for entry in WalkDir::new(&dir_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !["mp3", "flac", "m4a", "ogg", "wav"].contains(&ext.as_str()) {
            continue;
        }

        let file_path = path.to_string_lossy().to_string();

        if let Ok(tagged_file) = Probe::open(path).and_then(|p| p.read()) {
            let properties = tagged_file.properties();
            let duration = properties.duration().as_secs() as u32;

            let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

            let title = tag
                .and_then(|t| t.title())
                .map(|s| s.to_string())
                .unwrap_or_else(|| {
                    path.file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("Unknown")
                        .to_string()
                });

            let artist = tag
                .and_then(|t| t.artist())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown Artist".to_string());

            let album = tag
                .and_then(|t| t.album())
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown Album".to_string());

            let track_number = tag.and_then(|t| t.track());

            let _ = conn.execute(
                "INSERT INTO tracks (file_path, title, artist, album, duration, track_number)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(file_path) DO UPDATE SET
                    title=excluded.title,
                    artist=excluded.artist,
                    album=excluded.album,
                    duration=excluded.duration,
                    track_number=excluded.track_number",
                params![file_path, title, artist, album, duration, track_number],
            );
            count += 1;
        }
    }

    Ok(count)
}

#[tauri::command]
fn get_tracks(state: State<AppState>) -> Result<Vec<Track>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, file_path, title, artist, album, duration, track_number FROM tracks ORDER BY artist, album, track_number")
        .map_err(|e| e.to_string())?;

    let track_iter = stmt
        .query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                duration: row.get(5)?,
                track_number: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    for track in track_iter.filter_map(|t| t.ok()) {
        tracks.push(track);
    }
    Ok(tracks)
}

#[tauri::command]
fn play_track(state: State<AppState>, file_path: String) -> Result<(), String> {
    let file = File::open(&file_path).map_err(|e| e.to_string())?;
    let source = Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;

    let mut sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;

    let sink = Sink::try_new(&state.player.stream_handle).map_err(|e| e.to_string())?;
    sink.append(source);
    sink.play();

    *sink_lock = Some(sink);
    Ok(())
}

#[tauri::command]
fn delete_track(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_track_tags(
    state: State<AppState>,
    id: i64,
    file_path: String,
    title: String,
    artist: String,
    album: String,
) -> Result<(), String> {
    // 1. 実ファイルのタグを更新
    if let Ok(mut tagged_file) = Probe::open(&file_path).and_then(|p| p.read()) {
        let tag = match tagged_file.primary_tag_mut() {
            Some(primary_tag) => primary_tag,
            None => {
                tagged_file.insert_tag(Tag::new(tagged_file.primary_tag_type()));
                tagged_file.primary_tag_mut().unwrap()
            }
        };

        tag.set_title(title.clone());
        tag.set_artist(artist.clone());
        tag.set_album(album.clone());

        tag.save_to_path(&file_path, WriteOptions::default())
            .map_err(|e| format!("ファイルタグの書き込みに失敗: {}", e))?;
    } else {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    // 2. SQLiteデータベースの更新
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET title = ?1, artist = ?2, album = ?3 WHERE id = ?4",
        params![title, artist, album, id],
    )
    .map_err(|e| format!("DB更新に失敗: {}", e))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (stream, stream_handle) =
        OutputStream::try_default().expect("Failed to initialize audio output stream");
    Box::leak(Box::new(stream));

    let player = AudioPlayer {
        stream_handle,
        sink: Mutex::new(None),
    };

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = app_dir.join("library.db");

            let conn = Connection::open(db_path).expect("Failed to open SQLite database");
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album TEXT NOT NULL,
                    duration INTEGER NOT NULL,
                    track_number INTEGER
                );
                CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);
                CREATE INDEX IF NOT EXISTS idx_album ON tracks(album);
                "#,
            )
            .expect("Failed to initialize database schema");

            app.manage(AppState {
                db: Mutex::new(conn),
                player,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            get_tracks,
            play_track,
            delete_track,
            update_track_tags,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}