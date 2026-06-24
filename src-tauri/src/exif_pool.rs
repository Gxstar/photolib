// EXIF 提取池 — 优先级队列 + 单飞去重 + 5s 超时 + 4 worker
//
// 设计目标：
//   - 视口优先：visible 的图优先提取
//   - 单飞去重：同一文件并发请求只处理一次
//   - 5s 超时：RAW/损坏文件不会卡住队列
//   - JPG 优先：快格式先做（用户立即看到）
//   - 4 worker：IO 受限场景的最佳并发数
//
// 单例（OnceLock）：全 app 共享一个池
// 事件总线（OnceLock AppHandle）：worker 完成时 emit "exif-updated"

use crate::metadata::{extract_exif, ExifFields};
use rusqlite::Connection;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const NUM_WORKERS: usize = 4;
const EXIF_TIMEOUT_SECS: u64 = 5;

// 简单的单飞值：可被多个 waiter 等待的 cell
struct SharedCell<T> {
    value: Mutex<Option<T>>,
    cvar: Condvar,
}

impl<T: Clone> SharedCell<T> {
    fn new() -> Self {
        Self {
            value: Mutex::new(None),
            cvar: Condvar::new(),
        }
    }

    fn set(&self, val: T) {
        *self.value.lock().unwrap() = Some(val);
        self.cvar.notify_all();
    }

    fn get(&self) -> Option<T> {
        self.value.lock().unwrap().clone()
    }

    fn wait(&self) -> T {
        let mut guard = self.value.lock().unwrap();
        while guard.is_none() {
            guard = self.cvar.wait(guard).unwrap();
        }
        guard.clone().unwrap()
    }
}

// 全局池
pub struct ExifPool {
    // 普通队列（后台）— 后进后出
    bg_queue: Arc<Mutex<VecDeque<String>>>,
    // 优先队列（视口）— 取出时优先
    priority_queue: Arc<Mutex<VecDeque<String>>>,
    // in-flight 跟踪：path -> result cell
    in_flight: Arc<Mutex<HashMap<String, Arc<SharedCell<ExifFields>>>>>,
    // path -> id
    path_to_id: Arc<Mutex<HashMap<String, i64>>>,
    // 优先请求的 session id（用于"新请求覆盖旧请求"）
    session: Arc<Mutex<u64>>,
    // session -> pending paths（用于知道本次优先请求是否完成）
    pending_sessions: Arc<Mutex<HashMap<u64, std::collections::HashSet<String>>>>,
}

impl ExifPool {
    fn new() -> Self {
        let bg_queue = Arc::new(Mutex::new(VecDeque::new()));
        let priority_queue = Arc::new(Mutex::new(VecDeque::new()));
        let in_flight: Arc<Mutex<HashMap<String, Arc<SharedCell<ExifFields>>>>> =
            Arc::new(Mutex::new(HashMap::new()));
        let path_to_id = Arc::new(Mutex::new(HashMap::new()));
        let session = Arc::new(Mutex::new(0u64));
        let pending_sessions = Arc::new(Mutex::new(HashMap::new()));

        // 启动 worker 线程
        for _worker_id in 0..NUM_WORKERS {
            let bg = bg_queue.clone();
            let prio = priority_queue.clone();
            let inflight = in_flight.clone();
            let path_id = path_to_id.clone();
            let pending = pending_sessions.clone();
            thread::spawn(move || {
                worker_loop(bg, prio, inflight, path_id, pending);
            });
        }

        Self {
            bg_queue,
            priority_queue,
            in_flight,
            path_to_id,
            session,
            pending_sessions,
        }
    }

    // 注册路径到 id
    pub fn register_paths(&self, paths: &[(String, i64)]) {
        let mut map = self.path_to_id.lock().unwrap();
        for (p, id) in paths {
            map.insert(p.clone(), *id);
        }
    }

    // 后台排程
    pub fn enqueue_background(&self, paths: Vec<String>) {
        let mut q = self.bg_queue.lock().unwrap();
        let inflight = self.in_flight.lock().unwrap();
        for p in paths {
            if !inflight.contains_key(&p) && !q.contains(&p) {
                q.push_back(p);
            }
        }
    }

    // 视口优先：把这些路径放到队首，返回 session id
    pub fn prioritize(&self, paths: Vec<String>) -> u64 {
        let mut session = self.session.lock().unwrap();
        *session += 1;
        let new_session = *session;
        drop(session);

        // 记录本次 session 的 pending paths
        let mut pending = self.pending_sessions.lock().unwrap();
        pending.insert(new_session, paths.iter().cloned().collect());
        drop(pending);

        // 把这些路径放到优先队列前面
        let mut q = self.priority_queue.lock().unwrap();
        let inflight = self.in_flight.lock().unwrap();
        for p in paths {
            if !inflight.contains_key(&p) && !q.contains(&p) {
                q.push_front(p);
            }
        }

        new_session
    }

    // 检查 session 是否完成（所有 pending paths 都有结果了）
    pub fn is_session_done(&self, session: u64) -> bool {
        let pending = self.pending_sessions.lock().unwrap();
        pending.get(&session).map(|s| s.is_empty()).unwrap_or(true)
    }

    // 等待 session 完成（带超时）
    pub fn wait_session(&self, session: u64, timeout: Duration) -> bool {
        let start = std::time::Instant::now();
        while std::time::Instant::now() - start < timeout {
            if self.is_session_done(session) {
                return true;
            }
            thread::sleep(Duration::from_millis(30));
        }
        false
    }

    // 单飞：等待 in-flight 结果
    pub fn wait_in_flight(&self, file_path: &str) -> Option<ExifFields> {
        let map = self.in_flight.lock().unwrap();
        map.get(file_path).map(|c| c.wait())
    }

    // 单飞：尝试获取（非阻塞）
    pub fn try_get_in_flight(&self, file_path: &str) -> Option<ExifFields> {
        let map = self.in_flight.lock().unwrap();
        map.get(file_path).and_then(|c| c.get())
    }

    // 获取 session 内的已完成结果（用于同步返回）
    pub fn take_session_results(&self, session: u64) -> Vec<(String, i64, ExifFields)> {
        let pending = self.pending_sessions.lock().unwrap();
        let Some(paths) = pending.get(&session) else {
            return Vec::new();
        };
        let mut results = Vec::new();
        for p in paths {
            if let Some(exif) = self.try_get_in_flight(p) {
                let id = self.path_to_id.lock().unwrap().get(p).copied().unwrap_or(0);
                if id != 0 {
                    results.push((p.clone(), id, exif));
                }
            }
        }
        results
    }

    // 清理 session
    pub fn clear_session(&self, session: u64) {
        self.pending_sessions.lock().unwrap().remove(&session);
    }
}

// 全局单例
static POOL: OnceLock<ExifPool> = OnceLock::new();

pub fn pool() -> &'static ExifPool {
    POOL.get_or_init(ExifPool::new)
}

// ==================== Worker 主循环 ====================

fn worker_loop(
    bg_queue: Arc<Mutex<VecDeque<String>>>,
    priority_queue: Arc<Mutex<VecDeque<String>>>,
    in_flight: Arc<Mutex<HashMap<String, Arc<SharedCell<ExifFields>>>>>,
    path_to_id: Arc<Mutex<HashMap<String, i64>>>,
    pending_sessions: Arc<Mutex<HashMap<u64, std::collections::HashSet<String>>>>,
) {
    loop {
        // 拉取一个任务：优先队列 > 后台队列
        let job = {
            let mut prio = priority_queue.lock().unwrap();
            if let Some(p) = prio.pop_front() {
                Some(p)
            } else {
                drop(prio);
                let mut bg = bg_queue.lock().unwrap();
                bg.pop_front()
            }
        };

        let Some(file_path) = job else {
            // 队列都空，短暂休眠
            thread::sleep(Duration::from_millis(50));
            continue;
        };

        // 单飞去重
        let cell = {
            let mut map = in_flight.lock().unwrap();
            if let Some(existing) = map.get(&file_path) {
                existing.clone()
            } else {
                let cell = Arc::new(SharedCell::new());
                map.insert(file_path.clone(), cell.clone());
                cell
            }
        };

        // 已经有结果？跳过
        if cell.get().is_some() {
            finalize_in_flight(&file_path, &in_flight, &pending_sessions);
            continue;
        }

        // 提取（带超时）
        let result = extract_exif_with_timeout(PathBuf::from(&file_path));

        match result {
            Ok(exif) => {
                cell.set(exif.clone());

                // 写 DB（异步、不阻塞 worker 主循环）
                let fp = file_path.clone();
                let exif_clone = exif.clone();
                let _ = thread::Builder::new().stack_size(512 * 1024).spawn(move || {
                    write_exif_to_db(&fp, &exif_clone);
                });

                // 发 exif-updated 事件
                let id = {
                    let map = path_to_id.lock().unwrap();
                    map.get(&file_path).copied().unwrap_or(0)
                };
                if id != 0 {
                    let patch = build_exif_patch(id, &file_path, &exif);
                    if let Some(app) = get_event_app() {
                        let _ = app.emit("exif-updated", vec![patch]);
                    }
                }
            }
            Err(e) => {
                eprintln!("[ExifPool] FAIL {}: {:#}", file_path, e);
                cell.set(ExifFields::default()); // 标记完成（空对象）
                let fp = file_path.clone();
                let _ = thread::Builder::new().stack_size(512 * 1024).spawn(move || {
                    mark_attempted(&fp);
                });
            }
        }

        finalize_in_flight(&file_path, &in_flight, &pending_sessions);
    }
}

fn finalize_in_flight(
    file_path: &str,
    in_flight: &Arc<Mutex<HashMap<String, Arc<SharedCell<ExifFields>>>>>,
    pending_sessions: &Arc<Mutex<HashMap<u64, std::collections::HashSet<String>>>>,
) {
    // 从所有 session 的 pending 中移除这个 path
    let mut sessions = pending_sessions.lock().unwrap();
    for (_, paths) in sessions.iter_mut() {
        paths.remove(file_path);
    }
    drop(sessions);

    // 清理 in_flight
    let mut map = in_flight.lock().unwrap();
    map.remove(file_path);
}

// ==================== 超时包装 ====================

fn extract_exif_with_timeout(path: PathBuf) -> anyhow::Result<ExifFields> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let result = extract_exif(&path);
        let _ = tx.send(result);
    });
    rx.recv_timeout(Duration::from_secs(EXIF_TIMEOUT_SECS))
        .map_err(|_| anyhow::anyhow!("EXIF extraction timeout after {}s", EXIF_TIMEOUT_SECS))?
}

// ==================== 事件 AppHandle ====================

static EVENT_APP: OnceLock<AppHandle> = OnceLock::new();

pub fn set_event_app(app: AppHandle) {
    let _ = EVENT_APP.set(app);
}

pub fn get_event_app() -> Option<AppHandle> {
    EVENT_APP.get().cloned()
}

// ==================== 辅助函数 ====================

fn build_exif_patch(id: i64, file_path: &str, exif: &ExifFields) -> serde_json::Value {
    serde_json::json!({
        "id": id,
        "filePath": file_path,
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
    })
}

fn write_exif_to_db(file_path: &str, exif: &ExifFields) {
    let path = crate::db::get_db_path();
    let Ok(conn) = Connection::open(path) else { return; };
    let _ = conn.execute_batch("PRAGMA journal_mode=WAL;");
    let _ = conn.execute(
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
            file_path,
        ],
    );
}

fn mark_attempted(file_path: &str) {
    let path = crate::db::get_db_path();
    let Ok(conn) = Connection::open(path) else { return; };
    let _ = conn.execute(
        "UPDATE photos SET exif_attempted=1 WHERE file_path=?1",
        rusqlite::params![file_path],
    );
}

// JPG 优先排序
pub fn sort_jpg_first(paths: &mut Vec<String>) {
    paths.sort_by(|a, b| {
        let ext_a = std::path::Path::new(a)
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase();
        let ext_b = std::path::Path::new(b)
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_lowercase();
        let fast_a = matches!(
            ext_a.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif"
        );
        let fast_b = matches!(
            ext_b.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "bmp" | "gif"
        );
        match (fast_a, fast_b) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => ext_a.cmp(&ext_b),
        }
    });
}
