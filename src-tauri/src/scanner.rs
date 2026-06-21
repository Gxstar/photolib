// 文件扫描模块 — 递归扫描目录，识别照片格式

use walkdir::WalkDir;
use std::path::Path;

/// 支持的图片扩展名
const IMAGE_EXTENSIONS: &[&str] = &[
    // RAW
    "cr3", "cr2", "nef", "nrw", "arw", "srf", "sr2", "raf",
    "orf", "dng", "rw2", "pef", "3fr", "iiq",
    // 常规
    "jpg", "jpeg", "png", "tiff", "tif", "heic", "heif",
    "webp", "avif", "bmp",
];

/// 快速扫描元数据（不解码全图）— 对标规格的 Priority 1
#[derive(Debug, Clone)]
pub struct FileMeta {
    pub path: String,
    pub name: String,
    pub size: i64,
    pub modified: i64,
    pub media_type: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// 扫描目录仅直接子文件，返回带基础元数据的 FileMeta 列表
/// 对 JPEG 文件读取头部获取尺寸（不解码像素），速度极快
pub fn scan_directory_shallow_with_meta(dir: &Path) -> Vec<FileMeta> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            if !is_photo_file(&path) {
                continue;
            }

            let name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let size = std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.len().try_into().ok())
                .unwrap_or(0i64);
            let modified = std::fs::metadata(&path)
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0);
            let media_type = get_media_type(&path).unwrap_or_default();
            let (width, height) = quick_jpeg_dims(&path);

            files.push(FileMeta {
                path: path.to_string_lossy().to_string(),
                name,
                size,
                modified,
                media_type,
                width,
                height,
            });
        }
    }
    files
}

/// 快速读取 JPEG 尺寸（只读文件头 ~2KB，不解码全图）
fn quick_jpeg_dims(path: &Path) -> (Option<u32>, Option<u32>) {
    use std::io::BufReader;
    use std::fs::File;
    
    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return (None, None),
    };
    let mut reader = BufReader::new(file);
    
    // 读取 JPEG SOI (FF D8) 然后找 SOF marker 获取尺寸
    let mut buf = [0u8; 2];
    use std::io::Read;
    if reader.read_exact(&mut buf).is_err() || buf != [0xFF, 0xD8] {
        return (None, None);
    }

    loop {
        if reader.read_exact(&mut buf).is_err() {
            return (None, None);
        }
        // 跳过填充字节
        if buf[0] != 0xFF {
            continue;
        }

        let marker = buf[1];
        // SOS (FF DA) 或 EOI (FF D9) — 没有 SOF，放弃
        if marker == 0xDA || marker == 0xD9 {
            return (None, None);
        }

        // 读取 segment 长度
        let mut len_buf = [0u8; 2];
        if reader.read_exact(&mut len_buf).is_err() {
            return (None, None);
        }
        let seg_len = ((len_buf[0] as usize) << 8) | (len_buf[1] as usize);
        if seg_len < 2 {
            return (None, None);
        }

        // SOF0 (FF C0) / SOF1 (FF C1) / SOF2 (FF C2) — baseline/progressive
        if (0xC0..=0xC2).contains(&marker) && seg_len >= 7 {
            let mut sof = [0u8; 5];
            if reader.read_exact(&mut sof).is_ok() {
                // sof[0] = precision, sof[1..3] = height (BE), sof[3..5] = width (BE)
                let h = ((sof[1] as u32) << 8) | (sof[2] as u32);
                let w = ((sof[3] as u32) << 8) | (sof[4] as u32);
                return (Some(w), Some(h));
            }
            return (None, None);
        }

        // 跳过该 segment 剩余部分
        let skip = seg_len.saturating_sub(2);
        if skip > 0 {
            // BufReader seek equivalent: read and discard
            let mut discard = vec![0u8; skip.min(65536)];
            let mut remaining = skip;
            while remaining > 0 {
                let chunk = remaining.min(discard.len());
                if reader.read_exact(&mut discard[..chunk]).is_err() {
                    return (None, None);
                }
                remaining -= chunk;
            }
        }
    }
}

/// 扫描指定目录（递归），返回所有照片文件路径
pub fn scan_directory(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();

    for entry in WalkDir::new(dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if let Some(ext) = path.extension() {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            if IMAGE_EXTENSIONS.contains(&ext_lower.as_str()) {
                files.push(path.to_string_lossy().to_string());
            }
        }
    }

    files
}

/// 扫描目录**仅直接子文件**（不递归），返回照片路径
/// 用于目录浏览器 — 类似 Windows 资源管理器，只显示当前目录的照片
pub fn scan_directory_shallow(dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            if !entry.file_type().map(|ft| ft.is_file()).unwrap_or(false) {
                continue;
            }
            let path = entry.path();
            if is_photo_file(&path) {
                files.push(path.to_string_lossy().to_string());
            }
        }
    }
    files
}

/// 检测文件是否为照片格式
pub fn is_photo_file(path: &Path) -> bool {
    path.extension()
        .map(|ext| {
            let ext_lower = ext.to_string_lossy().to_lowercase();
            IMAGE_EXTENSIONS.contains(&ext_lower.as_str())
        })
        .unwrap_or(false)
}

/// 快速统计目录**直接子文件**中的照片数（不递归）
/// 用于目录浏览器界面实时显示
pub fn count_photos_shallow(dir: &Path) -> usize {
    if let Ok(entries) = std::fs::read_dir(dir) {
        entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_type()
                    .map(|ft| ft.is_file())
                    .unwrap_or(false)
                    && is_photo_file(&e.path())
            })
            .count()
    } else {
        0
    }
}

/// 获取文件的媒体类型
pub fn get_media_type(path: &Path) -> Option<String> {
    path.extension().map(|ext| {
        let ext_lower = ext.to_string_lossy().to_lowercase();
        match ext_lower.as_str() {
            // RAW
            "cr3" | "cr2" | "nef" | "nrw" | "arw" | "srf" | "sr2"
            | "raf" | "orf" | "dng" | "rw2" | "pef" | "3fr" | "iiq" => "raw".to_string(),
            // JPEG
            "jpg" | "jpeg" => "jpeg".to_string(),
            // PNG
            "png" => "png".to_string(),
            // TIFF
            "tiff" | "tif" => "tiff".to_string(),
            // HEIC
            "heic" | "heif" => "heic".to_string(),
            // Other
            _ => ext_lower,
        }
    })
}
