// 数据库模块
// SQLite 目录数据库，存储照片元数据、文件夹、合集等信息

use rusqlite::{Connection, Result};
use std::path::PathBuf;

pub struct AppDatabase {
    pub path: PathBuf,
}

/// 初始化数据库，创建所有表结构
pub fn init_db(db_path: &PathBuf) -> Result<()> {
    let conn = Connection::open(db_path)?;

    // 开启 WAL 模式以提升并发性能
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS photos (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path       TEXT NOT NULL UNIQUE,
            file_name       TEXT NOT NULL,
            file_size       INTEGER,
            file_hash       TEXT,
            file_date       INTEGER,
            media_type      TEXT,
            thumbnail_l1    BLOB,
            thumbnail_l2    TEXT,

            -- EXIF 核心字段
            date_taken      TEXT,
            camera_make     TEXT,
            camera_model    TEXT,
            lens_model      TEXT,
            focal_length    REAL,
            aperture        REAL,
            shutter_speed   TEXT,
            iso             INTEGER,
            exposure_comp   REAL,
            flash           INTEGER,
            white_balance   TEXT,
            metering_mode   TEXT,
            image_width     INTEGER,
            image_height    INTEGER,
            color_space     TEXT,

            -- GPS
            latitude        REAL,
            longitude       REAL,
            altitude        REAL,

            -- 用户数据
            rating          INTEGER DEFAULT 0,
            color_label     TEXT,
            flag            TEXT,
            notes           TEXT,
            paired_raw_id   INTEGER,

            exif_attempted  INTEGER DEFAULT 0,

            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_date_taken   ON photos(date_taken);
        CREATE INDEX IF NOT EXISTS idx_camera_model ON photos(camera_model);
        CREATE INDEX IF NOT EXISTS idx_lens_model   ON photos(lens_model);
        CREATE INDEX IF NOT EXISTS idx_focal_length ON photos(focal_length);
        CREATE INDEX IF NOT EXISTS idx_aperture     ON photos(aperture);
        CREATE INDEX IF NOT EXISTS idx_iso          ON photos(iso);
        CREATE INDEX IF NOT EXISTS idx_rating       ON photos(rating);
        CREATE INDEX IF NOT EXISTS idx_flag         ON photos(flag);
        CREATE INDEX IF NOT EXISTS idx_lat_lon      ON photos(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_file_hash    ON photos(file_hash);
        CREATE INDEX IF NOT EXISTS idx_file_path    ON photos(file_path);
        CREATE INDEX IF NOT EXISTS idx_media_type   ON photos(media_type);
        CREATE INDEX IF NOT EXISTS idx_file_date    ON photos(file_date);
        CREATE INDEX IF NOT EXISTS idx_exif_attempted ON photos(exif_attempted);

        CREATE TABLE IF NOT EXISTS folders (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            path            TEXT NOT NULL UNIQUE,
            display_name    TEXT,
            photo_count     INTEGER DEFAULT 0,
            last_scan       TEXT,
            parent_id       INTEGER REFERENCES folders(id)
        );

        CREATE TABLE IF NOT EXISTS collections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            description     TEXT,
            is_smart        INTEGER DEFAULT 0,
            filter_json     TEXT,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS collection_photos (
            collection_id   INTEGER REFERENCES collections(id) ON DELETE CASCADE,
            photo_id        INTEGER REFERENCES photos(id) ON DELETE CASCADE,
            sort_order      INTEGER,
            PRIMARY KEY (collection_id, photo_id)
        );

        CREATE TABLE IF NOT EXISTS imports (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            source_path     TEXT,
            dest_folder     TEXT,
            file_count      INTEGER,
            rename_rule     TEXT,
            imported_at     TEXT DEFAULT (datetime('now'))
        );
        "
    )?;

    // 迁移：为已存在的 DB 添加 exif_attempted 列（SQLite 不报错就成功）
    conn.execute_batch("ALTER TABLE photos ADD COLUMN exif_attempted INTEGER DEFAULT 0;").ok();

    Ok(())
}
