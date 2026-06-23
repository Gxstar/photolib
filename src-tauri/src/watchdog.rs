use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
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

    pub fn start(&self, dir: &Path, db_path: &Path, app: AppHandle) {
        self.stop();

        self.cancel.store(false, Ordering::SeqCst);
        let cancel = self.cancel.clone();
        let dir = dir.to_path_buf();
        let db_path = db_path.to_path_buf();

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
                        process_event(event, &dir, &db_path, &app);
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

fn process_event(event: Event, _dir: &Path, db_path: &Path, app: &AppHandle) {
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
                    handle_removed_file(path, db_path, app);
                }
            }
        }
        EventKind::Modify(_) => {
            for path in &event.paths {
                if is_photo_file(path) {
                    handle_modified_file(path, db_path, app);
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

fn handle_new_file(path: &Path, db_path: &Path, app: &AppHandle) {
    let file_path = path.to_string_lossy().to_string();
    let file_name = path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let media_type = scanner::get_media_type(path);
    let file_size = std::fs::metadata(path).ok().map(|m| m.len() as i64);

    if let Ok(conn) = Connection::open(db_path) {
        conn.execute(
            "INSERT OR IGNORE INTO photos (file_path, file_name, file_size, media_type)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![file_path, file_name, file_size, media_type],
        ).ok();
    }

    emit_dir_changed(dir_of(path), app);

    let file_path2 = file_path.clone();
    let db_path2 = db_path.to_path_buf();
    let app2 = app.clone();
    std::thread::spawn(move || {
        if let Ok(exif) = crate::metadata::extract_exif(Path::new(&file_path2)) {
            if let Ok(conn) = Connection::open(&db_path2) {
                let id = xxh3_64(file_path2.as_bytes()) as i64;
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
                        file_path2,
                    ],
                ).ok();

                emit_exif_patch(id, &file_path2, &exif, &app2);
            }
        } else {
            if let Ok(conn) = Connection::open(&db_path2) {
                conn.execute(
                    "UPDATE photos SET exif_attempted=1 WHERE file_path=?1",
                    rusqlite::params![file_path2],
                ).ok();
            }
        }
    });
}

// ======================== Remove ========================

fn handle_removed_file(path: &Path, db_path: &Path, app: &AppHandle) {
    let file_path = path.to_string_lossy().to_string();

    if let Ok(conn) = Connection::open(db_path) {
        conn.execute("DELETE FROM photos WHERE file_path = ?1", rusqlite::params![file_path]).ok();
    }

    emit_dir_changed(dir_of(path), app);
}

// ======================== Modify ========================

fn handle_modified_file(path: &Path, db_path: &Path, app: &AppHandle) {
    let file_path = path.to_string_lossy().to_string();
    let db_path = db_path.to_path_buf();
    let app = app.clone();

    std::thread::spawn(move || {
        if let Ok(exif) = crate::metadata::extract_exif(Path::new(&file_path)) {
            if let Ok(conn) = Connection::open(&db_path) {
                let id = xxh3_64(file_path.as_bytes()) as i64;
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
                        file_path,
                    ],
                ).ok();

                emit_exif_patch(id, &file_path, &exif, &app);
            }
        }
    });
}

// ======================== 事件发射 ========================

fn dir_of(path: &Path) -> &Path {
    path.parent().unwrap_or(Path::new(""))
}

fn emit_dir_changed(dir: &Path, app: &AppHandle) {
    let _ = app.emit("files-changed", dir.to_string_lossy().to_string());
}

fn emit_exif_patch(id: i64, file_path: &str, exif: &crate::metadata::ExifFields, app: &AppHandle) {
    let patch = serde_json::json!([{
        "id": id, "filePath": file_path,
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
    }]);
    let _ = app.emit("exif-updated", &patch);
}
