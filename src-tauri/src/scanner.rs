use crate::state::{AppState, ScanProgressPayload, Track};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use rusqlite::params;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

#[tauri::command]
pub fn start_scan_directory(
    app: AppHandle,
    state: State<AppState>,
    dir_path: String,
) -> Result<(), String> {
    if state.is_scanning.load(Ordering::SeqCst) {
        return Err("現在スキャン中です".to_string());
    }

    state.is_scanning.store(true, Ordering::SeqCst);
    let is_scanning = Arc::clone(&state.is_scanning);
    let db = Arc::clone(&state.db);

    thread::spawn(move || {
        let mut batch: Vec<Track> = Vec::new();
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

                let album_artist = tag
                    .and_then(|t| t.get_string(ItemKey::AlbumArtist))
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| artist.clone());

                let album = tag
                    .and_then(|t| t.album())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "Unknown Album".to_string());

                let genre = tag
                    .and_then(|t| t.genre())
                    .map(|s| s.trim().to_string())
                    .unwrap_or_else(|| "Unknown Genre".to_string());

                let track_number = tag.and_then(|t| t.track());

                batch.push(Track {
                    id: 0,
                    file_path,
                    title,
                    artist,
                    album_artist,
                    album,
                    genre,
                    duration,
                    track_number,
                });

                if batch.len() >= 100 {
                    if let Ok(mut conn) = db.lock() {
                        if let Ok(tx) = conn.transaction() {
                            for t in batch.drain(..) {
                                let _ = tx.execute(
                                    "INSERT INTO tracks (file_path, title, artist, album_artist, album, genre, duration, track_number)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                                     ON CONFLICT(file_path) DO UPDATE SET
                                        title=excluded.title,
                                        artist=excluded.artist,
                                        album_artist=excluded.album_artist,
                                        album=excluded.album,
                                        genre=excluded.genre,
                                        duration=excluded.duration,
                                        track_number=excluded.track_number",
                                    params![
                                        t.file_path,
                                        t.title,
                                        t.artist,
                                        t.album_artist,
                                        t.album,
                                        t.genre,
                                        t.duration,
                                        t.track_number
                                    ],
                                );
                            }
                            let _ = tx.commit();
                        }
                    }
                    count += 100;
                    let _ = app.emit("scan-progress", ScanProgressPayload {
                        scanned: count,
                        is_finished: false,
                    });
                }
            }
        }

        if !batch.is_empty() {
            count += batch.len();
            if let Ok(mut conn) = db.lock() {
                if let Ok(tx) = conn.transaction() {
                    for t in batch.drain(..) {
                        let _ = tx.execute(
                            "INSERT INTO tracks (file_path, title, artist, album_artist, album, genre, duration, track_number)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                             ON CONFLICT(file_path) DO UPDATE SET
                                title=excluded.title,
                                artist=excluded.artist,
                                album_artist=excluded.album_artist,
                                album=excluded.album,
                                genre=excluded.genre,
                                duration=excluded.duration,
                                track_number=excluded.track_number",
                            params![
                                t.file_path,
                                t.title,
                                t.artist,
                                t.album_artist,
                                t.album,
                                t.genre,
                                t.duration,
                                t.track_number
                            ],
                        );
                    }
                    let _ = tx.commit();
                }
            }
        }

        is_scanning.store(false, Ordering::SeqCst);
        let _ = app.emit("scan-progress", ScanProgressPayload {
            scanned: count,
            is_finished: true,
        });
    });

    Ok(())
}