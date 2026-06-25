// PhotoLib - Rust backend library

pub mod db;
pub mod models;
pub mod scanner;
pub mod metadata;
pub mod thumbnail;
pub mod export;
pub mod watchdog;
pub mod commands;
pub mod exif_pool;

#[cfg(target_os = "windows")]
pub mod win_thumbcache;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_dir = dirs::data_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("photolib");
            std::fs::create_dir_all(&app_dir).ok();
            let db_path = app_dir.join("catalog.db");

            db::init_db(&db_path.clone())?;
            db::set_db_path(db_path.clone());
            app.manage(db::AppDatabase { path: db_path });

            app.manage(watchdog::Watchdog::new());

            // 初始化 EXIF 池：保存 AppHandle 用于事件发射
            exif_pool::set_event_app(app.handle().clone());

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
            commands::extract_exif_for,
            commands::get_thumbnail,
            commands::get_thumbnail_path,
            commands::preload_thumbnails,
            commands::get_albums,
            commands::add_album,
            commands::remove_album,
            commands::watch_directory,
            commands::unwatch_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PhotoLib");
}
