// 导出模块 — 支持格式转换、尺寸调整、水印等

use std::path::Path;

/// 导出配置
pub struct ExportConfig {
    pub format: ExportFormat,
    pub quality: u8,          // 1-100
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub color_space: Option<String>,
    pub watermark_text: Option<String>,
}

pub enum ExportFormat {
    JPEG,
    PNG,
    TIFF,
    Original,
}

/// 导出单张照片
pub fn export_photo(
    source: &Path,
    dest: &Path,
    config: &ExportConfig,
) -> anyhow::Result<()> {
    let img = image::open(source)?;

    // 调整尺寸
    let processed = if let (Some(w), Some(h)) = (config.max_width, config.max_height) {
        if img.width() > w || img.height() > h {
            img.resize(w, h, image::imageops::FilterType::Lanczos3)
        } else {
            img
        }
    } else {
        img
    };

    // TODO: 水印叠加

    // 保存
    match config.format {
        ExportFormat::JPEG => {
            let mut buffer = Vec::new();
            let mut cursor = std::io::Cursor::new(&mut buffer);
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
                &mut cursor,
                config.quality,
            );
            encoder.encode(
                processed.as_bytes(),
                processed.width(),
                processed.height(),
                processed.color().into(),
            )?;
            std::fs::write(dest, &buffer)?;
        }
        ExportFormat::PNG => {
            processed.save(dest)?;
        }
        ExportFormat::TIFF => {
            processed.save(dest)?;
        }
        ExportFormat::Original => {
            std::fs::copy(source, dest)?;
        }
    }

    Ok(())
}
