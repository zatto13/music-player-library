use rusqlite::Connection;
use std::fs::create_dir_all;
use std::path::Path;

pub fn init_database(app_dir: &Path) -> Connection {
    create_dir_all(app_dir).expect("Failed to create app data dir");
    let db_path = app_dir.join("library.db");

    let conn = Connection::open(db_path).expect("Failed to open SQLite database");

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album_artist TEXT NOT NULL DEFAULT '',
            album TEXT NOT NULL,
            genre TEXT NOT NULL DEFAULT 'Unknown Genre',
            duration INTEGER NOT NULL,
            track_number INTEGER
        );
        "#,
    )
    .expect("Failed to initialize database schema");

    // マイグレーション用ALTER（既存DBへの安全なカラム追加）
    let _ = conn.execute(
        "ALTER TABLE tracks ADD COLUMN genre TEXT NOT NULL DEFAULT 'Unknown Genre'",
        [],
    );
    let _ = conn.execute(
        "ALTER TABLE tracks ADD COLUMN album_artist TEXT NOT NULL DEFAULT ''",
        [],
    );

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_artist ON tracks(artist);
        CREATE INDEX IF NOT EXISTS idx_album_artist ON tracks(album_artist);
        CREATE INDEX IF NOT EXISTS idx_album ON tracks(album);
        CREATE INDEX IF NOT EXISTS idx_genre ON tracks(genre);
        "#,
    )
    .expect("Failed to create indexes");

    conn
}