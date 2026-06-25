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

/// 打开目录 — 极速返回（skeleton），后台异步加载 meta + EXIF
///
/// 理想流程：
///   1. Phase 1 (this fn, 同步，~20ms) — read_dir → 返回最小 Photo 列表
///   2. Phase 2 (后台) — INSERT 到 DB + 读 meta + 查 DB 缓存 EXIF → emit "exif-updated"
///   3. Phase 3 (后台, exif_pool) — 排程所有 skeleton 到池里做新鲜提取
///   4. 前端 scroll 时调用 extract_exif_for(visible_paths) → 视口优先
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

    // ===== Phase 1: Skeleton (read_dir only, 目标 < 50ms) =====
    let skeleton: Vec<Photo> = tokio::task::spawn_blocking({
        let path = path.clone();
        move || {
            let mut skeleton = Vec::new();
            if let Ok(entries) = std::fs::read_dir(&path) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let epath = entry.path();
                    if !epath.is_file() { continue; }
                    if !crate::scanner::is_photo_file(&epath) { continue; }

                    let name = epath.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let media_type = crate::scanner::get_media_type(&epath)
                        .unwrap_or_default();
                    let path_str = epath.to_string_lossy().to_string();
                    let id = xxhash_rust::xxh3::xxh3_64(path_str.as_bytes()) as i64;

                    skeleton.push(Photo {
                        id,
                        file_path: path_str,
                        file_name: name,
                        media_type: Some(media_type),
                        file_size: None, file_hash: None, file_date: None,
                        thumbnail_url: None,
                        date_taken: None,
                        camera_make: None, camera_model: None, lens_model: None,
                        focal_length: None, aperture: None, shutter_speed: None,
                        iso: None, exposure_comp: None, flash: None,
                        white_balance: None, metering_mode: None,
                        image_width: None, image_height: None, color_space: None,
                        latitude: None, longitude: None, altitude: None,
                        software: None, copyright: None, image_description: None,
                        orientation: None, exposure_program: None,
                        max_aperture: None, focal_length_35mm: None,
                        lens_make: None, scene_capture_type: None, contrast: None,
                        rating: 0, color_label: None, flag: None, notes: None,
                    });
                }
            }
            skeleton
        }
    }).await.map_err(|e| format!("fast scan join error: {}", e))?;

    eprintln!("[PhotoLib::open_directory] Skeleton: {} files (target < 50ms)", skeleton.len());

    // 注册 id 映射给 EXIF pool（worker 需要 file_path → id 来 emit patch）
    let id_paths: Vec<(String, i64)> = skeleton.iter().map(|p| (p.file_path.clone(), p.id)).collect();
    crate::exif_pool::pool().register_paths(&id_paths);

    // emit "photos-skeleton" 事件给前端（前端可以用此触发 UI 切换 loading）
    let _ = app.emit("photos-skeleton", serde_json::json!({
        "folderPath": &folder_path,
        "photos": &skeleton,
    }));

    // ===== Phase 2 + 3: 后台异步处理（不阻塞返回）=====
    let db_path = db.path.clone();
    let app_clone = app.clone();
    let folder = folder_path.clone();
    let skeleton_for_bg = skeleton.clone();
    tokio::spawn(async move {
        if let Err(e) = open_directory_background(db_path, app_clone, folder, skeleton_for_bg).await {
            eprintln!("[open_directory] background: {:#}", e);
        }
    });

    Ok(skeleton)
}

async fn open_directory_background(
    db_path: std::path::PathBuf,
    app: tauri::AppHandle,
    folder: String,
    skeleton: Vec<Photo>,
) -> anyhow::Result<()> {
    // Step A: INSERT file records（确保 DB 有记录）+ 读 fs::metadata + JPEG 头
    let db_path_a = db_path.clone();
    let skeleton_a = skeleton.clone();
    let result: anyhow::Result<Vec<MetaEntry>> = tokio::task::spawn_blocking(move || {
        let conn = Connection::open(&db_path_a)?;
        conn.execute_batch("PRAGMA journal_mode=WAL;").ok();

        conn.execute_batch("BEGIN TRANSACTION;").ok();
        for photo in &skeleton_a {
            conn.execute(
                "INSERT OR IGNORE INTO photos (file_path, file_name, media_type) VALUES (?1, ?2, ?3)",
                rusqlite::params![photo.file_path, photo.file_name, photo.media_type],
            ).ok();
        }
        conn.execute_batch("COMMIT;").ok();

        // 读 fs::metadata
        let mut entries = Vec::new();
        for photo in &skeleton_a {
            if let Ok(meta) = std::fs::metadata(&photo.file_path) {
                entries.push(MetaEntry {
                    path: photo.file_path.clone(),
                    file_size: meta.len() as i64,
                    modified: meta.modified().ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0),
                });
            }
        }
        Ok(entries)
    }).await.map_err(|e| anyhow::anyhow!("join: {}", e))?;

    let entries = result?;

    // UPDATE file_size + file_date
    let db_path_for_update = db_path.clone();
    let entries_for_update = entries.clone();
    let _ = tokio::task::spawn_blocking(move || {
        if let Ok(conn) = Connection::open(&db_path_for_update) {
            conn.execute_batch("PRAGMA journal_mode=WAL;").ok();
            conn.execute_batch("BEGIN TRANSACTION;").ok();
            for e in &entries_for_update {
                conn.execute(
                    "UPDATE photos SET file_size=?1, file_date=?2 WHERE file_path=?3",
                    rusqlite::params![e.file_size, e.modified, e.path],
                ).ok();
            }
            conn.execute_batch("COMMIT;").ok();
        }
    }).await;

    // emit "meta-loaded" 事件（file_size + file_date）
    if !entries.is_empty() {
        let meta_patches: Vec<serde_json::Value> = entries.iter().map(|e| {
            let id = xxhash_rust::xxh3::xxh3_64(e.path.as_bytes()) as i64;
            serde_json::json!({
                "id": id,
                "filePath": e.path,
                "fileSize": e.file_size,
                "fileDate": e.modified,
            })
        }).collect();
        let _ = app.emit("meta-loaded", &meta_patches);
    }

    // Step B: 查 DB 缓存的 EXIF → emit "exif-updated" events（分批）
    let folder_for_query = folder.clone();
    let cached: Vec<serde_json::Value> = tokio::task::spawn_blocking(move || -> Vec<serde_json::Value> {
        let conn = match Connection::open(crate::db::get_db_path()) {
            Ok(c) => c,
            Err(_) => return Vec::new(),
        };
        let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
        let folder_norm = folder_for_query.trim_end_matches('\\');
        let prefix = format!("{}\\", folder_norm);
        let mut stmt = match conn.prepare(
            "SELECT id, file_path, date_taken, camera_make, camera_model, lens_model,
                    focal_length, aperture, shutter_speed, iso,
                    exposure_comp, flash, white_balance, metering_mode,
                    image_width, image_height, color_space,
                    latitude, longitude, altitude,
                    software, copyright, image_description, orientation,
                    exposure_program, max_aperture, focal_length_35mm,
                    lens_make, scene_capture_type, contrast
             FROM photos WHERE file_path LIKE ?1
             AND (date_taken IS NOT NULL OR exif_attempted=1)"
        ) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };
        let mut patches = Vec::new();
        let folder = std::path::PathBuf::from(folder_norm);
        if let Ok(rows) = stmt.query_map(rusqlite::params![format!("{}%", prefix)], |row| {
            let file_path: String = row.get(1)?;
            let parent_match = std::path::Path::new(&file_path)
                .parent()
                .map(|p| p == folder.as_path())
                .unwrap_or(false);
            if !parent_match {
                return Ok(None);
            }
            Ok(Some(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "filePath": file_path,
                "dateTaken": row.get::<_, Option<String>>(2)?,
                "cameraMake": row.get::<_, Option<String>>(3)?,
                "cameraModel": row.get::<_, Option<String>>(4)?,
                "lensModel": row.get::<_, Option<String>>(5)?,
                "focalLength": row.get::<_, Option<f64>>(6)?,
                "aperture": row.get::<_, Option<f64>>(7)?,
                "shutterSpeed": row.get::<_, Option<String>>(8)?,
                "iso": row.get::<_, Option<i64>>(9)?,
                "exposureComp": row.get::<_, Option<f64>>(10)?,
                "flash": row.get::<_, Option<String>>(11)?,
                "whiteBalance": row.get::<_, Option<String>>(12)?,
                "meteringMode": row.get::<_, Option<String>>(13)?,
                "imageWidth": row.get::<_, Option<i64>>(14)?,
                "imageHeight": row.get::<_, Option<i64>>(15)?,
                "colorSpace": row.get::<_, Option<String>>(16)?,
                "latitude": row.get::<_, Option<f64>>(17)?,
                "longitude": row.get::<_, Option<f64>>(18)?,
                "altitude": row.get::<_, Option<f64>>(19)?,
                "software": row.get::<_, Option<String>>(20)?,
                "copyright": row.get::<_, Option<String>>(21)?,
                "imageDescription": row.get::<_, Option<String>>(22)?,
                "orientation": row.get::<_, Option<i64>>(23)?,
                "exposureProgram": row.get::<_, Option<String>>(24)?,
                "maxAperture": row.get::<_, Option<f64>>(25)?,
                "focalLength35mm": row.get::<_, Option<f64>>(26)?,
                "lensMake": row.get::<_, Option<String>>(27)?,
                "sceneCaptureType": row.get::<_, Option<String>>(28)?,
                "contrast": row.get::<_, Option<String>>(29)?,
            })))
        }) {
            for r in rows.flatten() {
                if let Some(v) = r {
                    patches.push(v);
                }
            }
        }
        patches
    }).await.unwrap_or_default();

    if !cached.is_empty() {
        // 分批 emit（每批 20 条）
        for chunk in cached.chunks(20) {
            let _ = app.emit("exif-updated", chunk);
        }
    }

    // Step C: 把所有 skeleton 路径排程到 exif_pool（后台新鲜提取，JPG 优先）
    let mut paths: Vec<String> = skeleton.iter().map(|p| p.file_path.clone()).collect();
    crate::exif_pool::sort_jpg_first(&mut paths);
    crate::exif_pool::pool().enqueue_background(paths);

    Ok(())
}

#[derive(Clone)]
struct MetaEntry {
    path: String,
    file_size: i64,
    modified: i64,
}

/// 视口优先 EXIF 提取 — 前端 scroll 到新区域时调用
///
/// 内部走 exif_pool 的优先队列，worker 完成时 emit "exif-updated" 事件
/// 此命令返回 session id，前端可记录并在所有 path 都有结果后做后续处理
#[tauri::command]
pub async fn extract_exif_for(paths: Vec<String>) -> Result<u64, String> {
    if paths.is_empty() {
        return Ok(0);
    }
    let mut sorted = paths;
    crate::exif_pool::sort_jpg_first(&mut sorted);
    let session = crate::exif_pool::pool().prioritize(sorted);
    Ok(session)
}

/// 从 DB 重新加载目录照片（含完整 EXIF）
/// 由前端在 `extract_exif_for` 处理完后调用，刷新数据
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

    let folder = std::path::PathBuf::from(folder_norm);
    let photos: Vec<Photo> = candidates.into_iter()
        .filter(|p| {
            std::path::Path::new(&p.file_path)
                .parent()
                .map(|parent| parent == folder.as_path())
                .unwrap_or(false)
        })
        .collect();

    Ok(photos)
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

        const PRELOAD_LIMIT: usize = 200;
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

