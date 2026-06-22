// EXIF 元数据提取模块
// 使用 kamadak-exif 纯 Rust 库，不依赖外部进程
// 支持标准 JPEG/TIFF 容器 + ISOBMFF（HEIC/HEIF/CR3/AVIF）回退

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

/// 解析照片 EXIF：先试标准容器（JPEG/TIFF），ISOBMFF 格式回退到 box 扫描 + read_raw
pub fn extract_exif(file_path: &Path) -> anyhow::Result<ExifFields> {
    use exif::Reader;
    use std::fs::File;
    use std::io::{BufReader, Read};

    let ext = file_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let is_isobmff = matches!(ext.as_str(), "heic" | "heif" | "cr3" | "avif");

    if is_isobmff {
        // ISOBMFF 路径：读文件头扫描 Exif item → read_raw
        let mut file = File::open(file_path)?;
        let mut buf = vec![0u8; 4 * 1024 * 1024];
        let n = file.read(&mut buf)?;
        buf.truncate(n);

        if let Some(exif_bytes) = scan_isobmff_for_exif(&buf) {
            let exif_data = Reader::new()
                .read_raw(exif_bytes)
                .map_err(|e| anyhow::anyhow!("ISOBMFF EXIF parse: {}", e))?;
            return fields_from_exif(&exif_data);
        }
        return Err(anyhow::anyhow!("No EXIF found in ISOBMFF container"));
    }

    // 标准容器路径：JPEG/TIFF
    let file = File::open(file_path)?;
    let exif_data = Reader::new()
        .read_from_container(&mut BufReader::new(file))
        .map_err(|e| anyhow::anyhow!("Standard EXIF parse: {}", e))?;
    fields_from_exif(&exif_data)
}

/// 从解析好的 exif::Exif 结构体构建 ExifFields
fn fields_from_exif(exif_data: &exif::Exif) -> anyhow::Result<ExifFields> {
    use exif::Tag;
    Ok(ExifFields {
        date_taken: get_tag(exif_data, Tag::DateTimeOriginal),
        camera_make: get_tag(exif_data, Tag::Make),
        camera_model: get_tag(exif_data, Tag::Model),
        lens_model: get_tag(exif_data, Tag::LensModel),
        focal_length: get_float(exif_data, Tag::FocalLength),
        aperture: get_float(exif_data, Tag::FNumber),
        shutter_speed: get_tag(exif_data, Tag::ExposureTime)
            .or_else(|| get_tag(exif_data, Tag::ShutterSpeedValue)),
        iso: get_uint(exif_data, Tag::PhotographicSensitivity)
            .or_else(|| get_uint(exif_data, Tag::ISOSpeed))
            .map(|v| v as i64),
        exposure_comp: get_srational(exif_data, Tag::ExposureBiasValue),
        flash: get_uint(exif_data, Tag::Flash).map(|v| v as i64),
        white_balance: get_white_balance(exif_data),
        metering_mode: get_metering_mode(exif_data),
        image_width: get_uint(exif_data, Tag::ImageWidth)
            .or_else(|| get_uint(exif_data, Tag::PixelXDimension))
            .map(|v| v as i64),
        image_height: get_uint(exif_data, Tag::ImageLength)
            .or_else(|| get_uint(exif_data, Tag::PixelYDimension))
            .map(|v| v as i64),
        color_space: get_color_space(exif_data),
        latitude: get_gps(exif_data, Tag::GPSLatitudeRef, Tag::GPSLatitude),
        longitude: get_gps(exif_data, Tag::GPSLongitudeRef, Tag::GPSLongitude),
        altitude: get_float(exif_data, Tag::GPSAltitude),
    })
}

// =================== ISOBMFF box scanner ===================
//
// HEIC/HEIF/CR3/AVIF 使用 ISOBMFF（MP4-like）容器，EXIF 数据作为
// "meta item"（Type='Exif'）存储在 meta box 中。
// 我们通过 iinf 找到 Exif item 的 ID，再用 iloc 定位其 offset/length。

/// 从 ISOBMFF 容器中扫描出 Exif item 的纯 TIFF 字节
fn scan_isobmff_for_exif(data: &[u8]) -> Option<Vec<u8>> {
    // 1. 找 meta box
    let meta = find_child_box(data, b"meta")?;

    // 2. 从 iinf 查 Exif item 的 ID
    let (exif_id, version) = find_exif_item_id_in_meta(meta)?;

    // 3. 从 iloc 查 Exif item 的 offset + length（相对于文件头）
    let (item_offset, item_length) = find_item_location_in_meta(meta, exif_id, version)?;
    let start = item_offset as usize;
    let end = start + item_length as usize;
    if end <= data.len() {
        Some(data[start..end].to_vec())
    } else {
        None
    }
}

/// 在 full-box 列表中找到第一个指定 type 的子 box 内容（不递归）
fn find_child_box<'a>(data: &'a [u8], box_type: &[u8; 4]) -> Option<&'a [u8]> {
    let mut offset = 0usize;
    while offset + 8 <= data.len() {
        let size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        let typ = &data[offset+4..offset+8];
        if typ == box_type {
            let start = if size == 1 && offset + 16 <= data.len() {
                // 64-bit extended size
                offset + 16
            } else {
                offset + 8
            };
            let box_end = if size == 1 && offset + 16 <= data.len() {
                let largesize = u64::from_be_bytes([
                    data[offset+8], data[offset+9], data[offset+10], data[offset+11],
                    data[offset+12], data[offset+13], data[offset+14], data[offset+15],
                ]) as usize;
                offset + largesize
            } else if size == 0 {
                data.len()
            } else {
                offset + size
            };
            let end = box_end.min(data.len());
            if start <= end { return Some(&data[start..end]); }
            return None;
        }
        if size < 8 { break; }
        offset += size;
    }
    None
}

/// 从 iinf box 中找出 item_type = 'Exif' 的 item_ID 及版本
/// 返回 (item_id, version) 用于 iloc 查询
fn find_exif_item_id_in_meta(meta: &[u8]) -> Option<(u32, u8)> {
    let iinf = find_child_box(meta, b"iinf")?;
    if iinf.len() < 4 { return None; }
    let version = iinf[0];
    let _flags = u32::from_be_bytes([0, iinf[1], iinf[2], iinf[3]]);

    // entry_count: v0 = u16, v1+ = u32
    let count = if version == 0 {
        if iinf.len() < 6 { return None; }
        u16::from_be_bytes([iinf[4], iinf[5]]) as u32
    } else {
        if iinf.len() < 8 { return None; }
        u32::from_be_bytes([iinf[4], iinf[5], iinf[6], iinf[7]])
    };

    // HEIC/HEIF/CR3/AVIF 都使用 iinf v1+，v0 格式不同且没有 item_type
    // 直接不支持 v0
    if version == 0 { return None; }

    let mut pos = 8usize;
    for _ in 0..count {
        // v1+: item_ID(u16/u32), item_protection_index(u16), item_type(4 bytes), ...
        let id = if version >= 2 {
            if pos + 4 > iinf.len() { return None; }
            let v = u32::from_be_bytes([iinf[pos], iinf[pos+1], iinf[pos+2], iinf[pos+3]]);
            pos += 4;
            v
        } else {
            if pos + 2 > iinf.len() { return None; }
            let v = u16::from_be_bytes([iinf[pos], iinf[pos+1]]) as u32;
            pos += 2;
            v
        };
        if pos + 2 + 4 > iinf.len() { return None; }
        pos += 2; // item_protection_index
        if pos + 4 > iinf.len() { return None; }
        let item_type = &iinf[pos..pos+4];
        pos += 4;
        // item_name (variable, null-terminated)
        let name_len = match iinf[pos..].iter().position(|&b| b == 0) {
            Some(l) => l + 1,
            None => iinf.len() - pos,
        };
        pos += name_len;
        if item_type == b"Exif" {
            return Some((id, version));
        }
    }
    None
}

/// 从 iloc box 中根据 item ID 找出 offset 和 length
fn find_item_location_in_meta(meta: &[u8], target_id: u32, _iinf_version: u8) -> Option<(u64, u64)> {
    let iloc = find_child_box(meta, b"iloc")?;
    if iloc.len() < 4 { return None; }
    let version = iloc[0];
    let _flags = u32::from_be_bytes([0, iloc[1], iloc[2], iloc[3]]);

    // Bit fields in iloc[4]:
    // offset_size (4 bits), length_size (4 bits), base_offset_size (4 bits), index_size (4 bits)
    if iloc.len() < 5 { return None; }
    let offset_size = ((iloc[4] >> 4) & 0x0F) as usize;
    let length_size = (iloc[4] & 0x0F) as usize;
    let (base_offset_size, _index_size) = if version >= 1 && iloc.len() > 5 {
        (((iloc[5] >> 4) & 0x0F) as usize, (iloc[5] & 0x0F) as usize)
    } else {
        (0usize, 0usize)
    };

    let header_size = if version >= 1 { 6usize } else { 5usize };
    let item_count_size = if version < 2 { 2usize } else if version == 2 { 2usize } else { 4usize };
    if iloc.len() < header_size + item_count_size { return None; }

    let count = if version < 2 {
        u16::from_be_bytes([iloc[header_size], iloc[header_size+1]]) as u32
    } else {
        u32::from_be_bytes([iloc[header_size], iloc[header_size+1], iloc[header_size+2], iloc[header_size+3]])
    };

    let mut pos = header_size + item_count_size;
    for _ in 0..count {
        // item_ID (u16 for v0/v1/v2, u32 for v3+)
        let id = if version < 3 {
            if pos + 2 > iloc.len() { return None; }
            let id = u16::from_be_bytes([iloc[pos], iloc[pos+1]]) as u32;
            pos += 2;
            id
        } else {
            if pos + 4 > iloc.len() { return None; }
            let id = u32::from_be_bytes([iloc[pos], iloc[pos+1], iloc[pos+2], iloc[pos+3]]);
            pos += 4;
            id
        };

        // construction method + data_reference_index (v1+)
        if version >= 1 {
            if pos + 2 > iloc.len() { return None; }
            // construction_method = (iloc[pos..pos+2] >> 12) & 0xF
            pos += 2;
        } else {
            // v0: base_offset
            if pos + offset_size > iloc.len() { return None; }
            pos += offset_size;
        }

        // extent_count
        if pos + 2 > iloc.len() { return None; }
        let extent_count = u16::from_be_bytes([iloc[pos], iloc[pos+1]]);
        pos += 2;

        // For v0, the base_offset is stored once before extents
        let base_offset = if version == 0 {
            0 // v0 stores offset differently
        } else if version >= 1 && base_offset_size > 0 {
            if pos + base_offset_size > iloc.len() { return None; }
            let off = read_u_x(iloc, pos, base_offset_size);
            pos += base_offset_size;
            off
        } else {
            0
        };

        // Skip: data_reference_index (v0)
        // Actually for v0, the layout is: construction_method is implicit (0)

        if id == target_id {
            // Read first extent's offset + length
            if extent_count == 0 { return None; }
            let extent_offset = if version == 0 {
                // v0: offset per extent, not base_offset
                if pos + offset_size > iloc.len() { return None; }
                read_u_x(iloc, pos, offset_size)
            } else {
                if pos + offset_size > iloc.len() { return None; }
                let off = read_u_x(iloc, pos, offset_size);
                base_offset.wrapping_add(off)
            };
            pos += offset_size;
            let extent_length = if length_size > 0 {
                if pos + length_size > iloc.len() { return None; }
                let l = read_u_x(iloc, pos, length_size);
                l
            } else {
                0
            };
            return Some((extent_offset, extent_length));
        }

        // Skip extents for non-target items
        for _ in 0..extent_count {
            if pos + offset_size + length_size > iloc.len() { return None; }
            pos += offset_size + length_size;
        }
    }
    None
}

fn read_u_x(data: &[u8], offset: usize, n: usize) -> u64 {
    if n == 0 || offset + n > data.len() { return 0; }
    let mut val: u64 = 0;
    for i in 0..n {
        val = (val << 8) | data[offset + i] as u64;
    }
    val
}

// ---- 辅助函数 ----

/// 通用 EXIF 字符串清洗：去引号、去空白、去头尾逗号（循环至稳定）
fn clean_exif_string(s: &str) -> Option<String> {
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

/// 获取字符串标签，自动清洗（去引号、去空白）
fn get_tag(exif: &exif::Exif, tag: exif::Tag) -> Option<String> {
    let f = exif.get_field(tag, exif::In::PRIMARY)?;
    let raw = f.display_value().to_string();
    clean_exif_string(&raw)
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

/// 白平衡 → 可读文字
///
/// EXIF 标准：
///   0 = Auto, 1 = Manual
fn get_white_balance(exif: &exif::Exif) -> Option<String> {
    let val = get_uint(exif, exif::Tag::WhiteBalance)?;
    Some(match val {
        0 => "自动".to_string(),
        1 => "手动".to_string(),
        _ => format!("未知({})", val),
    })
}

/// 测光模式 → 可读文字
///
/// EXIF 标准：
///   0 = Unknown, 1 = Average, 2 = CenterWeightedAverage,
///   3 = Spot, 4 = MultiSpot, 5 = Pattern, 6 = Partial, 255 = Other
fn get_metering_mode(exif: &exif::Exif) -> Option<String> {
    let val = get_uint(exif, exif::Tag::MeteringMode)?;
    Some(match val {
        0 => "未知".to_string(),
        1 => "平均测光".to_string(),
        2 => "中央重点测光".to_string(),
        3 => "点测光".to_string(),
        4 => "多点测光".to_string(),
        5 => "评价测光".to_string(),
        6 => "局部测光".to_string(),
        255 => "其他".to_string(),
        _ => format!("未知({})", val),
    })
}

/// 色彩空间 → 可读文字
///
/// EXIF 标准：
///   1 = sRGB, 2 = Adobe RGB, 65535 = Uncalibrated
fn get_color_space(exif: &exif::Exif) -> Option<String> {
    let val = get_uint(exif, exif::Tag::ColorSpace)?;
    Some(match val {
        1 => "sRGB".to_string(),
        2 => "Adobe RGB".to_string(),
        65535 => "未校准".to_string(),
        _ => format!("未知({})", val),
    })
}

fn get_gps(
    exif: &exif::Exif,
    ref_tag: exif::Tag,
    coord_tag: exif::Tag,
) -> Option<f64> {
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
                if s.trim().trim_matches('"').starts_with('S')
                    || s.trim().trim_matches('"').starts_with('W')
                {
                    decimal = -decimal;
                }
            }
            return Some(decimal);
        }
    }
    None
}