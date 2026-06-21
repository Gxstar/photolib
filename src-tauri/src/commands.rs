// Tauri 命令模块 — 前端调用的所有 IPC 接口

use crate::models::Photo;
use crate::scanner;
use tauri::State;
use rusqlite::Connection;
use serde::Serialize;

/// 扫描指定文件夹（仅直接子文件，不递归），发现照片并写入数据库
/// 用于目录浏览器 — 只显示当前文件夹的照片，不管子目录
#[tauri::command]
pub async fn scan_folder(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<String>, String> {
    eprintln!("[PhotoLib::scan_folder] Received folder_path: {:?}", folder_path);
    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        eprintln!("[PhotoLib::scan_folder] Path does not exist: {:?}", path);
        return Err(format!("文件夹不存在: {}", folder_path));
    }

    // 只扫描当前目录的直接文件（不递归），速度快
    let files = scanner::scan_directory_shallow(path);
    eprintln!("[PhotoLib::scan_folder] Found {} files in {:?}", files.len(), folder_path);

    // 写入数据库（事务包装，避免每条 INSERT 单独 fsync）
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    eprintln!("[PhotoLib::scan_folder] DB opened: {:?}", db.path);

    conn.execute_batch("BEGIN TRANSACTION;").map_err(|e| e.to_string())?;
    for file in &files {
        let file_path = std::path::Path::new(file);
        let file_name = file_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let media_type = scanner::get_media_type(file_path);
        let file_size = std::fs::metadata(file_path).ok().map(|m| m.len() as i64);

        let result = conn.execute(
            "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, media_type)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file, file_name, file_size, media_type],
        );
        match &result {
            Ok(_) => eprintln!("[PhotoLib::scan_folder] Inserted: {}", file_name),
            Err(e) => eprintln!("[PhotoLib::scan_folder] Insert error for {}: {}", file_name, e),
        }
        result.map_err(|e| e.to_string())?;
    }
    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;

    Ok(files)
}

/// 扫描文件夹（递归），用于导入和相册管理
#[tauri::command]
pub async fn scan_folder_deep(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&folder_path);
    if !path.exists() {
        return Err(format!("文件夹不存在: {}", folder_path));
    }

    let files = scanner::scan_directory(path);

    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    conn.execute_batch("BEGIN TRANSACTION;").map_err(|e| e.to_string())?;
    for file in &files {
        let file_path = std::path::Path::new(file);
        let file_name = file_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let media_type = scanner::get_media_type(file_path);
        let file_size = std::fs::metadata(file_path).ok().map(|m| m.len() as i64);

        conn.execute(
            "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, media_type)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file, file_name, file_size, media_type],
        ).map_err(|e| e.to_string())?;
    }
    conn.execute_batch("COMMIT;").map_err(|e| e.to_string())?;

    Ok(files)
}

/// 获取当前目录的所有照片（支持筛选和排序）
#[tauri::command]
pub async fn get_photos(
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         rating, color_label, flag, notes
                  FROM photos ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;

    let photos = stmt
        .query_map([], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                file_hash: row.get(4)?,
                file_date: row.get(5)?,
                media_type: row.get(6)?,
                thumbnail_url: None,
                date_taken: row.get(7)?,
                camera_make: row.get(8)?,
                camera_model: row.get(9)?,
                lens_model: row.get(10)?,
                focal_length: row.get(11)?,
                aperture: row.get(12)?,
                shutter_speed: row.get(13)?,
                iso: row.get(14)?,
                exposure_comp: row.get(15)?,
                flash: row.get(16)?,
                white_balance: row.get(17)?,
                metering_mode: row.get(18)?,
                image_width: row.get(19)?,
                image_height: row.get(20)?,
                color_space: row.get(21)?,
                latitude: row.get(22)?,
                longitude: row.get(23)?,
                altitude: row.get(24)?,
                rating: row.get(25).unwrap_or(0),
                color_label: row.get(26)?,
                flag: row.get(27)?,
                notes: row.get(28)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(photos)
}

/// 获取单张照片的完整 EXIF 元数据（kamadak-exif 原生解析）
#[tauri::command]
pub async fn get_photo_metadata(
    file_path: String,
) -> Result<serde_json::Value, String> {
    let path = std::path::Path::new(&file_path);
    let exif = crate::metadata::extract_exif(path)
        .map_err(|e| e.to_string())?;

    let json = serde_json::to_value(&exif).map_err(|e| e.to_string())?;
    Ok(json)
}

/// 导入照片（从存储卡等来源复制到目标目录）
#[tauri::command]
pub async fn import_photos(
    source_dir: String,
    dest_dir: String,
    rename_rule: String,
    delete_source: bool,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<i32, String> {
    let source = std::path::Path::new(&source_dir);
    let dest = std::path::Path::new(&dest_dir);

    if !source.exists() {
        return Err(format!("来源目录不存在: {}", source_dir));
    }

    // 确保目标目录存在
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;

    let files = scanner::scan_directory(source);
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    let mut imported = 0;
    for file_path_str in &files {
        let src_path = std::path::Path::new(file_path_str);
        let file_name = src_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // TODO: 应用重命名规则
        let dest_path = dest.join(&file_name);

        // 跳过重复文件
        if dest_path.exists() {
            continue;
        }

        // 复制文件
        std::fs::copy(src_path, &dest_path).map_err(|e| e.to_string())?;

        // 提取 EXIF 并写入数据库
        if let Ok(exif) = crate::metadata::extract_exif(src_path) {

            let dest_str = dest_path.to_string_lossy().to_string();
            let media_type = scanner::get_media_type(src_path);
            let file_size = std::fs::metadata(&dest_path).ok().map(|m| m.len() as i64);

            conn.execute(
                "INSERT OR REPLACE INTO photos (
                    file_path, file_name, file_size, media_type,
                    date_taken, camera_make, camera_model, lens_model,
                    focal_length, aperture, shutter_speed, iso,
                    exposure_comp, flash, white_balance, metering_mode,
                    image_width, image_height, color_space,
                    latitude, longitude, altitude
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
                rusqlite::params![
                    dest_str, file_name, file_size, media_type,
                    exif.date_taken, exif.camera_make, exif.camera_model, exif.lens_model,
                    exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso,
                    exif.exposure_comp, exif.flash, exif.white_balance, exif.metering_mode,
                    exif.image_width, exif.image_height, exif.color_space,
                    exif.latitude, exif.longitude, exif.altitude,
                ],
            ).map_err(|e| e.to_string())?;
        }

        imported += 1;

        // 可选：删除源文件
        if delete_source {
            std::fs::remove_file(src_path).ok();
        }
    }

    // 记录导入历史
    conn.execute(
        "INSERT INTO imports (source_path, dest_folder, file_count, rename_rule)
         VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![source_dir, dest_dir, imported, rename_rule],
    ).map_err(|e| e.to_string())?;

    Ok(imported)
}

/// 检测可移动存储介质（SD 卡等）
#[tauri::command]
pub async fn detect_removable_drives() -> Result<Vec<String>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("wmic")
            .args(["logicaldisk", "where", "drivetype=2", "get", "name"])
            .output()
            .map_err(|e| e.to_string())?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines().skip(1) {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                drives.push(trimmed.to_string() + "\\");
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // macOS: 扫描 /Volumes 目录
        if let Ok(entries) = std::fs::read_dir("/Volumes") {
            for entry in entries.flatten() {
                let path = entry.path();
                if path != std::path::Path::new("/Volumes/Macintosh HD") {
                    drives.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(drives)
}

/// 浏览目录 — 列出指定路径下的子目录及其照片数量
/// 特殊路径 "ROOT" 返回所有可用盘符
#[derive(Debug, Clone, Serialize)]
pub struct DirectoryEntry {
    pub path: String,
    pub name: String,
    pub photo_count: usize,
}

#[tauri::command]
pub async fn browse_directory(dir_path: String) -> Result<Vec<DirectoryEntry>, String> {
    // 特殊路径：返回所有盘符
    if dir_path == "ROOT" {
        return list_drives();
    }

    let path = std::path::Path::new(&dir_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("目录不存在: {}", dir_path));
    }

    let mut entries = Vec::new();
    if let Ok(read_dir) = std::fs::read_dir(path) {
        for entry in read_dir.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let name = entry_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                // 跳过隐藏目录和系统目录
                if name.starts_with('.') || name == "$RECYCLE.BIN" || name == "System Volume Information" {
                    continue;
                }
                // 快速统计直接子级照片数（不递归，不卡）
                let photo_count = scanner::count_photos_shallow(&entry_path);
                entries.push(DirectoryEntry {
                    path: entry_path.to_string_lossy().to_string(),
                    name,
                    photo_count,
                });
            }
        }
    }
    // 按名称排序
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

/// 列出所有可用盘符（Windows: C:\, D:\ 等）
fn list_drives() -> Result<Vec<DirectoryEntry>, String> {
    let mut entries = Vec::new();
    for letter in ('A'..='Z').into_iter() {
        let drive = format!("{}:\\", letter);
        let path = std::path::Path::new(&drive);
        if path.exists() {
            entries.push(DirectoryEntry {
                path: drive,
                name: format!("{}盘", letter),
                photo_count: 0,
            });
        }
    }
    Ok(entries)
}

/// 按文件夹路径获取照片（仅当前目录的直接子文件，不包含子目录）
#[tauri::command]
pub async fn get_photos_by_folder(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    eprintln!("[PhotoLib::get_photos_by_folder] Querying for: {:?}", folder_path);
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    // 查询全部照片，在 Rust 层按 parent 目录过滤（避免 SQL LIKE 转义问题）
    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         rating, color_label, flag, notes
                  FROM photos ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;

    let all_photos: Vec<Photo> = stmt
        .query_map([], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                file_hash: row.get(4)?,
                file_date: row.get(5)?,
                media_type: row.get(6)?,
                thumbnail_url: None,
                date_taken: row.get(7)?,
                camera_make: row.get(8)?,
                camera_model: row.get(9)?,
                lens_model: row.get(10)?,
                focal_length: row.get(11)?,
                aperture: row.get(12)?,
                shutter_speed: row.get(13)?,
                iso: row.get(14)?,
                exposure_comp: row.get(15)?,
                flash: row.get(16)?,
                white_balance: row.get(17)?,
                metering_mode: row.get(18)?,
                image_width: row.get(19)?,
                image_height: row.get(20)?,
                color_space: row.get(21)?,
                latitude: row.get(22)?,
                longitude: row.get(23)?,
                altitude: row.get(24)?,
                rating: row.get(25).unwrap_or(0),
                color_label: row.get(26)?,
                flag: row.get(27)?,
                notes: row.get(28)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    eprintln!("[PhotoLib::get_photos_by_folder] Total photos in DB: {}", all_photos.len());

    // 过滤：只保留直接父目录匹配的
    let folder = std::path::Path::new(&folder_path);
    let photos: Vec<Photo> = all_photos.into_iter()
        .filter(|p| {
            std::path::Path::new(&p.file_path)
                .parent()
                .map(|parent| parent == folder)
                .unwrap_or(false)
        })
        .collect();

    eprintln!("[PhotoLib::get_photos_by_folder] After parent filter: {} photos", photos.len());
    Ok(photos)
}

/// 按文件夹路径获取照片（递归，包含所有子目录 — 用于相册）
#[tauri::command]
pub async fn get_photos_by_folder_deep(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    // 查询全部照片，在 Rust 层按前缀过滤（避免 SQL LIKE 转义问题）
    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         rating, color_label, flag, notes
                  FROM photos ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;
    let all_photos: Vec<Photo> = stmt
        .query_map([], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                file_hash: row.get(4)?,
                file_date: row.get(5)?,
                media_type: row.get(6)?,
                thumbnail_url: None,
                date_taken: row.get(7)?,
                camera_make: row.get(8)?,
                camera_model: row.get(9)?,
                lens_model: row.get(10)?,
                focal_length: row.get(11)?,
                aperture: row.get(12)?,
                shutter_speed: row.get(13)?,
                iso: row.get(14)?,
                exposure_comp: row.get(15)?,
                flash: row.get(16)?,
                white_balance: row.get(17)?,
                metering_mode: row.get(18)?,
                image_width: row.get(19)?,
                image_height: row.get(20)?,
                color_space: row.get(21)?,
                latitude: row.get(22)?,
                longitude: row.get(23)?,
                altitude: row.get(24)?,
                rating: row.get(25).unwrap_or(0),
                color_label: row.get(26)?,
                flag: row.get(27)?,
                notes: row.get(28)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    // 过滤：文件路径以 folder_path 开头（递归包含子目录）
    let prefix = if folder_path.ends_with('\\') {
        folder_path.clone()
    } else {
        format!("{}\\", folder_path)
    };
    let photos: Vec<Photo> = all_photos.into_iter()
        .filter(|p| p.file_path.starts_with(&prefix))
        .collect();
    Ok(photos)
}

/// 获取所有已添加的文件夹（相册列表）
#[tauri::command]
pub async fn get_albums(
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<crate::models::Folder>, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT * FROM folders ORDER BY path")
        .map_err(|e| e.to_string())?;

    let folders = stmt
        .query_map([], |row| {
            Ok(crate::models::Folder {
                id: row.get(0)?,
                path: row.get(1)?,
                display_name: row.get(2)?,
                photo_count: row.get(3)?,
                last_scan: row.get(4)?,
                children: None,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(folders)
}

/// 添加一个文件夹到相册列表
#[tauri::command]
pub async fn add_album(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<(), String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;

    let name = std::path::Path::new(&folder_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| folder_path.clone());

    conn.execute(
        "INSERT OR IGNORE INTO folders (path, display_name) VALUES (?1, ?2)",
        rusqlite::params![folder_path, name],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// 从相册列表移除文件夹
#[tauri::command]
pub async fn remove_album(
    folder_id: i64,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<(), String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM folders WHERE id = ?1", rusqlite::params![folder_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 调试命令：列出数据库中所有照片的文件路径和总数
#[tauri::command]
pub async fn debug_list_photos(
    db: State<'_, crate::db::AppDatabase>,
) -> Result<String, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    
    let mut stmt = conn
        .prepare("SELECT file_path FROM photos LIMIT 5")
        .map_err(|e| e.to_string())?;
    
    let paths: Vec<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    
    Ok(format!("DB has {} photos. First {} paths: {:?}", count, paths.len(), paths))
}

/// 打开目录 — 极速返回
///
/// Priority 1 规格：扫描即返回（跳过 DB），<50ms 前端拿到文件列表
/// DB 写入在后台异步完成
#[tauri::command]
pub async fn open_directory(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    eprintln!("[PhotoLib::open_directory] Opening: {:?}", folder_path);
    let path = std::path::Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("目录不存在: {}", folder_path));
    }

    // ===== Phase 1: 极速扫描文件元数据（不解码像素） =====
    let entries = crate::scanner::scan_directory_shallow_with_meta(path);
    eprintln!("[PhotoLib::open_directory] Scanned {} files", entries.len());

    // 从扫描结果直接构建 Photo 数组（hash 作为 ID，EXIF 字段空）
    let photos: Vec<Photo> = entries.iter().map(|e| {
        let id = xxhash_rust::xxh3::xxh3_64(e.path.as_bytes()) as i64;
        Photo {
            id,
            file_path: e.path.clone(),
            file_name: e.name.clone(),
            file_size: Some(e.size),
            file_hash: None,
            file_date: Some(e.modified),
            media_type: Some(e.media_type.clone()),
            thumbnail_url: None,
            date_taken: None,
            camera_make: None, camera_model: None, lens_model: None,
            focal_length: None, aperture: None, shutter_speed: None, iso: None,
            exposure_comp: None, flash: None, white_balance: None, metering_mode: None,
            image_width: e.width.map(|w| w as i64),
            image_height: e.height.map(|h| h as i64),
            color_space: None,
            latitude: None, longitude: None, altitude: None,
            rating: 0, color_label: None, flag: None, notes: None,
        }
    }).collect();
    eprintln!("[PhotoLib::open_directory] Returning {} photos (instant)", photos.len());

    // ===== Phase 3 (background): DB 写入 + EXIF 提取 =====
    let db_path = db.path.clone();
    let dir_path = folder_path.clone();
    tokio::spawn(async move {
        if let Ok(conn) = Connection::open(&db_path) {
            conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
            conn.execute_batch("BEGIN TRANSACTION;").ok();
            for e in &entries {
                conn.execute(
                    "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, file_date, media_type, image_width, image_height)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    rusqlite::params![e.path, e.name, e.size, e.modified, e.media_type, e.width, e.height],
                ).ok();
            }
            conn.execute_batch("COMMIT;").ok();
        }
        eprintln!("[PhotoLib::open_directory] Background DB write done for {:?}", dir_path);
    });

    Ok(photos)
}

/// 从 DB 重新加载目录照片（含完整 EXIF）
/// extract_exif_batch 完成后调用此命令刷新数据
#[tauri::command]
pub async fn reload_directory(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    let glob_pattern = format!("{}\\*", folder_path.trim_end_matches('\\'));

    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         rating, color_label, flag, notes
                  FROM photos WHERE file_path GLOB ?1")
        .map_err(|e| e.to_string())?;

    let photos: Vec<Photo> = stmt
        .query_map([&glob_pattern], |row| {
            Ok(Photo {
                id: row.get(0)?,
                file_path: row.get(1)?,
                file_name: row.get(2)?,
                file_size: row.get(3)?,
                file_hash: row.get(4)?,
                file_date: row.get(5)?,
                media_type: row.get(6)?,
                thumbnail_url: None,
                date_taken: row.get(7)?,
                camera_make: row.get(8)?,
                camera_model: row.get(9)?,
                lens_model: row.get(10)?,
                focal_length: row.get(11)?,
                aperture: row.get(12)?,
                shutter_speed: row.get(13)?,
                iso: row.get(14)?,
                exposure_comp: row.get(15)?,
                flash: row.get(16)?,
                white_balance: row.get(17)?,
                metering_mode: row.get(18)?,
                image_width: row.get(19)?,
                image_height: row.get(20)?,
                color_space: row.get(21)?,
                latitude: row.get(22)?,
                longitude: row.get(23)?,
                altitude: row.get(24)?,
                rating: row.get(25).unwrap_or(0),
                color_label: row.get(26)?,
                flag: row.get(27)?,
                notes: row.get(28)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    eprintln!("[PhotoLib::reload_directory] {} photos from DB", photos.len());
    Ok(photos)
}

/// 批量提取指定目录内照片的 EXIF（纯 Rust，不启动外部进程）
/// 使用 kamadak-exif 原生库解析，极低系统资源消耗
#[tauri::command]
pub async fn extract_exif_batch(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<usize, String> {
    use std::path::Path;
    eprintln!("[PhotoLib::extract_exif_batch] Start: {:?}", folder_path);

    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

    let all_files: Vec<String> = conn
        .prepare("SELECT file_path FROM photos WHERE date_taken IS NULL")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let folder_prefix = if folder_path.ends_with('\\') {
        folder_path.clone()
    } else {
        format!("{}\\", folder_path)
    };
    let files: Vec<String> = all_files
        .into_iter()
        .filter(|p| p.starts_with(&folder_prefix))
        .collect();

    if files.is_empty() {
        eprintln!("[PhotoLib::extract_exif_batch] All photos already have EXIF");
        return Ok(0);
    }

    eprintln!("[PhotoLib::extract_exif_batch] Need EXIF for {} photos (native parser)", files.len());
    let mut updated = 0usize;

    for file in &files {
        let fp = Path::new(file);
        if let Ok(exif) = crate::metadata::extract_exif(fp) {
            conn.execute(
                "UPDATE photos SET
                    date_taken = ?1, camera_make = ?2, camera_model = ?3, lens_model = ?4,
                    focal_length = ?5, aperture = ?6, shutter_speed = ?7, iso = ?8,
                    exposure_comp = ?9, flash = ?10, white_balance = ?11, metering_mode = ?12,
                    image_width = ?13, image_height = ?14, color_space = ?15,
                    latitude = ?16, longitude = ?17, altitude = ?18
                WHERE file_path = ?19",
                rusqlite::params![
                    exif.date_taken, exif.camera_make, exif.camera_model, exif.lens_model,
                    exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso,
                    exif.exposure_comp, exif.flash, exif.white_balance, exif.metering_mode,
                    exif.image_width, exif.image_height, exif.color_space,
                    exif.latitude, exif.longitude, exif.altitude,
                    file,
                ],
            ).ok();
            updated += 1;
        }
    }

    eprintln!("[PhotoLib::extract_exif_batch] Updated {} photos", updated);
    Ok(updated)
}

/// 获取照片缩略图 data URL
///
/// 确保缓存存在，读取后 base64 编码返回 `data:image/jpeg;base64,...`。
/// 虚拟列表 + 2 并发限流确保同时只有 ~20 个 data URL 在内存。
#[tauri::command]
pub async fn get_thumbnail(
    file_path: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::path::Path;

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    let cache_path = crate::thumbnail::get_cache_path(&file_path);

    // 缓存有效 → 读文件 base64 编码
    let use_cache = cache_path.exists()
        && (|| {
            let (Ok(sm), Ok(cm)) = (std::fs::metadata(path), std::fs::metadata(&cache_path)) else { return false };
            let (Ok(st), Ok(ct)) = (sm.modified(), cm.modified()) else { return false };
            ct >= st
        })();

    if !use_cache {
        let thumb_data = crate::thumbnail::generate_thumbnail(path, crate::thumbnail::ThumbLevel::L1)
            .map_err(|e| format!("缩略图生成失败: {}", e))?;
        std::fs::write(&cache_path, &thumb_data).ok();
    }

    let data = std::fs::read(&cache_path).map_err(|e| format!("读取缓存失败: {}", e))?;
    let b64 = STANDARD.encode(&data);
    Ok(format!("data:image/jpeg;base64,{}", b64))
}

/// 预生成前 N 张缩略图到磁盘缓存（单线程，低调运行）
///
/// 设计思路（对标 XnView MP）：
///   - 只预热前 50 张（约 2 屏），后续由前端 IntersectionObserver 懒加载覆盖
///   - 单线程串行，不抢前端 visible 区域的 get_thumbnail 资源
///   - 延迟触发：前端先渲染网格，500ms 后再调用此命令，避免竞争
///
/// 配合 EXIF 内嵌缩略图优化后，预热 50 张只需 ~250ms（5ms × 50），
/// 对 CPU 和磁盘 I/O 影响极低。
#[tauri::command]
pub async fn preload_thumbnails(folder_path: String) -> Result<usize, String> {
    use std::path::Path;

    let path = Path::new(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(0);
    }

    let files = crate::scanner::scan_directory_shallow(path);
    if files.is_empty() {
        return Ok(0);
    }

    const PRELOAD_LIMIT: usize = 50;

    let to_preload: Vec<&String> = files.iter().take(PRELOAD_LIMIT).collect();
    let mut cached = 0usize;

    for file in &to_preload {
        let fp = Path::new(file);
        let cache_path = crate::thumbnail::get_cache_path(file);

        // 已有有效缓存则跳过
        if cache_path.exists() {
            if let (Ok(sm), Ok(cm)) = (std::fs::metadata(fp), std::fs::metadata(&cache_path)) {
                if let (Ok(st), Ok(ct)) = (sm.modified(), cm.modified()) {
                    if ct >= st {
                        cached += 1;
                        continue;
                    }
                }
            }
        }

        let data = crate::thumbnail::generate_thumbnail(fp, crate::thumbnail::ThumbLevel::L1);
        if let Ok(d) = data {
            if !d.is_empty() {
                std::fs::write(&cache_path, &d).ok();
                cached += 1;
            }
        }
    }

    let total = to_preload.len();
    eprintln!(
        "[PhotoLib::preload_thumbnails] Cached {}/{} thumbs in {:?} (limit={PRELOAD_LIMIT})",
        cached, total, folder_path
    );
    Ok(cached)
}

