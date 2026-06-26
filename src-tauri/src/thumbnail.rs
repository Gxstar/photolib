// 缩略图模块 — 高性能缩略图生成
//
// 优化策略（对标 Windows 资源管理器 / XnView MP）：
//   1. 快路径：JPEG APP1 EXIF 内嵌缩略图（~5ms）
//   2. RAW 路径：rawler::analyze::extract_thumbnail_pixels（跨格式统一）
//   3. JPEG 扫描路径：ISOBMFF 文件中扫 SOI→EOI（HEIC/HEIF 内嵌 JPEG 预览）
//   4. WIC 路径：Windows Imaging Component 系统 API（AVIF/HEIC，仅 Windows）
//   5. 缓存：磁盘缓存 v7

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;
use image::DynamicImage;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

pub enum ThumbLevel { L1, L2 }

pub fn generate_thumbnail(source: &Path, level: ThumbLevel) -> anyhow::Result<Vec<u8>> {
    let (tl, q) = match level { ThumbLevel::L1 => (480u32, 70u8), ThumbLevel::L2 => (1920u32, 85u8) };

    // 1. Windows Shell thumbnail cache (IShellItemImageFactory) — fast warm-cache path for slow formats.
    //    Gated on the slow-format extension list so JPG/PNG/webp don't pay the COM cost.
    #[cfg(target_os = "windows")]
    {
        let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if matches!(ext.as_str(), "cr3" | "cr2" | "nef" | "nrw" | "arw" | "srf" | "sr2"
                          | "raf" | "orf" | "dng" | "rw2" | "pef" | "3fr" | "iiq"
                          | "heic" | "heif" | "avif") {
            if let Some(bytes) = crate::win_thumbcache::try_shell_thumbnail(source, tl) {
                return Ok(bytes);
            }
        }
    }

    // 2. RAW files → rawler directly, skip 2MB head read
    if is_raw_extension(source) {
        return try_rawler_thumbnail(source, tl, q);
    }

    // 3. Non-RAW paths: read head once, try JPEG EXIF then ISOBMFF
    if let Ok(head) = read_file_head(source) {
        if let Some(j) = extract_exif_thumbnail_jpeg(&head) {
            if let Ok(d) = decode_resize_encode(j, tl, q) { return Ok(d); }
        }
        if head.len() >= 12 && &head[4..8] == b"ftyp" {
            if let Some(j) = scan_jpeg_in_file(&head, 0, 512*1024) {
                return decode_resize_encode(j, tl, q);
            }
        }
    }

    if let Ok(d) = try_wic_api_thumbnail(source, tl, q) { return Ok(d); }

    Err(anyhow::anyhow!("unsupported: {:?}", source))
}

fn is_raw_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(ext.to_lowercase().as_str(),
                "cr3" | "cr2" | "nef" | "nrw" | "arw" | "srf" | "sr2"
                | "raf" | "orf" | "dng" | "rw2" | "pef" | "3fr" | "iiq"
            )
        })
        .unwrap_or(false)
}

// ===================== 1/4 JPEG EXIF =====================

fn extract_exif_thumbnail_jpeg(d: &[u8]) -> Option<&[u8]> {
    if d.len() < 4 || d[0] != 0xFF || d[1] != 0xD8 { return None; }
    let mut p = 2;
    while p + 4 <= d.len() {
        if d[p] != 0xFF { return None; } let m = d[p+1];
        if m == 0xDA { break; }
        let sl = ((d[p+2] as usize) << 8) | (d[p+3] as usize);
        if sl < 2 || p + 2 + sl > d.len() { break; }
        if m == 0xE1 { let seg = &d[p+4..p+2+sl];
            if seg.len() >= 6 && &seg[0..6] == b"Exif\x00\x00" { if let Some(t) = parse_tiff_thumbnail(&seg[6..]) { return Some(t); } }
        }
        p += 2 + sl;
    } None
}

// ===================== 2/4 RAW — rawler =====================

fn try_rawler_thumbnail(source: &Path, tl: u32, q: u8) -> anyhow::Result<Vec<u8>> {
    let params = rawler::decoders::RawDecodeParams::default();
    let img = rawler::analyze::extract_thumbnail_pixels(source, &params)?;
    let le = img.width().max(img.height());
    if le < tl / 4 {
        return Err(anyhow::anyhow!("thumbnail too small ({}px)", le));
    }
    let f = if le > tl || le < tl / 2 {
        img.resize(tl, u32::MAX, FilterType::Triangle)
    } else {
        img
    };
    let mut buf = Vec::new();
    let mut cur = Cursor::new(&mut buf);
    let mut enc = JpegEncoder::new_with_quality(&mut cur, q);
    enc.encode(f.as_bytes(), f.width(), f.height(), f.color().into())?;
    Ok(buf)
}

// ===================== 3/4 ISOBMFF JPEG scan (HEIC/HEIF) =====================

fn scan_jpeg_in_file(d: &[u8], start: usize, max: usize) -> Option<&[u8]> {
    let end = (start + max).min(d.len());
    let mut i = start;
    while i + 4 < end {
        if d[i]==0xFF && d[i+1]==0xD8 && d[i+2]==0xFF {
            let m3 = d[i+3];
            if m3==0xE0 || m3==0xE1 || m3==0xDB || (m3>=0xC0 && m3<=0xCF) {
                if let Some(sz) = parse_jpeg_chain(&d[i..(i+512*1024).min(d.len())]) {
                    if sz>500 && sz<512*1024 { return Some(&d[i..i+sz]); }
                }
            }
        } i += 1;
    } None
}

fn parse_jpeg_chain(d: &[u8]) -> Option<usize> {
    if d.len()<4 || d[0]!=0xFF || d[1]!=0xD8 { return None; }
    let mut p = 2usize;
    while p+1 < d.len() {
        if d[p]!=0xFF { p+=1; continue; }
        let mut m = d[p+1];
        while m==0xFF && p+1<d.len() { p+=1; m=d[p+1]; }
        match m {
            0xD8 => p+=2, 0xD9 => return Some(p+2), 0xD0..=0xD7 => p+=2,
            0xDA => { if p+4>d.len() { return None; }
                let sl = u16::from_be_bytes([d[p+2],d[p+3]]) as usize;
                if sl<2 || p+2+sl>d.len() { return None; }
                p+=2+sl; while p+1<d.len() && !(d[p]==0xFF && d[p+1]!=0x00 && d[p+1]!=0xFF) { p+=1; } }
            _ => { if p+4>d.len() { return None; }
                let sl = u16::from_be_bytes([d[p+2],d[p+3]]) as usize;
                if sl<2 || p+2+sl>d.len() { return None; } p+=2+sl; }
        }
    } None
}

// ===================== 4/4 WIC (Windows only) =====================

#[cfg(target_os = "windows")]
fn try_wic_api_thumbnail(source: &Path, tl: u32, q: u8) -> anyhow::Result<Vec<u8>> {
    use windows::core::*;
    use windows::Win32::Foundation::GENERIC_ACCESS_RIGHTS;
    use windows::Win32::Graphics::Imaging::*;
    use windows::Win32::System::Com::*;
    use std::os::windows::ffi::OsStrExt;

    unsafe { let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED); }
    let factory: IWICImagingFactory = unsafe { CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER) }
        .map_err(|e| anyhow::anyhow!("WIC factory: {}", e))?;
    let path_wide: Vec<u16> = source.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
    let decoder: IWICBitmapDecoder = unsafe { factory.CreateDecoderFromFilename(PCWSTR::from_raw(path_wide.as_ptr()), None,
        GENERIC_ACCESS_RIGHTS(0x80000000u32), WICDecodeMetadataCacheOnDemand) }
        .map_err(|e| anyhow::anyhow!("WIC decoder: {}", e))?;
    let frame: IWICBitmapFrameDecode = unsafe { decoder.GetFrame(0) }
        .map_err(|e| anyhow::anyhow!("WIC frame: {}", e))?;
    let (mut w, mut h) = (0u32, 0u32);
    unsafe { frame.GetSize(&mut w, &mut h) }.map_err(|e| anyhow::anyhow!("WIC size: {}", e))?;

    let scale_ratio = tl as f64 / w.max(h) as f64;
    let (out_w, out_h) = if scale_ratio < 1.0 {
        ((w as f64 * scale_ratio) as u32, (h as f64 * scale_ratio) as u32)
    } else {
        (w, h)
    };
    let out_w = out_w.max(1);
    let out_h = out_h.max(1);

    let scaler: IWICBitmapScaler = unsafe { factory.CreateBitmapScaler() }
        .map_err(|e| anyhow::anyhow!("WIC scaler: {}", e))?;
    unsafe { scaler.Initialize(&frame, out_w, out_h, WICBitmapInterpolationModeFant) }
        .map_err(|e| anyhow::anyhow!("WIC scale init: {}", e))?;

    let converter: IWICFormatConverter = unsafe { factory.CreateFormatConverter() }
        .map_err(|e| anyhow::anyhow!("WIC converter: {}", e))?;
    unsafe { converter.Initialize(&scaler, &GUID_WICPixelFormat32bppBGRA,
        WICBitmapDitherTypeNone, None, 0.0, WICBitmapPaletteTypeCustom) }
        .map_err(|e| anyhow::anyhow!("WIC convert: {}", e))?;

    let stride = out_w * 4;
    let mut pixels = vec![0u8; (stride * out_h) as usize];
    unsafe { converter.CopyPixels(std::ptr::null(), stride, &mut pixels) }
        .map_err(|e| anyhow::anyhow!("WIC pixels: {}", e))?;
    for ch in pixels.chunks_exact_mut(4) { ch.swap(0, 2); }
    let rgba = image::RgbaImage::from_raw(out_w, out_h, pixels)
        .ok_or_else(|| anyhow::anyhow!("WIC bad dim {}x{}", out_w, out_h))?;
    let img = DynamicImage::ImageRgba8(rgba);
    let scaled_rgb = img.to_rgb8();
    let mut buf = Vec::new();
    let mut cur = Cursor::new(&mut buf);
    let mut enc = JpegEncoder::new_with_quality(&mut cur, q);
    enc.encode(&scaled_rgb, scaled_rgb.width(), scaled_rgb.height(), image::ExtendedColorType::Rgb8)?;
    Ok(buf)
}

#[cfg(not(target_os = "windows"))]
fn try_wic_api_thumbnail(_: &Path, _: u32, _: u8) -> anyhow::Result<Vec<u8>> {
    Err(anyhow::anyhow!("WIC not available"))
}

// ===================== Utilities =====================

const RAW_HEAD_READ_LIMIT: usize = 2 * 1024 * 1024; // 2MB

fn read_file_head(source: &Path) -> anyhow::Result<Vec<u8>> {
    use std::io::Read;
    let mut file = fs::File::open(source)?;
    let mut buf = vec![0u8; RAW_HEAD_READ_LIMIT];
    let n = file.read(&mut buf)?;
    buf.truncate(n);
    Ok(buf)
}

fn decode_resize_encode(j: &[u8], tl: u32, q: u8) -> anyhow::Result<Vec<u8>> {
    if j.is_empty() { return Err(anyhow::anyhow!("empty")); }
    let img = image::load_from_memory(j)?;
    let le = img.width().max(img.height());
    if le < tl/4 { return Err(anyhow::anyhow!("too small ({}px)", le)); }
    let f = if le>tl || le<tl/2 { img.resize(tl, u32::MAX, FilterType::Triangle) } else { img };
    let mut buf = Vec::new();
    let mut cur = Cursor::new(&mut buf);
    let mut enc = JpegEncoder::new_with_quality(&mut cur, q);
    enc.encode(f.as_bytes(), f.width(), f.height(), f.color().into())?;
    Ok(buf)
}

fn parse_tiff_thumbnail(td: &[u8]) -> Option<&[u8]> {
    if td.len()<8 { return None; }
    let le = match &td[0..2] { b"II"=>true, b"MM"=>false, _=>return None };
    let i0 = read_u32(td,4,le) as usize;
    if i0==0 || i0+2>td.len() { return None; }
    let i1 = { let n=read_u16(td,i0,le) as usize; let nx=i0+2+n*12; if nx+4>td.len(){0}else{read_u32(td,nx,le) as usize} };
    if i1==0 || i1+2>td.len() { return None; }
    let n = read_u16(td,i1,le) as usize;
    let (mut off, mut len) = (None::<u32>, None::<u32>);
    for i in 0..n { let b=i1+2+i*12; if b+12>td.len() { break; }
        let t=read_u16(td,b,le); let c=read_u32(td,b+4,le); let v=read_u32(td,b+8,le);
        if t==0x0201 && c>0 { off=Some(v); } if t==0x0202 && c>0 { len=Some(v); }
    }
    match (off,len) { (Some(o),Some(l)) if l>0 => {
        let s=o as usize; if s+l as usize<=td.len() { Some(&td[s..s+l as usize]) } else { None }
    } _=>None }
}
#[inline] fn read_u16(d:&[u8],o:usize,le:bool)->u16 { if le { u16::from_le_bytes([d[o],d[o+1]]) } else { u16::from_be_bytes([d[o],d[o+1]]) } }
#[inline] fn read_u32(d:&[u8],o:usize,le:bool)->u32 { if le { u32::from_le_bytes([d[o],d[o+1],d[o+2],d[o+3]]) } else { u32::from_be_bytes([d[o],d[o+1],d[o+2],d[o+3]]) } }

// ===================== Cache =====================

pub fn get_cache_path(file_path: &str) -> PathBuf {
    let dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from(".")).join("photolib").join("thumbs");
    fs::create_dir_all(&dir).ok();
    dir.join(format!("v7_{:016x}.jpg", xxhash_rust::xxh3::xxh3_64(file_path.as_bytes())))
}
pub fn get_cache_path_l2(file_path: &str) -> PathBuf {
    let dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from(".")).join("photolib").join("thumbs");
    fs::create_dir_all(&dir).ok();
    dir.join(format!("v7_{:016x}_l2.jpg", xxhash_rust::xxh3::xxh3_64(file_path.as_bytes())))
}
pub fn get_thumbnail_cache_path(source: &Path) -> PathBuf { get_cache_path(&source.to_string_lossy()) }

pub fn cache_is_valid(source: &Path, cache: &Path) -> bool {
    let (Ok(sm), Ok(cm)) = (fs::metadata(source), fs::metadata(cache)) else {
        return false;
    };
    let (Ok(st), Ok(ct)) = (sm.modified(), cm.modified()) else {
        return false;
    };
    ct >= st
}

pub fn generate_and_cache(source: &Path, level: ThumbLevel) -> anyhow::Result<PathBuf> {
    let cp = match level {
        ThumbLevel::L1 => get_cache_path(&source.to_string_lossy()),
        ThumbLevel::L2 => get_cache_path_l2(&source.to_string_lossy()),
    };
    if cache_is_valid(source, &cp) { return Ok(cp); }
    fs::write(&cp, generate_thumbnail(source, level)?)?;
    Ok(cp)
}
