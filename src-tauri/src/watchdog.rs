// Watchdog — 监听目录文件变化，触发 EXIF 提取
//
// 重构：不再维护自己的 ExifPool，统一使用全局 exif_pool::pool()
// 新增/修改文件时：
//   1. INSERT 到 DB（仅新文件）
//   2. 把路径提交给 exif_pool（带单飞去重）

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::Emitter;
use notify::{Event, EventKind, RecursiveMode, Watcher};

use rusqlite::Connection;
use xxhash_rust::xxh3::xxh3_64;

use crate::scanner;

const PHOTO_EXTS: &[&str] = &[
    "cr3", "cr2", "nef", "nrw", "arw", "raf", "orf",
    "dng", "rw2", "pef", "jpg", "jpeg", "png", "tiff",
    "tif", "heic", "heif", "webp", "avif", "bmp",
];

pub struct Watchdog {
    cancel: Arc<AtomicBool>,
    handle: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Watchdog {
    pub fn new() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            handle: Mutex::new(None),
        }
    }

    pub fn start(&self, dir: &Path, db_path: &Path, app: tauri::AppHandle) {
        self.stop();

        self.cancel.store(false, Ordering::SeqCst);
        let cancel = self.cancel.clone();
        let dir = dir.to_path_buf();
        let db_path = db_path.to_path_buf();
        let app_for_thread = app.clone();

        let handle = std::thread::spawn(move || {
            let (tx, rx) = mpsc::channel::<Result<Event, notify::Error>>();

            let mut watcher = match notify::recommended_watcher(move |res| {
                tx.send(res).ok();
            }) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("[Watchdog] create watcher error: {}", e);
                    return;
                }
            };

            if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
                eprintln!("[Watchdog] watch {:?} error: {}", dir, e);
                return;
            }

            loop {
                match rx.recv_timeout(Duration::from_millis(300)) {
                    Ok(Ok(event)) => {
                        process_event(event, &dir, &db_path, &app_for_thread);
                    }
                    Ok(Err(_)) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        if cancel.load(Ordering::Relaxed) {
                            break;
                        }
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }

            drop(watcher);
        });

        *self.handle.lock().unwrap() = Some(handle);
    }

    pub fn stop(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.lock().unwrap().take() {
            handle.join().ok();
        }
    }
}

impl Drop for Watchdog {
    fn drop(&mut self) {
        self.stop();
    }
}

// ======================== 事件处理 ========================

fn process_event(event: Event, _dir: &Path, db_path: &Path, app: &tauri::AppHandle) {
    match &event.kind {
        EventKind::Create(_) => {
            for path in &event.paths {
                if is_photo_file(path) {
                    handle_new_file(path, db_path, app);
                }
            }
        }
        EventKind::Remove(_) => {
            for path in &event.paths {
                if is_photo_file(path) {
                    handle_removed_file(path, db_path);
                }
            }
        }
        EventKind::Modify(_) => {
            for path in &event.paths {
                if is_photo_file(path) {
                    handle_modified_file(path, db_path);
                }
            }
        }
        _ => {}
    }
}

fn is_photo_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    match path.extension().and_then(|e| e.to_str()) {
        Some(ext) => PHOTO_EXTS.contains(&ext.to_lowercase().as_str()),
        None => false,
    }
}

// ======================== Create ========================

fn handle_new_file(path: &Path, db_path: &Path, app: &tauri::AppHandle) {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let media_type = scanner::get_media_type(path);
    let file_size = std::fs::metadata(path).ok().map(|m| m.len() as i64);
    let id = xxh3_64(file_path.as_bytes()) as i64;

    if let Ok(conn) = Connection::open(db_path) {
        conn.execute(
            "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, media_type)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file_path, file_name, file_size, media_type],
        ).ok();
    }

    // 通知前端文件变更
    let dir = dir_of(path);
    let _ = app.emit("files-changed", dir.to_string_lossy().to_string());

    // 注册 id 映射，提交到全局 exif_pool
    crate::exif_pool::pool().register_paths(&[(file_path.clone(), id)]);
    crate::exif_pool::pool().enqueue_background(vec![file_path]);
}

fn handle_removed_file(path: &Path, db_path: &Path) {
    let file_path = path.to_string_lossy().to_string();

    if let Ok(conn) = Connection::open(db_path) {
        conn.execute("DELETE FROM photos WHERE file_path = ?1", rusqlite::params![file_path]).ok();
    }
}

fn handle_modified_file(path: &Path, _db_path: &Path) {
    let file_path = path.to_string_lossy().to_string();
    let id = xxh3_64(file_path.as_bytes()) as i64;

    // 修改文件：重新提交到 exif_pool（单飞去重保证不会重复处理）
    crate::exif_pool::pool().register_paths(&[(file_path.clone(), id)]);
    crate::exif_pool::pool().enqueue_background(vec![file_path]);
}

fn dir_of(path: &Path) -> &Path {
    path.parent().unwrap_or(Path::new(""))
}
