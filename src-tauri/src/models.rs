/// 照片结构体 — 对应 SQLite photos 表
/// 同时也用于前端的类型定义（通过 Tauri 序列化）
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub file_size: Option<i64>,
    pub file_hash: Option<String>,
    pub file_date: Option<i64>,
    pub media_type: Option<String>,
    pub thumbnail_url: Option<String>,

    // EXIF
    pub date_taken: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub focal_length: Option<f64>,
    pub aperture: Option<f64>,
    pub shutter_speed: Option<String>,
    pub iso: Option<i64>,
    pub exposure_comp: Option<f64>,
    pub flash: Option<i64>,
    pub white_balance: Option<String>,
    pub metering_mode: Option<String>,
    pub image_width: Option<i64>,
    pub image_height: Option<i64>,
    pub color_space: Option<String>,

    // GPS
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,

    // 用户数据
    pub rating: i64,
    pub color_label: Option<String>,
    pub flag: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub path: String,
    pub display_name: Option<String>,
    pub photo_count: i64,
    pub last_scan: Option<String>,
    pub children: Option<Vec<Folder>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub is_smart: bool,
    pub filter_json: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSession {
    pub id: i64,
    pub source_path: Option<String>,
    pub dest_folder: Option<String>,
    pub file_count: Option<i64>,
    pub rename_rule: Option<String>,
    pub imported_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
}
