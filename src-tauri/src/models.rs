/// 照片结构体 — 对应 SQLite photos 表
/// 同时也用于前端的类型定义（通过 Tauri 序列化）
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Photo {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_date: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub media_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_cache_path: Option<String>,

    // EXIF
    #[serde(skip_serializing_if = "Option::is_none")]
    pub date_taken: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_make: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub camera_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lens_model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focal_length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aperture: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shutter_speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iso: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exposure_comp: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub white_balance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metering_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_width: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_height: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_space: Option<String>,

    // GPS
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub longitude: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub altitude: Option<f64>,

    // 扩展 EXIF
    #[serde(skip_serializing_if = "Option::is_none")]
    pub software: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub copyright: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub orientation: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exposure_program: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_aperture: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub focal_length_35mm: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lens_make: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scene_capture_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contrast: Option<String>,

    // 用户数据
    pub rating: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub flag: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
