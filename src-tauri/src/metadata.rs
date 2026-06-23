use std::path::Path;
use serde::Serialize;
use nom_exif::{MediaParser, MediaSource, Exif, ExifTag};

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

    pub software: Option<String>,
    pub copyright: Option<String>,
    pub image_description: Option<String>,
    pub orientation: Option<i64>,
    pub exposure_program: Option<String>,
    pub max_aperture: Option<f64>,
    pub focal_length_35mm: Option<f64>,
    pub lens_make: Option<String>,
    pub scene_capture_type: Option<String>,
    pub contrast: Option<String>,
}

pub fn extract_exif(file_path: &Path) -> anyhow::Result<ExifFields> {
    let mut parser = MediaParser::new();
    let ms = MediaSource::open(file_path)
        .map_err(|e| anyhow::anyhow!("Failed to open {}: {}", file_path.display(), e))?;
    let iter = parser.parse_exif(ms)
        .map_err(|e| anyhow::anyhow!("EXIF parse {}: {}", file_path.display(), e))?;
    let exif: Exif = iter.into();
    fields_from_exif(&exif, file_path)
}

fn read_image_dimensions(file_path: &Path) -> (Option<i64>, Option<i64>) {
    match image::image_dimensions(file_path) {
        Ok((w, h)) => (Some(w as i64), Some(h as i64)),
        Err(_) => (None, None),
    }
}

fn fields_from_exif(exif: &Exif, file_path: &Path) -> anyhow::Result<ExifFields> {
    let (dim_w, dim_h) = read_image_dimensions(file_path);
    Ok(ExifFields {
        date_taken: get_str(exif, ExifTag::DateTimeOriginal)
            .or_else(|| get_str(exif, ExifTag::CreateDate))
            .or_else(|| get_str(exif, ExifTag::ModifyDate)),
        camera_make: get_str(exif, ExifTag::Make),
        camera_model: get_str(exif, ExifTag::Model),
        lens_model: get_str(exif, ExifTag::LensModel),
        focal_length: get_num(exif, ExifTag::FocalLength),
        aperture: get_num(exif, ExifTag::FNumber)
            .or_else(|| get_num(exif, ExifTag::ApertureValue)),
        shutter_speed: format_shutter(get_num(exif, ExifTag::ExposureTime))
            .or_else(|| format_shutter_apex(get_num(exif, ExifTag::ShutterSpeedValue))),
        iso: get_int(exif, ExifTag::ISOSpeedRatings),
        exposure_comp: get_num(exif, ExifTag::ExposureBiasValue),
        flash: get_int(exif, ExifTag::Flash),
        white_balance: map_white_balance(get_uint(exif, ExifTag::WhiteBalanceMode)),
        metering_mode: map_metering_mode(get_uint(exif, ExifTag::MeteringMode)),
        image_width: get_uint(exif, ExifTag::ExifImageWidth)
            .or_else(|| get_uint(exif, ExifTag::ImageWidth))
            .map(|v| v as i64)
            .or(dim_w),
        image_height: get_uint(exif, ExifTag::ExifImageHeight)
            .or_else(|| get_uint(exif, ExifTag::ImageHeight))
            .map(|v| v as i64)
            .or(dim_h),
        color_space: map_color_space(get_uint(exif, ExifTag::ColorSpace)),

        latitude: exif.gps_info().and_then(|g| g.latitude_decimal()),
        longitude: exif.gps_info().and_then(|g| g.longitude_decimal()),
        altitude: exif.gps_info().and_then(|g| g.altitude_meters()),

        software: get_str(exif, ExifTag::Software),
        copyright: get_str(exif, ExifTag::Copyright),
        image_description: get_str(exif, ExifTag::ImageDescription),
        orientation: get_int(exif, ExifTag::Orientation),
        exposure_program: map_exposure_program(get_uint(exif, ExifTag::ExposureProgram)),
        max_aperture: get_num(exif, ExifTag::MaxApertureValue),
        focal_length_35mm: get_num(exif, ExifTag::FocalLengthIn35mmFilm),
        lens_make: get_str(exif, ExifTag::LensMake),
        scene_capture_type: map_scene_capture_type(get_uint(exif, ExifTag::SceneCaptureType)),
        contrast: map_contrast(get_uint(exif, ExifTag::Contrast)),
    })
}

fn clean_string(s: &str) -> Option<String> {
    let mut cleaned = s.trim().to_string();
    loop {
        let prev = cleaned.clone();
        cleaned = cleaned
            .trim_start_matches('"')
            .trim_end_matches('"')
            .trim_end_matches(',')
            .trim_start_matches(',')
            .trim()
            .to_string();
        if cleaned.len() == prev.len() { break; }
    }
    if cleaned.is_empty() { None } else { Some(cleaned) }
}

fn get_str(exif: &Exif, tag: ExifTag) -> Option<String> {
    exif.get(tag)
        .and_then(|v| v.as_str())
        .and_then(|s| clean_string(s))
}

fn get_num(exif: &Exif, tag: ExifTag) -> Option<f64> {
    exif.get(tag).and_then(|v| v.try_as_float())
}

fn get_int(exif: &Exif, tag: ExifTag) -> Option<i64> {
    exif.get(tag).and_then(|v| v.try_as_integer())
}

fn get_uint(exif: &Exif, tag: ExifTag) -> Option<u32> {
    exif.get(tag).and_then(|v| v.as_u32())
}

fn format_shutter(val: Option<f64>) -> Option<String> {
    let v = val?;
    if v <= 0.0 { return None; }
    Some(if v >= 1.0 {
        format!("{:.0}s", v)
    } else {
        let den = (1.0 / v).round() as u64;
        format!("1/{}s", den)
    })
}

fn format_shutter_apex(val: Option<f64>) -> Option<String> {
    format_shutter(val.map(|v| (-v).exp2()))
}

fn map_white_balance(val: Option<u32>) -> Option<String> {
    Some(match val? {
        0 => "自动".to_string(),
        1 => "手动".to_string(),
        n => format!("未知({})", n),
    })
}

fn map_metering_mode(val: Option<u32>) -> Option<String> {
    Some(match val? {
        0 => "未知".to_string(),
        1 => "平均测光".to_string(),
        2 => "中央重点测光".to_string(),
        3 => "点测光".to_string(),
        4 => "多点测光".to_string(),
        5 => "评价测光".to_string(),
        6 => "局部测光".to_string(),
        255 => "其他".to_string(),
        n => format!("未知({})", n),
    })
}

fn map_color_space(val: Option<u32>) -> Option<String> {
    Some(match val? {
        1 => "sRGB".to_string(),
        2 => "Adobe RGB".to_string(),
        65535 => "未校准".to_string(),
        n => format!("未知({})", n),
    })
}

fn map_exposure_program(val: Option<u32>) -> Option<String> {
    Some(match val? {
        0 => "未定义".to_string(),
        1 => "手动".to_string(),
        2 => "程序自动".to_string(),
        3 => "光圈优先".to_string(),
        4 => "快门优先".to_string(),
        5 => "创意程序".to_string(),
        6 => "运动程序".to_string(),
        7 => "人像模式".to_string(),
        8 => "风景模式".to_string(),
        9 => "B门".to_string(),
        n => format!("未知({})", n),
    })
}

fn map_scene_capture_type(val: Option<u32>) -> Option<String> {
    Some(match val? {
        0 => "标准".to_string(),
        1 => "风景".to_string(),
        2 => "人像".to_string(),
        3 => "夜景".to_string(),
        n => format!("未知({})", n),
    })
}

fn map_contrast(val: Option<u32>) -> Option<String> {
    Some(match val? {
        0 => "标准".to_string(),
        1 => "柔和".to_string(),
        2 => "锐利".to_string(),
        n => format!("未知({})", n),
    })
}
