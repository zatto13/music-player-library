use lofty::config::WriteOptions;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, Tag, TagExt};
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
    pub genre: String,
    pub duration: u32,
    pub track_number: Option<u32>,
}

pub struct AudioPlayer {
    stream_handle: OutputStreamHandle,
    sink: Mutex<Option<Sink>>,
    volume: Mutex<f32>,
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

            let genre = tag
                .and_then(|t| t.genre())
                .map(|s| s.trim().to_string())
                .unwrap_or_else(|| "Unknown Genre".to_string());

            let track_number = tag.and_then(|t| t.track());

            let _ = conn.execute(
                "INSERT INTO tracks (file_path, title, artist, album, genre, duration, track_number)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(file_path) DO UPDATE SET
                    title=excluded.title,
                    artist=excluded.artist,
                    album=excluded.album,
                    genre=excluded.genre,
                    duration=excluded.duration,
                    track_number=excluded.track_number",
                params![file_path, title, artist, album, genre, duration, track_number],
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
        .prepare("SELECT id, file_path, title, artist, album, genre, duration, track_number FROM tracks ORDER BY artist, album, track_number")
        .map_err(|e| e.to_string())?;

    let track_iter = stmt
        .query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album: row.get(4)?,
                genre: row.get(5)?,
                duration: row.get(6)?,
                track_number: row.get(7)?,
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
    let current_vol = *state.player.volume.lock().map_err(|e| e.to_string())?;
    sink.set_volume(current_vol);

    sink.append(source);
    sink.play();

    *sink_lock = Some(sink);
    Ok(())
}

#[tauri::command]
fn toggle_play_pause(state: State<AppState>) -> Result<bool, String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        if sink.is_paused() {
            sink.play();
            Ok(true)
        } else {
            sink.pause();
            Ok(false)
        }
    } else {
        Ok(false)
    }
}

use std::time::Duration;

// 現在の再生位置（秒）を取得
#[tauri::command]
fn get_playback_position(state: State<AppState>) -> Result<f32, String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        Ok(sink.get_pos().as_secs_f32())
    } else {
        Ok(0.0)
    }
}

// 指定した秒数へシーク
#[tauri::command]
fn seek_track(state: State<AppState>, position_secs: f32) -> Result<(), String> {
    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        let _ = sink.try_seek(Duration::from_secs_f32(position_secs));
    }
    Ok(())
}

#[tauri::command]
fn set_volume(state: State<AppState>, volume: f32) -> Result<(), String> {
    let mut vol_lock = state.player.volume.lock().map_err(|e| e.to_string())?;
    *vol_lock = volume.clamp(0.0, 1.0);

    let sink_lock = state.player.sink.lock().map_err(|e| e.to_string())?;
    if let Some(sink) = sink_lock.as_ref() {
        sink.set_volume(*vol_lock);
    }

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
    genre: String,
    album: String,
) -> Result<(), String> {
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
        tag.set_genre(genre.clone());

        tag.save_to_path(&file_path, WriteOptions::default())
            .map_err(|e| format!("ファイルタグの書き込みに失敗: {}", e))?;
    } else {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET title = ?1, artist = ?2, album = ?3, genre = ?4 WHERE id = ?5",
        params![title, artist, album, genre, id],
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
        volume: Mutex::new(1.0),
    };

    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            create_dir_all(&app_dir).expect("Failed to create app data dir");
            let db_path = app_dir.join("library.db");

            let conn = Connection::open(db_path).expect("Failed to open SQLite database");
            // 既存テーブル作成
            conn.execute_batch(
                r#"
                CREATE TABLE IF NOT EXISTS tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE NOT NULL,
                    title TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album TEXT NOT NULL,
                    genre TEXT NOT NULL DEFAULT 'Unknown Genre',
                    duration INTEGER NOT NULL,
                    track_number INTEGER
                );
                "#,
            )
            .expect("Failed to initialize database schema");

            // 古いDBに genre 列がなければ自動追加（すでにあればエラーを無視）
            let _ = conn.execute("ALTER TABLE tracks ADD COLUMN genre TEXT NOT NULL DEFAULT 'Unknown Genre'", []);

            // インデックスの作成
            conn.execute_batch(
                r#"
                CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);
                CREATE INDEX IF NOT EXISTS idx_album ON tracks(album);
                CREATE INDEX IF NOT EXISTS idx_genre ON tracks(genre);
                "#,
            )
            .expect("Failed to create indexes");

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
            toggle_play_pause,
            set_volume,
            delete_track,
            update_track_tags,
            get_playback_position,
            seek_track,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}