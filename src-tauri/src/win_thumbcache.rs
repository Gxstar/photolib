//! Windows Shell thumbnail cache (IShellItemImageFactory).
//!
//! What Explorer uses: extracts system-cached thumbnails for RAW/HEIC/AVIF
//! in ~5ms on a warm cache (after Explorer has browsed the folder once).
//! Cold path falls back to the regular WIC pipeline; this wrapper never errors.

#![cfg(target_os = "windows")]

use std::io::Cursor;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::DynamicImage;
use windows::core::Interface;
use windows::Win32::Foundation::SIZE;
use windows::Win32::Graphics::Gdi::{DeleteObject, HBITMAP, HPALETTE};
use windows::Win32::Graphics::Imaging::{
    IWICBitmap, IWICImagingFactory, IWICFormatConverter, WICBitmapAlphaChannelOption,
    WICBitmapDitherTypeNone, WICBitmapPaletteTypeCustom, CLSID_WICImagingFactory,
    GUID_WICPixelFormat32bppBGRA,
};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{IShellItem, IShellItemImageFactory, SIIGBF_THUMBNAILONLY, SHCreateItemFromParsingName};

pub fn try_shell_thumbnail(source: &Path, target_px: u32) -> Option<Vec<u8>> {
    let _ = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let wide_path: Vec<u16> = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let hbmp = unsafe {
        let item: IShellItem =
            SHCreateItemFromParsingName(windows::core::PCWSTR(wide_path.as_ptr()), None).ok()?;
        let factory: IShellItemImageFactory = item.cast().ok()?;
        let size = SIZE {
            cx: target_px as i32,
            cy: target_px as i32,
        };
        factory.GetImage(size, SIIGBF_THUMBNAILONLY).ok()?
    };
    let jpeg = encode_hbitmap_to_jpeg(hbmp, 85);
    unsafe {
        let _ = DeleteObject(hbmp.into());
    }
    jpeg
}

fn encode_hbitmap_to_jpeg(hbmp: HBITMAP, quality: u8) -> Option<Vec<u8>> {
    unsafe {
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).ok()?;
        let wic_bitmap: IWICBitmap = factory
            .CreateBitmapFromHBITMAP(
                hbmp,
                HPALETTE(std::ptr::null_mut()),
                WICBitmapAlphaChannelOption(0),
            )
            .ok()?;

        let (mut w, mut h) = (0u32, 0u32);
        wic_bitmap.GetSize(&mut w, &mut h).ok()?;
        if w == 0 || h == 0 {
            return None;
        }

        let converter: IWICFormatConverter = factory.CreateFormatConverter().ok()?;
        converter
            .Initialize(
                &wic_bitmap,
                &GUID_WICPixelFormat32bppBGRA,
                WICBitmapDitherTypeNone,
                None,
                0.0,
                WICBitmapPaletteTypeCustom,
            )
            .ok()?;

        let stride = w * 4;
        let mut pixels = vec![0u8; (stride * h) as usize];
        converter
            .CopyPixels(std::ptr::null(), stride, pixels.as_mut_slice())
            .ok()?;
        for ch in pixels.chunks_exact_mut(4) {
            ch.swap(0, 2);
        }
        let rgba = image::RgbaImage::from_raw(w, h, pixels)?;
        let img = DynamicImage::ImageRgba8(rgba);
        let scaled_rgb = img.to_rgb8();
        let mut buf = Vec::new();
        let mut cur = Cursor::new(&mut buf);
        let mut enc = JpegEncoder::new_with_quality(&mut cur, quality);
        enc.encode(
            scaled_rgb.as_raw(),
            scaled_rgb.width(),
            scaled_rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .ok()?;
        Some(buf)
    }
}
