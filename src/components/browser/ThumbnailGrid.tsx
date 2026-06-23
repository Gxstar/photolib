import { useEffect, useState, useCallback, memo, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { Star, Flag, ImageOff, ZoomIn, ZoomOut, Images } from "lucide-react";
import { getThumbnailPath, isTauri } from "../../api";
import { convertFileSrc } from "@tauri-apps/api/core";
import { VirtuosoGrid } from "react-virtuoso";

// ========== 缩略图并发限流（双优先级队列） ==========
// 快格式（JPEG/PNG/WebP/BMP）优先于慢格式（RAW/HEIC/TIFF/AVIF）
// 避免 RAW 卡住大量 JPEG 的加载
const MAX_CONCURRENT = 2;
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
  // 快队列优先
  const next = pendingFast.shift() || pendingSlow.shift();
  if (next) next();
}

// 切换目录时清空排队中的旧缩略图请求
function cancelAllPending() {
  pendingFast.length = 0;
  pendingSlow.length = 0;
}
// ====================================================

// ========== 缩略图全局缓存（跨 mount/unmount 持久化） ==========
// 避免 Virtuoso 滚动回收 Cell 后再次进入时重新请求
type ThumbState = { src: string; error: boolean };
const thumbGlobalCache = new Map<number, ThumbState>();
const inflightRequests = new Map<number, Promise<ThumbState>>();

async function requestThumbnail(id: number, filePath: string, mediaType: string): Promise<ThumbState> {
  const cached = thumbGlobalCache.get(id);
  if (cached) return cached;

  const inflight = inflightRequests.get(id);
  if (inflight) return inflight;

  const promise = (async (): Promise<ThumbState> => {
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
  thumbGlobalCache.set(id, result);
  return result;
}
// ============================================================

interface ThumbnailGridProps {
  photos: Photo[];
}

export function ThumbnailGrid({ photos }: ThumbnailGridProps) {
  const { isLoading, selectedIds, toggleSelect, thumbnailSize, setThumbnailSize } = useAppStore();

  // 目录切换时清空旧 pending 请求
  useEffect(() => {
    cancelAllPending();
  }, [photos]);

  const cellSize = thumbnailSize + 6;

  // 用 ref 持有 photos 数组，避免 itemContent 因 photos 引用变化频繁重建
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const itemContent = useCallback(
    (index: number) => {
      const photo = photosRef.current[index];
      return (
        <div style={{ width: cellSize, height: cellSize }} className="p-0.5">
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
      {/* Size slider */}
      <div className="flex items-center gap-3 px-4 py-2 bg-surface-50 dark:bg-surface-50 border-b border-surface-200 dark:border-surface-200 shrink-0">
        <ZoomOut size={12} className="text-surface-400" />
        <input
          type="range"
          min={120}
          max={320}
          value={thumbnailSize}
          onChange={(e) => setThumbnailSize(Number(e.target.value))}
          className="flex-1 h-1 bg-surface-200 dark:bg-surface-200 rounded-full appearance-none cursor-pointer accent-accent-500"
        />
        <ZoomIn size={12} className="text-surface-400" />
        <div className="flex items-center gap-1.5 ml-2 text-2xs text-surface-400 font-medium tabular-nums">
          <Images size={11} />
          {photos.length} 张
        </div>
      </div>

      {/* Virtual grid */}
      <div className="flex-1">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-surface-400 animate-fade-in">
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-surface-300 border-t-accent-500 rounded-full animate-spin" />
                <span className="text-xs">扫描文件中...</span>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl bg-surface-100 dark:bg-surface-100 flex items-center justify-center">
                  <ImageOff size={24} strokeWidth={1.5} className="text-surface-300" />
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
            listClassName="flex flex-wrap gap-0.5 p-2 content-start"
            increaseViewportBy={400}
            computeItemKey={(index) => photos[index].id}
          />
        )}
      </div>
    </div>
  );
}

// ============ ThumbnailCell ============
const colorLabelMap: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  purple: "#a855f7",
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
  // 初始 state 从全局缓存取，避免重复加载时闪烁
  const initial = thumbGlobalCache.get(photo.id);
  const [imgSrc, setImgSrc] = useState(initial?.src ?? "");
  const [imgError, setImgError] = useState(initial?.error ?? false);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    const cached = thumbGlobalCache.get(photo.id);
    if (cached) {
      // 命中缓存：直接同步设置，无 loading 闪烁
      if (cached.src !== imgSrc) setImgSrc(cached.src);
      if (cached.error !== imgError) setImgError(cached.error);
      if (loading) setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    requestThumbnail(photo.id, photo.filePath, photo.mediaType).then((result) => {
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
      onDoubleClick={() => {/* TODO: preview */}}
      className={`relative rounded-xl overflow-hidden transition-all duration-200 ${
        selected
          ? "ring-2 ring-accent-500 shadow-lg shadow-accent-500/20"
          : "hover:ring-2 hover:ring-accent-300 hover:shadow-md"
      }`}
      style={{ width: cellSize, height: cellSize }}
    >
      <div
        className="relative bg-surface-100 dark:bg-surface-100 rounded-xl overflow-hidden"
        style={{ width: cellSize, height: cellSize }}
      >
        {/* Skeleton */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-surface-300 border-t-accent-500 rounded-full animate-spin" />
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
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-surface-400 p-2">
            <ImageOff size={16} strokeWidth={1.5} />
            <span className="text-3xs text-center leading-tight break-all">{photo.fileName}</span>
          </div>
        )}

        {/* Filename overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent">
          <p className="text-3xs text-white/90 truncate leading-tight font-medium">{photo.fileName}</p>
        </div>

        {/* Selection indicator */}
        {selected && (
          <div className="absolute top-2 left-2 w-4 h-4 rounded-full bg-accent-500 flex items-center justify-center shadow-sm">
            <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )}

        {/* Flag */}
        {photo.flag === "pick" && (
          <div className="absolute top-2 right-2">
            <div className="w-4 h-4 rounded-full bg-green-500/90 flex items-center justify-center shadow-sm">
              <Flag size={8} className="text-white" />
            </div>
          </div>
        )}
        {photo.flag === "reject" && (
          <div className="absolute top-2 right-2">
            <div className="w-4 h-4 rounded-full bg-red-500/90 flex items-center justify-center shadow-sm">
              <Flag size={8} className="text-white" />
            </div>
          </div>
        )}

        {/* Color label */}
        {photo.colorLabel && colorLabelMap[photo.colorLabel] && (
          <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: colorLabelMap[photo.colorLabel] }} />
        )}

        {/* Rating */}
        {photo.rating > 0 && (
          <div className="absolute bottom-6 left-2 flex gap-0.5">
            {Array.from({ length: photo.rating }).map((_, i) => (
              <Star key={i} size={8} className="text-yellow-400 fill-yellow-400 drop-shadow-sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  // 自定义比较：忽略 EXIF 字段（缩略图独立缓存，不影响显示），
  // 但保留 rating/flag/colorLabel/selected/cellSize 以响应用户交互
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
