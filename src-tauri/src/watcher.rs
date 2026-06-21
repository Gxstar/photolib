// 文件夹监控模块 — 实时监控指定目录，新增照片自动入库

use notify::{Event, EventKind, RecursiveMode, Watcher};
use std::path::{Path, PathBuf};
use std::sync::mpsc;

/// 启动文件夹监控，新文件通过回调通知
pub fn watch_directory<F>(dir: &Path, on_new_file: F) -> anyhow::Result<()>
where
    F: Fn(PathBuf) + Send + 'static,
{
    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            tx.send(event).ok();
        }
    })?;

    watcher.watch(dir, RecursiveMode::Recursive)?;

    // 在后台线程处理事件
    std::thread::spawn(move || {
        for event in rx {
            match event.kind {
                EventKind::Create(_) | EventKind::Modify(_) => {
                    for path in event.paths {
                        if path.is_file() {
                            if let Some(ext) = path.extension() {
                                let ext_lower = ext.to_string_lossy().to_lowercase();
                                // 检查是否为照片格式
                                let photo_exts = [
                                    "cr3", "cr2", "nef", "nrw", "arw", "raf", "orf",
                                    "dng", "rw2", "pef", "jpg", "jpeg", "png", "tiff",
                                    "tif", "heic", "heif", "webp", "avif", "bmp",
                                ];
                                if photo_exts.contains(&ext_lower.as_str()) {
                                    on_new_file(path);
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    });

    Ok(())
}
