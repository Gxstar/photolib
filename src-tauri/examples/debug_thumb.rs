// 临时调试：测试所有格式的缩略图生成
use std::path::Path;

fn main() {
    let files = [
        "D:/媒体/图片/导出/P1140537.avif",
        "D:/媒体/图片/导出/P1152214.avif",
        "D:/媒体/图片/导出/PLUM4363.rw2",
        "D:/媒体/图片/导出/20260119_DC-S9_001.heic",
    ];

    for f in &files {
        let p = Path::new(f);
        if !p.exists() {
            println!("[skip] {} not found", f);
            continue;
        }
        println!("\n========== {} ==========", f);
        println!("size: {} bytes", std::fs::metadata(p).map(|m| m.len()).unwrap_or(0));

        match photolib_lib::thumbnail::generate_thumbnail(p, photolib_lib::thumbnail::ThumbLevel::L1) {
            Ok(data) => println!("✓ OK: {} bytes JPEG (in-memory)", data.len()),
            Err(e) => println!("✗ FAIL: {}", e),
        }
    }
}
