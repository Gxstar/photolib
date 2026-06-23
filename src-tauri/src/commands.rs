// Tauri 命令模块 — 前端调用的所有 IPC 接口

use crate::models::Photo;
use crate::scanner;
use crate::watchdog::Watchdog;
use tauri::{State, Emitter};
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
                         software, copyright, image_description, orientation,
                         exposure_program, max_aperture, focal_length_35mm,
                         lens_make, scene_capture_type, contrast,
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
                software: row.get(25)?,
                copyright: row.get(26)?,
                image_description: row.get(27)?,
                orientation: row.get(28)?,
                exposure_program: row.get(29)?,
                max_aperture: row.get(30)?,
                focal_length_35mm: row.get(31)?,
                lens_make: row.get(32)?,
                scene_capture_type: row.get(33)?,
                contrast: row.get(34)?,
                rating: row.get(35).unwrap_or(0),
                color_label: row.get(36)?,
                flag: row.get(37)?,
                notes: row.get(38)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(photos)
}

/// 获取单张照片的完整 EXIF 元数据（nom-exif 原生解析）
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
                    latitude, longitude, altitude,
                    software, copyright, image_description, orientation,
                    exposure_program, max_aperture, focal_length_35mm,
                    lens_make, scene_capture_type, contrast
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                          ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
                          ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30,
                          ?31, ?32)",
                rusqlite::params![
                    dest_str, file_name, file_size, media_type,
                    exif.date_taken, exif.camera_make, exif.camera_model, exif.lens_model,
                    exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso,
                    exif.exposure_comp, exif.flash, exif.white_balance, exif.metering_mode,
                    exif.image_width, exif.image_height, exif.color_space,
                    exif.latitude, exif.longitude, exif.altitude,
                    exif.software, exif.copyright, exif.image_description, exif.orientation,
                    exif.exposure_program, exif.max_aperture, exif.focal_length_35mm,
                    exif.lens_make, exif.scene_capture_type, exif.contrast,
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

    // SQL LIKE 前缀匹配走 idx_file_path 索引（替代「SELECT * 全表扫描」）
    let folder_norm = folder_path.trim_end_matches('\\');
    let prefix = format!("{}\\", folder_norm);

    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         software, copyright, image_description, orientation,
                         exposure_program, max_aperture, focal_length_35mm,
                         lens_make, scene_capture_type, contrast,
                         rating, color_label, flag, notes
                  FROM photos
                  WHERE file_path LIKE ?1
                  ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;

    let candidates: Vec<Photo> = stmt
        .query_map(rusqlite::params![format!("{}%", prefix)], |row| {
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
                software: row.get(25)?,
                copyright: row.get(26)?,
                image_description: row.get(27)?,
                orientation: row.get(28)?,
                exposure_program: row.get(29)?,
                max_aperture: row.get(30)?,
                focal_length_35mm: row.get(31)?,
                lens_make: row.get(32)?,
                scene_capture_type: row.get(33)?,
                contrast: row.get(34)?,
                rating: row.get(35).unwrap_or(0),
                color_label: row.get(36)?,
                flag: row.get(37)?,
                notes: row.get(38)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    eprintln!("[PhotoLib::get_photos_by_folder] {} candidates with prefix", candidates.len());

    // 过滤：只保留直接父目录匹配，排除子目录
    let folder = std::path::PathBuf::from(folder_norm);
    let photos: Vec<Photo> = candidates.into_iter()
        .filter(|p| {
            std::path::Path::new(&p.file_path)
                .parent()
                .map(|parent| parent == folder.as_path())
                .unwrap_or(false)
        })
        .collect();

    eprintln!("[PhotoLib::get_photos_by_folder] {} photos (direct children only)", photos.len());
    Ok(photos)
}

/// 按文件夹路径获取照片（递归，包含所有子目录 — 用于相册）
#[tauri::command]
pub async fn get_photos_by_folder_deep(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
) -> Result<Vec<Photo>, String> {
    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    let folder_norm = folder_path.trim_end_matches('\\');
    let prefix = format!("{}\\", folder_norm);

    // 直接 SQL LIKE 前缀匹配走 idx_file_path 索引
    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         software, copyright, image_description, orientation,
                         exposure_program, max_aperture, focal_length_35mm,
                         lens_make, scene_capture_type, contrast,
                         rating, color_label, flag, notes
                  FROM photos
                  WHERE file_path LIKE ?1
                  ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;
    let photos: Vec<Photo> = stmt
        .query_map(rusqlite::params![format!("{}%", prefix)], |row| {
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
                software: row.get(25)?,
                copyright: row.get(26)?,
                image_description: row.get(27)?,
                orientation: row.get(28)?,
                exposure_program: row.get(29)?,
                max_aperture: row.get(30)?,
                focal_length_35mm: row.get(31)?,
                lens_make: row.get(32)?,
                scene_capture_type: row.get(33)?,
                contrast: row.get(34)?,
                rating: row.get(35).unwrap_or(0),
                color_label: row.get(36)?,
                flag: row.get(37)?,
                notes: row.get(38)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
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

/// 打开目录 — 极速返回，后台异步完成 DB 写入 + EXIF 提取
///
/// Priority 1 规格：扫描即返回（跳过 DB），<50ms 前端拿到文件列表
/// 后台线程：INSERT → COMMIT → 逐文件 EXIF 提取 → 事件推送（免竞态）
#[tauri::command]
pub async fn open_directory(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
    app: tauri::AppHandle,
) -> Result<Vec<Photo>, String> {
    eprintln!("[PhotoLib::open_directory] Opening: {:?}", folder_path);
    let path = std::path::PathBuf::from(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Err(format!("目录不存在: {}", folder_path));
    }

    // ===== Phase 1: 极速扫描文件元数据 =====
    let entries = tokio::task::spawn_blocking(move || {
        crate::scanner::scan_directory_shallow_with_meta(&path)
    }).await.map_err(|e| format!("scan join error: {}", e))?;
    eprintln!("[PhotoLib::open_directory] Scanned {} files", entries.len());

    // 构建 Photo 数组（hash 为 ID，EXIF 字段空）
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
            software: None, copyright: None, image_description: None,
            orientation: None, exposure_program: None, max_aperture: None,
            focal_length_35mm: None, lens_make: None,
            scene_capture_type: None, contrast: None,
            rating: 0, color_label: None, flag: None, notes: None,
        }
    }).collect();
    eprintln!("[PhotoLib::open_directory] Returning {} photos (instant)", photos.len());

    // ===== Phase 3 (background): INSERT + EXIF 一体化 =====
    let db_path = db.path.clone();
    let dir_path = folder_path.clone();
    let app_handle = app.clone();
    tokio::spawn(async move {
        // — Step A: INSERT file records（SQLite 操作本来就是同步阻塞的） —
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
            eprintln!("[PhotoLib::open_directory] DB INSERT: {} files → {:?}", entries.len(), dir_path);
        }

        // — Step B: EXIF extraction + event push —
        // 包进 spawn_blocking 释放 tokio worker 线程，让缩略图 IPC 不排队
        let db_path2 = db_path.clone();
        let app_handle2 = app_handle.clone();
        let dir_path2 = dir_path.clone();
        let entries2 = entries.clone();
        let _ = tokio::task::spawn_blocking(move || {
            if let Ok(conn) = Connection::open(&db_path2) {
                conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
                let mut batch: Vec<serde_json::Value> = Vec::with_capacity(100);
                for e in &entries2 {
                    let fp = std::path::Path::new(&e.path);
                    match crate::metadata::extract_exif(fp) {
                        Ok(exif) => {
                            conn.execute(
                                "UPDATE photos SET
                                    date_taken=?1, camera_make=?2, camera_model=?3, lens_model=?4,
                                    focal_length=?5, aperture=?6, shutter_speed=?7, iso=?8,
                                    exposure_comp=?9, flash=?10, white_balance=?11, metering_mode=?12,
                                    image_width=?13, image_height=?14, color_space=?15,
                                    latitude=?16, longitude=?17, altitude=?18,
                                    software=?19, copyright=?20, image_description=?21, orientation=?22,
                                    exposure_program=?23, max_aperture=?24, focal_length_35mm=?25,
                                    lens_make=?26, scene_capture_type=?27, contrast=?28,
                                    exif_attempted=1
                                 WHERE file_path=?29",
                                rusqlite::params![
                                    exif.date_taken, exif.camera_make, exif.camera_model, exif.lens_model,
                                    exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso,
                                    exif.exposure_comp, exif.flash, exif.white_balance, exif.metering_mode,
                                    exif.image_width, exif.image_height, exif.color_space,
                                    exif.latitude, exif.longitude, exif.altitude,
                                    exif.software, exif.copyright, exif.image_description, exif.orientation,
                                    exif.exposure_program, exif.max_aperture, exif.focal_length_35mm,
                                    exif.lens_make, exif.scene_capture_type, exif.contrast,
                                    e.path,
                                ],
                            ).ok();

                            let id = xxhash_rust::xxh3::xxh3_64(e.path.as_bytes()) as i64;
                            batch.push(serde_json::json!({
                                "id": id, "filePath": e.path,
                                "dateTaken": exif.date_taken,
                                "cameraMake": exif.camera_make,
                                "cameraModel": exif.camera_model,
                                "lensModel": exif.lens_model,
                                "focalLength": exif.focal_length,
                                "aperture": exif.aperture,
                                "shutterSpeed": exif.shutter_speed,
                                "iso": exif.iso,
                                "exposureComp": exif.exposure_comp,
                                "flash": exif.flash,
                                "whiteBalance": exif.white_balance,
                                "meteringMode": exif.metering_mode,
                                "imageWidth": exif.image_width,
                                "imageHeight": exif.image_height,
                                "colorSpace": exif.color_space,
                                "latitude": exif.latitude,
                                "longitude": exif.longitude,
                                "altitude": exif.altitude,
                                "software": exif.software,
                                "copyright": exif.copyright,
                                "imageDescription": exif.image_description,
                                "orientation": exif.orientation,
                                "exposureProgram": exif.exposure_program,
                                "maxAperture": exif.max_aperture,
                                "focalLength35mm": exif.focal_length_35mm,
                                "lensMake": exif.lens_make,
                                "sceneCaptureType": exif.scene_capture_type,
                                "contrast": exif.contrast,
                            }));
                            if batch.len() >= 100 {
                                let _ = app_handle2.emit("exif-updated", &batch);
                                batch.clear();
                            }
                        }
                        Err(err) => {
                            conn.execute(
                                "UPDATE photos SET exif_attempted=1 WHERE file_path=?1",
                                rusqlite::params![e.path],
                            ).ok();
                            eprintln!("[PhotoLib::open_directory] EXIF skip {}: {:#}", e.path, err);
                        }
                    }
                }
                if !batch.is_empty() {
                    let _ = app_handle2.emit("exif-updated", &batch);
                }
                eprintln!("[PhotoLib::open_directory] EXIF done: {} files processed for {:?}", entries2.len(), dir_path2);
            }
        }).await.unwrap_or_default();
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

    let folder_norm = folder_path.trim_end_matches('\\');
    let prefix = format!("{}\\", folder_norm);

    let mut stmt = conn
        .prepare("SELECT id, file_path, file_name, file_size, file_hash, file_date, media_type,
                         date_taken, camera_make, camera_model, lens_model,
                         focal_length, aperture, shutter_speed, iso,
                         exposure_comp, flash, white_balance, metering_mode,
                         image_width, image_height, color_space,
                         latitude, longitude, altitude,
                         software, copyright, image_description, orientation,
                         exposure_program, max_aperture, focal_length_35mm,
                         lens_make, scene_capture_type, contrast,
                         rating, color_label, flag, notes
                  FROM photos
                  WHERE file_path LIKE ?1
                  ORDER BY date_taken DESC")
        .map_err(|e| e.to_string())?;

    let candidates: Vec<Photo> = stmt
        .query_map(rusqlite::params![format!("{}%", prefix)], |row| {
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
                software: row.get(25)?,
                copyright: row.get(26)?,
                image_description: row.get(27)?,
                orientation: row.get(28)?,
                exposure_program: row.get(29)?,
                max_aperture: row.get(30)?,
                focal_length_35mm: row.get(31)?,
                lens_make: row.get(32)?,
                scene_capture_type: row.get(33)?,
                contrast: row.get(34)?,
                rating: row.get(35).unwrap_or(0),
                color_label: row.get(36)?,
                flag: row.get(37)?,
                notes: row.get(38)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 过滤：只保留直接父目录匹配的照片（不包含子目录）
    let folder = std::path::PathBuf::from(folder_norm);
    let photos: Vec<Photo> = candidates.into_iter()
        .filter(|p| {
            std::path::Path::new(&p.file_path)
                .parent()
                .map(|parent| parent == folder.as_path())
                .unwrap_or(false)
        })
        .collect();

    eprintln!("[PhotoLib::reload_directory] {} photos from DB (shallow)", photos.len());
    Ok(photos)
}

/// 提取目录照片的 EXIF（手动重处理，直接扫描文件系统）
///
/// 用途：手动修复已存在目录中缺失的 EXIF（如首次打开时竞态导致未处理）
/// 行为：扫描文件系统 → INSERT OR IGNORE 确保记录 → 跳过 exif_attempted=1 → 提取 + event
/// 不再依赖 DB 中是否有记录（消除和 open_directory 后台 INSERT 的竞态）
#[tauri::command]
pub async fn extract_exif_batch(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    use std::path::Path;
    eprintln!("[PhotoLib::extract_exif_batch] Start: {:?}", folder_path);

    let dir = Path::new(&folder_path);
    if !dir.exists() || !dir.is_dir() {
        return Err("目录不存在".to_string());
    }

    // 直接扫描文件系统（不依赖 DB）
    let files = crate::scanner::scan_directory_shallow(dir);
    eprintln!("[PhotoLib::extract_exif_batch] Found {} files on disk", files.len());

    let conn = Connection::open(&db.path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

    // 确保所有文件在 DB 中有行
    conn.execute_batch("BEGIN TRANSACTION;").ok();
    for f in &files {
        let fp = Path::new(f);
        let name = fp.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let media = crate::scanner::get_media_type(fp);
        let size = std::fs::metadata(fp).ok().map(|m| m.len() as i64);
        conn.execute(
            "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, media_type)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![f, name, size, media],
        ).ok();
    }
    conn.execute_batch("COMMIT;").ok();

    // 提取 EXIF（跳过 exif_attempted=1）
    let mut updated = 0usize;
    let mut skipped = 0usize;
    let mut batch: Vec<serde_json::Value> = Vec::with_capacity(100);

    for f in &files {
        // 跳过已尝试过的文件
        let attempted: Option<i32> = conn
            .query_row(
                "SELECT exif_attempted FROM photos WHERE file_path=?1",
                rusqlite::params![f],
                |row| row.get(0),
            )
            .ok();
        if attempted == Some(1) {
            skipped += 1;
            continue;
        }

        let fp = Path::new(f);
        match crate::metadata::extract_exif(fp) {
            Ok(exif) => {
                conn.execute(
                    "UPDATE photos SET
                        date_taken=?1, camera_make=?2, camera_model=?3, lens_model=?4,
                        focal_length=?5, aperture=?6, shutter_speed=?7, iso=?8,
                        exposure_comp=?9, flash=?10, white_balance=?11, metering_mode=?12,
                        image_width=?13, image_height=?14, color_space=?15,
                        latitude=?16, longitude=?17, altitude=?18,
                        exif_attempted=1
                     WHERE file_path=?19",
                    rusqlite::params![
                        exif.date_taken, exif.camera_make, exif.camera_model, exif.lens_model,
                        exif.focal_length, exif.aperture, exif.shutter_speed, exif.iso,
                        exif.exposure_comp, exif.flash, exif.white_balance, exif.metering_mode,
                        exif.image_width, exif.image_height, exif.color_space,
                        exif.latitude, exif.longitude, exif.altitude,
                        f,
                    ],
                ).ok();
                updated += 1;

                let id = xxhash_rust::xxh3::xxh3_64(f.as_bytes()) as i64;
                batch.push(serde_json::json!({
                    "id": id, "filePath": f,
                    "dateTaken": exif.date_taken,
                    "cameraMake": exif.camera_make,
                    "cameraModel": exif.camera_model,
                    "lensModel": exif.lens_model,
                    "focalLength": exif.focal_length,
                    "aperture": exif.aperture,
                    "shutterSpeed": exif.shutter_speed,
                    "iso": exif.iso,
                    "exposureComp": exif.exposure_comp,
                    "flash": exif.flash,
                    "whiteBalance": exif.white_balance,
                    "meteringMode": exif.metering_mode,
                    "imageWidth": exif.image_width,
                    "imageHeight": exif.image_height,
                    "colorSpace": exif.color_space,
                    "latitude": exif.latitude,
                    "longitude": exif.longitude,
                    "altitude": exif.altitude,
                }));
                if batch.len() >= 100 {
                    let _ = app.emit("exif-updated", &batch);
                    batch.clear();
                }
            }
            Err(err) => {
                conn.execute(
                    "UPDATE photos SET exif_attempted=1 WHERE file_path=?1",
                    rusqlite::params![f],
                ).ok();
                eprintln!("[PhotoLib::extract_exif_batch] FAIL {}: {:#}", f, err);
            }
        }
    }
    if !batch.is_empty() {
        let _ = app.emit("exif-updated", &batch);
    }

    eprintln!("[PhotoLib::extract_exif_batch] Done: {} updated, {} skipped / {} total",
              updated, skipped, files.len());
    Ok(updated)
}

/// 获取照片缩略图磁盘缓存路径（用于前端 convertFileSrc 加载）
///
/// 通过 asset:// 协议让 WebView 直接读取磁盘缓存，
/// 省去 base64 编解码和 IPC 字符串传输开销。
/// 阻塞 I/O（文件读取 + 解码 + JPEG 编码）全部包进 spawn_blocking，
/// 不占用 tokio worker，确保缩略图 IPC 不阻塞其他命令。
#[tauri::command]
pub async fn get_thumbnail_path(
    file_path: String,
) -> Result<String, String> {
    let path = std::path::PathBuf::from(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    tokio::task::spawn_blocking(move || {
        crate::thumbnail::generate_and_cache(&path, crate::thumbnail::ThumbLevel::L1)
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| {
                eprintln!("[PhotoLib::get_thumbnail_path] FAILED for {:?}: {:#}", path, e);
                format!("缩略图生成失败: {}", e)
            })
    }).await.map_err(|e| format!("join error: {}", e))?
}

/// 兼容旧接口：返回 base64 data URL（已弃用，保留以备不时之需）
#[tauri::command]
pub async fn get_thumbnail(
    file_path: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let path = std::path::PathBuf::from(&file_path);
    if !path.exists() {
        return Err("文件不存在".to_string());
    }

    tokio::task::spawn_blocking(move || {
        let cache_path = match crate::thumbnail::generate_and_cache(&path, crate::thumbnail::ThumbLevel::L1) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[PhotoLib::get_thumbnail] FAILED for {:?}: {:#}", path, e);
                return Err(format!("缩略图生成失败: {}", e));
            }
        };
        let data = std::fs::read(&cache_path).map_err(|e| format!("读取缓存失败: {}", e))?;
        let b64 = STANDARD.encode(&data);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    }).await.map_err(|e| format!("join error: {}", e))?
}

/// 预生成前 N 张缩略图到磁盘缓存（阻塞 I/O 外移 spawn_blocking）
#[tauri::command]
pub async fn preload_thumbnails(folder_path: String) -> Result<usize, String> {
    let path = std::path::PathBuf::from(&folder_path);
    if !path.exists() || !path.is_dir() {
        return Ok(0);
    }

    tokio::task::spawn_blocking(move || {
        let files = crate::scanner::scan_directory_shallow(&path);
        if files.is_empty() {
            return Ok(0usize);
        }

        const PRELOAD_LIMIT: usize = 50;
        let mut cached = 0usize;

        for file in files.iter().take(PRELOAD_LIMIT) {
            let fp = std::path::Path::new(file);
            if let Ok(data) = crate::thumbnail::generate_thumbnail(fp, crate::thumbnail::ThumbLevel::L1) {
                if !data.is_empty() {
                    let cache_path = crate::thumbnail::get_cache_path(file);
                    std::fs::write(&cache_path, &data).ok();
                    cached += 1;
                }
            }
        }

        eprintln!(
            "[PhotoLib::preload_thumbnails] Cached {}/{} thumbs in {:?} (limit={PRELOAD_LIMIT})",
            cached, files.len().min(PRELOAD_LIMIT), folder_path
        );
        Ok(cached)
    }).await.map_err(|e| format!("join error: {}", e))?
}

/// 监听目录 — 使用 notify 实时监听文件增删改
#[tauri::command]
pub async fn watch_directory(
    path: String,
    db: State<'_, crate::db::AppDatabase>,
    app: tauri::AppHandle,
    watchdog: State<'_, Watchdog>,
) -> Result<(), String> {
    let dir = std::path::Path::new(&path);
    watchdog.start(dir, &db.path, app);
    Ok(())
}

/// 停止监听当前目录
#[tauri::command]
pub async fn unwatch_directory(
    watchdog: State<'_, Watchdog>,
) -> Result<(), String> {
    watchdog.stop();
    Ok(())
}

