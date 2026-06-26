import { useEffect, useState, useCallback, memo, useRef, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { Star, Flag, ImageOff, ZoomIn, ZoomOut, Images } from "lucide-react";
import { getThumbnailPath, isTauri } from "../../api";
import { convertFileSrc } from "@tauri-apps/api/core";
import { VirtuosoGrid } from "react-virtuoso";
import { invoke } from "@tauri-apps/api/core";

// ========== Thumbnail concurrency limiter ==========
const MAX_CONCURRENT = 12;
let running = 0;
const pendingFast: Array<() => void> = [];
const pendingSlow: Array<() => void> = [];

const SLOW_TYPES = new Set(["raw", "heic", "tiff", "avif"]);
function isSlowFormat(mediaType: string): boolean {
  return SLOW_TYPES.has(mediaType);
}

function acquireSlot(slow: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running++;
      resolve();
    } else {
      if (slow) {
        pendingSlow.push(() => { running++; resolve(); });
      } else {
        pendingFast.push(() => { running++; resolve(); });
      }
    }
  });
}

function releaseSlot() {
  running--;
  // 优先从 fast 队列拉取（让 JPG 先消化）
  const next = pendingFast.shift() || pendingSlow.shift();
  if (next) next();
}

// ========== LRU Thumbnail Cache (max 5000 entries) ==========
type ThumbState = { src: string; error: boolean };
const THUMB_CACHE_MAX = 5000;
const thumbCache = new Map<number, ThumbState>();

function cacheGet(id: number): ThumbState | undefined {
  return thumbCache.get(id);
}

function cacheSet(id: number, state: ThumbState): void {
  if (thumbCache.has(id)) {
    thumbCache.delete(id); // re-insert to move to end (LRU)
  }
  thumbCache.set(id, state);
  if (thumbCache.size > THUMB_CACHE_MAX) {
    // Evict oldest
    const firstKey = thumbCache.keys().next().value;
    if (firstKey !== undefined) thumbCache.delete(firstKey);
  }
}

const inflightRequests = new Map<number, Promise<ThumbState>>();

async function requestThumbnail(id: number, filePath: string, mediaType: string, cachedPath?: string): Promise<ThumbState> {
  const cached = cacheGet(id);
  if (cached) return cached;

  const inflight = inflightRequests.get(id);
  if (inflight) return inflight;

  const promise = (async (): Promise<ThumbState> => {
    // NEW: skeleton-provided cache path — skip IPC entirely
    if (cachedPath) {
      return { src: convertFileSrc(cachedPath), error: false };
    }
    const slow = isSlowFormat(mediaType);
    try {
      await acquireSlot(slow);
      try {
        if (isTauri()) {
          const cachePath = await getThumbnailPath(filePath);
          return { src: convertFileSrc(cachePath), error: false };
        } else {
          return { src: `file://${filePath.replace(/\\/g, "/")}`, error: false };
        }
      } finally {
        releaseSlot();
      }
    } catch (e) {
      console.warn("[Thumbnail] failed:", filePath, e);
      return { src: "", error: true };
    }
  })();
  inflightRequests.set(id, promise);
  const result = await promise;
  inflightRequests.delete(id);
  cacheSet(id, result);
  return result;
}

// ========== Viewport-driven EXIF priority request ==========
// Debounce timer: 滚动停下 200ms 后才发请求
let pendingExifPaths: Set<string> = new Set();
let debounceTimer: number | null = null;
const DEBOUNCE_MS = 200;

function debouncedRequestExif(paths: string[]) {
  for (const p of paths) pendingExifPaths.add(p);
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    const toRequest = Array.from(pendingExifPaths);
    pendingExifPaths.clear();
    debounceTimer = null;
    if (toRequest.length === 0) return;
    if (!isTauri()) return;
    invoke("extract_exif_for", { paths: toRequest }).catch((e) => {
      console.warn("[extract_exif_for]", e);
    });
  }, DEBOUNCE_MS);
}

interface ThumbnailGridProps {
  photos: Photo[];
}

export function ThumbnailGrid({ photos }: ThumbnailGridProps) {
  const { isLoading, selectedIds, toggleSelect, thumbnailSize, setThumbnailSize, setPreviewPhotoId } = useAppStore();

  // 用 pathKey 而非 photos 引用 — 修复 EXIF 补丁触发 cancelAllPending 的 bug
  const pathKey = useMemo(
    () => photos.map((p) => p.filePath).join("\u0000"),
    [photos]
  );
  useEffect(() => {
    // 只在路径集合变化时（打开新目录）才取消，EXIF 补丁不取消
    // 路径相同但 EXIF 更新不应取消正在加载的缩略图
  }, [pathKey]);

  // 视口范围变化时触发 EXIF 优先请求
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const handleRangeChanged = useCallback((range: { startIndex: number; endIndex: number }) => {
    const cur = photosRef.current;
    if (cur.length === 0) return;
    const start = Math.max(0, range.startIndex);
    const end = Math.min(cur.length - 1, range.endIndex);
    // 预取：可见范围 + 下方额外 40 个（一屏大约 20-30 个格子）
    const prefetchEnd = Math.min(cur.length - 1, end + 40);
    const visible = cur.slice(start, prefetchEnd + 1);
    const paths = visible
      .filter((p) => !p.dateTaken || p.dateTaken === "")
      .map((p) => p.filePath);
    if (paths.length > 0) {
      debouncedRequestExif(paths);
    }
  }, []);

  const cellSize = thumbnailSize + 8;

  const itemContent = useCallback(
    (index: number) => {
      const photo = photosRef.current[index];
      return (
        <div style={{ width: cellSize, height: cellSize }} className="p-1">
          <ThumbnailCell
            key={photo.id}
            photo={photo}
            selected={selectedIds.has(photo.id)}
            onSelect={(multi) => toggleSelect(photo.id, multi)}
            cellSize={thumbnailSize}
          />
        </div>
      );
    },
    [selectedIds, toggleSelect, cellSize, thumbnailSize],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Size slider — polished */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-200/40 dark:border-surface-200/20 shrink-0 bg-surface-50/40 dark:bg-surface-50/20 backdrop-blur-sm">
        <ZoomOut size={13} className="text-surface-400" />
        <div className="relative flex-1 h-2">
          <div className="absolute inset-0 rounded-full bg-surface-200/60 dark:bg-surface-200/30" />
          <input
            type="range"
            min={120}
            max={320}
            value={thumbnailSize}
            onChange={(e) => setThumbnailSize(Number(e.target.value))}
            className="absolute inset-0 w-full h-full appearance-none bg-transparent cursor-pointer z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:bg-gradient-to-r [&::-webkit-slider-thumb]:from-accent-400 [&::-webkit-slider-thumb]:to-accent-600 [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(99,102,241,0.3)] [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200 hover:[&::-webkit-slider-thumb]:scale-110 active:[&::-webkit-slider-thumb]:scale-95"
          />
        </div>
        <ZoomIn size={13} className="text-surface-400" />
        <div className="flex items-center gap-1.5 ml-1 text-2xs text-surface-400 font-medium tabular-nums shrink-0">
          <Images size={12} />
          {photos.length} 张
        </div>
      </div>

      {/* Virtual grid */}
      <div className="flex-1">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-surface-400 animate-fade-in">
            {isLoading ? (
              <>
                <div className="w-6 h-6 rounded-full border-2 border-surface-300/60 border-t-accent-500 animate-spin" />
                <span className="text-xs">扫描文件中...</span>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-surface-100/60 dark:bg-surface-100/30 flex items-center justify-center">
                  <ImageOff size={26} strokeWidth={1.5} className="text-surface-400" />
                </div>
                <span className="text-xs">此目录没有照片</span>
              </>
            )}
          </div>
        ) : (
          <VirtuosoGrid
            style={{ height: "100%" }}
            totalCount={photos.length}
            itemContent={itemContent}
            listClassName="flex flex-wrap gap-0.5 p-2.5 content-start"
            increaseViewportBy={800}
            computeItemKey={(index) => photos[index].id}
            rangeChanged={handleRangeChanged}
          />
        )}
      </div>
    </div>
  );
}

// ============ ThumbnailCell ============
const colorLabelMap: Record<string, string> = {
  red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
  yellow: "#eab308", purple: "#a855f7",
};

const ThumbnailCell = memo(function ThumbnailCell({
  photo,
  selected,
  onSelect,
  cellSize,
}: {
  photo: Photo;
  selected: boolean;
  onSelect: (multi: boolean) => void;
  cellSize: number;
}) {
  const initial = cacheGet(photo.id);
  const [imgSrc, setImgSrc] = useState(initial?.src ?? "");
  const [imgError, setImgError] = useState(initial?.error ?? false);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    const cached = cacheGet(photo.id);
    if (cached) {
      if (cached.src !== imgSrc) setImgSrc(cached.src);
      if (cached.error !== imgError) setImgError(cached.error);
      if (loading) setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    requestThumbnail(photo.id, photo.filePath, photo.mediaType, photo.thumbnailCachePath || undefined).then((result) => {
      if (cancelled) return;
      setImgSrc(result.src);
      setImgError(result.error);
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id, photo.filePath]);

  return (
    <div
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={() => setPreviewPhotoId(photo.id)}
      className={`thumb-cell ${selected ? "selected" : ""}`}
      style={{ width: cellSize, height: cellSize }}
    >
      <div
        className="relative bg-surface-100 dark:bg-surface-100 overflow-hidden"
        style={{ width: cellSize, height: cellSize, borderRadius: "inherit" }}
      >
        {/* Skeleton */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-surface-300/60 border-t-accent-500 animate-spin" />
          </div>
        )}

        {/* Thumbnail */}
        {imgSrc && !imgError && (
          <img
            src={imgSrc}
            alt={photo.fileName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}

        {/* Error state */}
        {imgError && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-surface-400 p-3">
            <ImageOff size={18} strokeWidth={1.5} />
            <span className="text-3xs text-center leading-tight break-all">{photo.fileName}</span>
          </div>
        )}

        {/* Glass filename overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-black/30 backdrop-blur-sm">
          <p className="text-3xs text-white/90 truncate leading-tight font-medium drop-shadow-sm">{photo.fileName}</p>
        </div>

        {/* Selection indicator — checkmark circle */}
        {selected && (
          <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center shadow-md shadow-accent-500/30 animate-scale-in">
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {/* Flag */}
        {photo.flag === "pick" && (
          <div className="absolute top-2 right-2">
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-sm shadow-green-500/30">
              <Flag size={9} className="text-white" />
            </div>
          </div>
        )}
        {photo.flag === "reject" && (
          <div className="absolute top-2 right-2">
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-sm shadow-red-500/30">
              <Flag size={9} className="text-white" />
            </div>
          </div>
        )}

        {/* Color label — refined bar */}
        {photo.colorLabel && colorLabelMap[photo.colorLabel] && (
          <div className="absolute top-0 left-0 right-0 h-1.5 rounded-t-[16px]" style={{ backgroundColor: colorLabelMap[photo.colorLabel] }} />
        )}

        {/* Rating — glow stars */}
        {photo.rating > 0 && (
          <div className="absolute bottom-8 left-2.5 flex gap-0.5">
            {Array.from({ length: photo.rating }).map((_, i) => (
              <Star key={i} size={9} className="text-yellow-400 fill-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.5)]" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.photo.id === next.photo.id &&
    prev.photo.filePath === next.photo.filePath &&
    prev.photo.rating === next.photo.rating &&
    prev.photo.flag === next.photo.flag &&
    prev.photo.colorLabel === next.photo.colorLabel &&
    prev.photo.thumbnailUrl === next.photo.thumbnailUrl &&
    prev.selected === next.selected &&
    prev.cellSize === next.cellSize
  );
});
