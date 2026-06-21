// API 服务层 — 封装所有 Tauri IPC 调用

import type { Photo, Folder, DirectoryEntry } from "./types";

// 检测是否运行在 Tauri 环境中
const isTauri = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

// 动态加载 Tauri invoke
const getInvoke = async () => {
  if (!isTauri()) throw new Error("Not running in Tauri");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
};

// Rust snake_case → 前端 camelCase
function normalizePhoto(raw: Record<string, unknown>): Photo {
  return {
    id: raw.id as number,
    filePath: (raw.filePath ?? raw.file_path ?? "") as string,
    fileName: (raw.fileName ?? raw.file_name ?? "") as string,
    fileSize: (raw.fileSize ?? raw.file_size ?? 0) as number,
    mediaType: (raw.mediaType ?? raw.media_type ?? "") as string,
    thumbnailUrl: (raw.thumbnailUrl ?? raw.thumbnail_url ?? "") as string || "",
    dateTaken: (raw.dateTaken ?? raw.date_taken ?? "") as string || "",
    cameraMake: (raw.cameraMake ?? raw.camera_make ?? "") as string || "",
    cameraModel: (raw.cameraModel ?? raw.camera_model ?? "") as string || "",
    lensModel: (raw.lensModel ?? raw.lens_model ?? "") as string || "",
    focalLength: (raw.focalLength ?? raw.focal_length ?? 0) as number,
    aperture: (raw.aperture ?? 0) as number,
    shutterSpeed: (raw.shutterSpeed ?? raw.shutter_speed ?? "") as string || "",
    iso: (raw.iso ?? 0) as number,
    exposureComp: (raw.exposureComp ?? raw.exposure_comp ?? 0) as number,
    flash: (raw.flash ?? 0) as number,
    whiteBalance: (raw.whiteBalance ?? raw.white_balance ?? "") as string || "",
    meteringMode: (raw.meteringMode ?? raw.metering_mode ?? "") as string || "",
    imageWidth: (raw.imageWidth ?? raw.image_width ?? 0) as number,
    imageHeight: (raw.imageHeight ?? raw.image_height ?? 0) as number,
    colorSpace: (raw.colorSpace ?? raw.color_space ?? "") as string || "",
    latitude: (raw.latitude ?? null) as number | null,
    longitude: (raw.longitude ?? null) as number | null,
    altitude: (raw.altitude ?? null) as number | null,
    rating: (raw.rating ?? 0) as number,
    colorLabel: (raw.colorLabel ?? raw.color_label ?? "") as string || "",
    flag: (raw.flag ?? "") as string || "",
    notes: (raw.notes ?? "") as string || "",
  };
}

/// 扫描文件夹（递归发现照片，写入数据库）
export async function scanFolder(folderPath: string): Promise<string[]> {
  const invoke = await getInvoke();
  return invoke<string[]>("scan_folder", { folderPath });
}

/// 获取所有照片
export async function getPhotos(): Promise<Photo[]> {
  const invoke = await getInvoke();
  const raw = await invoke<Record<string, unknown>[]>("get_photos");
  return raw.map(normalizePhoto);
}

/// 获取单张照片的完整 EXIF 元数据（exiftool 实时读取）
export async function getPhotoMetadata(filePath: string): Promise<Record<string, unknown>> {
  const invoke = await getInvoke();
  return invoke<Record<string, unknown>>("get_photo_metadata", { filePath });
}

/// 导入照片
export async function importPhotos(
  sourceDir: string,
  destDir: string,
  renameRule: string = "",
  deleteSource: boolean = false
): Promise<number> {
  const invoke = await getInvoke();
  return invoke<number>("import_photos", { sourceDir, destDir, renameRule, deleteSource });
}

/// 检测可移动存储介质
export async function detectRemovableDrives(): Promise<string[]> {
  const invoke = await getInvoke();
  return invoke<string[]>("detect_removable_drives");
}

/// 浏览目录 — 列出子目录及其照片数
export async function browseDirectory(dirPath: string): Promise<DirectoryEntry[]> {
  const invoke = await getInvoke();
  return invoke<DirectoryEntry[]>("browse_directory", { dirPath: dirPath });
}

/// 获取指定文件夹内的照片（递归，用于相册）
export async function getPhotosByFolderDeep(folderPath: string): Promise<Photo[]> {
  const invoke = await getInvoke();
  const raw = await invoke<Record<string, unknown>[]>("get_photos_by_folder_deep", { folderPath });
  return raw.map(normalizePhoto);
}
/// 打开目录并返回照片（扫描文件系统，不读 DB，极速）
export async function openDirectory(folderPath: string): Promise<Photo[]> {
  const invoke = await getInvoke();
  const raw = await invoke<Record<string, unknown>[]>("open_directory", { folderPath });
  if (!Array.isArray(raw)) {
    console.error("[PhotoLib] open_directory returned non-array:", typeof raw);
    return [];
  }
  return raw.map(normalizePhoto);
}

/// 从 DB 重新加载目录照片（含完整 EXIF），用于 extractExifBatch 后刷新
export async function reloadDirectory(folderPath: string): Promise<Photo[]> {
  const invoke = await getInvoke();
  const raw = await invoke<Record<string, unknown>[]>("reload_directory", { folderPath });
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizePhoto);
}

/// 获取指定文件夹内的照片（仅当前目录，不递归 — 用于目录浏览）
/// @deprecated 请使用 openDirectory 替代
export async function getPhotosByFolder(folderPath: string): Promise<Photo[]> {
  const invoke = await getInvoke();
  const scanned = await invoke<string[]>("scan_folder", { folderPath });
  console.log(`[PhotoLib] scan_folder done: ${scanned.length} files in ${folderPath}`);
  if (scanned.length === 0) {
    return [];
  }
  const raw = await invoke<Record<string, unknown>[]>("get_photos_by_folder", { folderPath });
  console.log(`[PhotoLib] get_photos_by_folder raw type:`, typeof raw, Array.isArray(raw));
  console.log(`[PhotoLib] get_photos_by_folder done: ${Array.isArray(raw) ? raw.length : 'not array'} results`);
  if (!Array.isArray(raw)) {
    console.error("[PhotoLib] Unexpected response type:", raw);
    return [];
  }
  const photos = raw.map(normalizePhoto);
  console.log(`[PhotoLib] normalized ${photos.length} photos, first entry:`, photos[0]);
  return photos;
}

/// 获取所有相册
export async function getAlbums(): Promise<Folder[]> {
  const invoke = await getInvoke();
  return invoke<Folder[]>("get_albums");
}

/// 添加文件夹到相册（递归扫描）
export async function addAlbum(folderPath: string): Promise<void> {
  const invoke = await getInvoke();
  await invoke<string[]>("scan_folder_deep", { folderPath });
  await invoke<void>("add_album", { folderPath });
}

/// 从相册移除文件夹
export async function removeAlbum(folderId: number): Promise<void> {
  const invoke = await getInvoke();
  return invoke<void>("remove_album", { folderId });
}

/// 检查是否在 Tauri 环境中运行
export { isTauri };

/// 获取照片缩略图（高性能：优先 EXIF 内嵌缩略图 + 磁盘缓存）
export async function getThumbnailData(filePath: string): Promise<string> {
  const invoke = await getInvoke();
  return invoke<string>("get_thumbnail", { filePath });
}

/// 批量提取 EXIF（后台调用，不阻塞 UI）
export async function extractExifBatch(folderPath: string): Promise<number> {
  const invoke = await getInvoke();
  return invoke<number>("extract_exif_batch", { folderPath });
}

/// 预加载目录内所有缩略图到磁盘缓存（后台调用，不阻塞 UI）
export async function preloadThumbnails(folderPath: string): Promise<number> {
  const invoke = await getInvoke();
  return invoke<number>("preload_thumbnails", { folderPath });
}
