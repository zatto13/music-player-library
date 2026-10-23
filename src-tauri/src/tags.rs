use crate::state::{AppState, Track};
use base64::prelude::*;
use lofty::config::WriteOptions;
use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey, Tag, TagExt, TagItem};
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[tauri::command]
pub fn get_tracks(state: State<AppState>, sort_column: Option<String>, sort_direction: Option<String>) -> Result<Vec<Track>, String> {
    let column = match sort_column.as_deref() {
        Some("title") => "title",
        Some("artist") => "artist",
        Some("album") => "album",
        Some("genre") => "genre",
        Some("duration") => "duration",
        Some("track_number") => "track_number",
        _ => "album_artist",
    };
    let direction = match sort_direction.as_deref() {
        Some("desc") => "DESC",
        _ => "ASC",
    };
    let sql = format!(
        "SELECT id, file_path, title, artist, album_artist, album, genre, duration, track_number FROM tracks ORDER BY {} {}, album, track_number",
        column, direction
    );
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| e.to_string())?;

    let track_iter = stmt
        .query_map([], |row| {
            Ok(Track {
                id: row.get(0)?,
                file_path: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                album_artist: row.get(4)?,
                album: row.get(5)?,
                genre: row.get(6)?,
                duration: row.get(7)?,
                track_number: row.get(8)?,
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
pub fn delete_track(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tracks WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_track_tags(
    state: State<AppState>,
    id: i64,
    file_path: String,
    title: String,
    artist: String,
    album_artist: String,
    album: String,
    genre: String,
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

        tag.insert(TagItem::new(
            ItemKey::AlbumArtist,
            lofty::tag::ItemValue::Text(album_artist.clone()),
        ));

        tag.save_to_path(&file_path, WriteOptions::default())
            .map_err(|e| format!("ファイルタグの書き込みに失敗: {}", e))?;
    } else {
        return Err("ファイルの読み込みに失敗しました".to_string());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE tracks SET title = ?1, artist = ?2, album_artist = ?3, album = ?4, genre = ?5 WHERE id = ?6",
        params![title, artist, album_artist, album, genre, id],
    )
    .map_err(|e| format!("DB更新に失敗: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_album_art(file_path: String, album_name: String) -> Result<Option<String>, String> {
    let p = Path::new(&file_path);

    // 優先度 1: 音楽ファイル内部に埋め込まれた画像
    if let Ok(tagged_file) = Probe::open(p).and_then(|pr| pr.read()) {
        let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
        if let Some(t) = tag {
            if let Some(pic) = t.pictures().first() {
                let mime = match pic.mime_type() {
                    Some(m) => m.as_str(),
                    None => "image/jpeg",
                };
                let base64_str = BASE64_STANDARD.encode(pic.data());
                return Ok(Some(format!("data:{};base64,{}", mime, base64_str)));
            }
        }
    }

    let parent_dir = match p.parent() {
        Some(dir) => dir,
        None => return Ok(None),
    };

    let entries = match fs::read_dir(parent_dir) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };

    let mut album_match: Option<PathBuf> = None;
    let mut image_match: Option<PathBuf> = None;
    let mut any_image_match: Option<PathBuf> = None;

    let target_album = album_name.trim().to_lowercase();
    let img_exts = ["jpg", "jpeg", "png", "webp"];

    for entry in entries.filter_map(|e| e.ok()) {
        let entry_path = entry.path();
        if !entry_path.is_file() {
            continue;
        }

        let ext = entry_path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !img_exts.contains(&ext.as_str()) {
            continue;
        }

        let stem = entry_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        // 優先度 2: [アルバム名] と付いた画像
        if !target_album.is_empty() && stem.contains(&target_album) && album_match.is_none() {
            album_match = Some(entry_path.clone());
        }

        // 優先度 3: image と付いた画像
        if stem.contains("image") && image_match.is_none() {
            image_match = Some(entry_path.clone());
        }

        // 優先度 4: 同ディレクトリの画像ファイル
        if any_image_match.is_none() {
            any_image_match = Some(entry_path);
        }
    }

    let chosen_path = album_match.or(image_match).or(any_image_match);

    if let Some(target_file) = chosen_path {
        if let Ok(data) = fs::read(&target_file) {
            let ext = target_file
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("jpeg")
                .to_lowercase();
            let mime = if ext == "png" {
                "image/png"
            } else if ext == "webp" {
                "image/webp"
            } else {
                "image/jpeg"
            };
            let base64_str = BASE64_STANDARD.encode(&data);
            return Ok(Some(format!("data:{};base64,{}", mime, base64_str)));
        }
    }

    Ok(None)
}