// EXIF 元数据提取模块
// 使用 kamadak-exif 纯 Rust 库，不依赖外部进程

use std::path::Path;
use serde::Serialize;

/// 核心 EXIF 字段
#[derive(Debug, Clone, Serialize)]
pub struct ExifFields {
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
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub altitude: Option<f64>,
}

/// 使用 kamadak-exif 原生解析 EXIF（纯 Rust，不启动外部进程）
pub fn extract_exif(file_path: &Path) -> anyhow::Result<ExifFields> {
    use exif::{Reader, Tag};
    use std::fs::File;
    use std::io::BufReader;

    let file = File::open(file_path)?;
    let exif_data = Reader::new()
        .read_from_container(&mut BufReader::new(file))?;

    Ok(ExifFields {
        date_taken: get_tag(&exif_data, Tag::DateTimeOriginal),
        camera_make: get_tag(&exif_data, Tag::Make),
        camera_model: get_tag(&exif_data, Tag::Model),
        lens_model: get_tag(&exif_data, Tag::LensModel),
        focal_length: get_float(&exif_data, Tag::FocalLength),
        aperture: get_float(&exif_data, Tag::FNumber),
        shutter_speed: get_tag(&exif_data, Tag::ExposureTime)
            .or_else(|| get_tag(&exif_data, Tag::ShutterSpeedValue)),
        iso: get_uint(&exif_data, Tag::PhotographicSensitivity)
            .or_else(|| get_uint(&exif_data, Tag::ISOSpeed))
            .map(|v| v as i64),
        exposure_comp: get_srational(&exif_data, Tag::ExposureBiasValue),
        flash: get_uint(&exif_data, Tag::Flash).map(|v| v as i64),
        white_balance: get_string_uint(&exif_data, Tag::WhiteBalance),
        metering_mode: get_string_uint(&exif_data, Tag::MeteringMode),
        image_width: get_uint(&exif_data, Tag::ImageWidth)
            .or_else(|| get_uint(&exif_data, Tag::PixelXDimension))
            .map(|v| v as i64),
        image_height: get_uint(&exif_data, Tag::ImageLength)
            .or_else(|| get_uint(&exif_data, Tag::PixelYDimension))
            .map(|v| v as i64),
        color_space: get_tag(&exif_data, Tag::ColorSpace),
        latitude: get_gps(&exif_data, Tag::GPSLatitudeRef, Tag::GPSLatitude),
        longitude: get_gps(&exif_data, Tag::GPSLongitudeRef, Tag::GPSLongitude),
        altitude: get_float(&exif_data, Tag::GPSAltitude),
    })
}

// ---- 辅助函数 ----

fn get_tag(exif: &exif::Exif, tag: exif::Tag) -> Option<String> {
    exif.get_field(tag, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string())
}

fn get_float(exif: &exif::Exif, tag: exif::Tag) -> Option<f64> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    match &f.value {
        exif::Value::Rational(ref v) if !v.is_empty() => Some(v[0].to_f64()),
        exif::Value::SRational(ref v) if !v.is_empty() => Some(v[0].to_f64()),
        exif::Value::Short(ref v) if !v.is_empty() => Some(v[0] as f64),
        exif::Value::Long(ref v) if !v.is_empty() => Some(v[0] as f64),
        _ => None,
    }
}

fn get_uint(exif: &exif::Exif, tag: exif::Tag) -> Option<u32> {
    exif.get_field(tag, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
}

fn get_srational(exif: &exif::Exif, tag: exif::Tag) -> Option<f64> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    match &f.value {
        exif::Value::SRational(ref v) if !v.is_empty() => Some(v[0].to_f64()),
        exif::Value::Rational(ref v) if !v.is_empty() => Some(v[0].to_f64()),
        _ => f.value.get_uint(0).map(|v| v as f64),
    }
}

fn get_string_uint(exif: &exif::Exif, tag: exif::Tag) -> Option<String> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    match &f.value {
        exif::Value::Short(ref v) if !v.is_empty() => Some(format!("{}", v[0])),
        _ => Some(f.display_value().to_string()),
    }
}

fn get_gps(exif: &exif::Exif, ref_tag: exif::Tag, coord_tag: exif::Tag) -> Option<f64> {
    use exif::Value;
    let coords = exif.get_field(coord_tag, exif::In::PRIMARY)?;
    if let Value::Rational(ref v) = coords.value {
        if v.len() >= 3 {
            let deg = v[0].to_f64();
            let min = v[1].to_f64();
            let sec = v[2].to_f64();
            let mut decimal = deg + min / 60.0 + sec / 3600.0;
            if let Some(rf) = exif.get_field(ref_tag, exif::In::PRIMARY) {
                let s = rf.display_value().to_string();
                if s.starts_with('S') || s.starts_with('W') {
                    decimal = -decimal;
                }
            }
            return Some(decimal);
        }
    }
    None
}
