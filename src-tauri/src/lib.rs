// PhotoLib - Rust backend library
// 模块化架构: db / scanner / metadata / thumbnail / export / watcher

pub mod db;
pub mod models;
pub mod scanner;
pub mod metadata;
pub mod thumbnail;
pub mod export;
pub mod watcher;
pub mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // 初始化数据库
            let app_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("photolib");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("catalog.db");

            db::init_db(&db_path)?;
            app.manage(db::AppDatabase { path: db_path });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan_folder,
            commands::scan_folder_deep,
            commands::get_photos,
            commands::get_photo_metadata,
            commands::import_photos,
            commands::detect_removable_drives,
            commands::browse_directory,
            commands::get_photos_by_folder,
            commands::get_photos_by_folder_deep,
            commands::debug_list_photos,
            commands::open_directory,
            commands::reload_directory,
            commands::extract_exif_batch,
            commands::get_thumbnail,
            commands::preload_thumbnails,
            commands::get_albums,
            commands::add_album,
            commands::remove_album,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PhotoLib");
}
