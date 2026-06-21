import { useEffect, useState, useCallback } from "react";
import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { Star, Flag, ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { getThumbnailData, isTauri } from "../../api";
import { VirtuosoGrid } from "react-virtuoso";

// ========== 缩略图并发限流 ==========
const MAX_CONCURRENT = 2;
let running = 0;
const pending: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  return new Promise((resolve) => {
    if (running < MAX_CONCURRENT) {
      running++;
      resolve();
    } else {
      pending.push(() => { running++; resolve(); });
    }
  });
}

function releaseSlot() {
  running--;
  const next = pending.shift();
  if (next) next();
}
// ====================================

interface ThumbnailGridProps {
  photos: Photo[];
}

export function ThumbnailGrid({ photos }: ThumbnailGridProps) {
  const { selectedIds, toggleSelect, thumbnailSize, setThumbnailSize } = useAppStore();

  // 每个格子实际渲染宽度 = thumbnailSize + gap
  const cellSize = thumbnailSize + 4;

  const itemContent = useCallback(
    (index: number) => {
      const photo = photos[index];
      return (
        <div style={{ width: cellSize, height: cellSize }}>
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
    [photos, selectedIds, toggleSelect, cellSize, thumbnailSize],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Size slider */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-800 border-b border-surface-700 shrink-0">
        <ChevronLeft size={10} className="text-surface-500" />
        <input
          type="range"
          min={120}
          max={320}
          value={thumbnailSize}
          onChange={(e) => setThumbnailSize(Number(e.target.value))}
          className="flex-1 h-1 bg-surface-600 rounded-full appearance-none cursor-pointer accent-accent-500"
        />
        <ChevronRight size={10} className="text-surface-500" />
        <span className="text-[10px] text-surface-500 ml-1">{photos.length} 张</span>
      </div>

      {/* Virtual grid */}
      <div className="flex-1">
        {photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-surface-500">
            <ImageOff size={32} strokeWidth={1} />
            <span className="text-xs">此目录没有照片，或尚未扫描</span>
          </div>
        ) : (
          <VirtuosoGrid
            style={{ height: "100%" }}
            totalCount={photos.length}
            itemContent={itemContent}
            listClassName="flex flex-wrap gap-1 p-1 content-start"
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

function ThumbnailCell({
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
  const [imgSrc, setImgSrc] = useState("");
  const [imgError, setImgError] = useState(false);
  const [loading, setLoading] = useState(false);

  // 挂载即触发懒加载，卸载时取消
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        await acquireSlot();
        if (cancelled) { releaseSlot(); return; }

        const isT = isTauri();
        const src = isT
          ? await getThumbnailData(photo.filePath)
          : `file://${photo.filePath.replace(/\\/g, "/")}`;

        releaseSlot();
        if (!cancelled) {
          setImgSrc(src);
          setLoading(false);
        }
      } catch (e) {
        releaseSlot();
        if (!cancelled) {
          console.warn("[Thumbnail] failed:", photo.filePath, e);
          setImgError(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [photo.filePath]);

  return (
    <div
      onClick={(e) => onSelect(e.ctrlKey || e.metaKey)}
      onDoubleClick={() => {/* TODO: preview */}}
      className={`relative ${selected ? "ring-2 ring-accent-500 rounded" : ""}`}
      style={{ width: cellSize, height: cellSize }}
    >
      <div
        className="relative bg-surface-800 rounded overflow-hidden"
        style={{ width: cellSize, height: cellSize }}
      >
        {/* 骨架屏 */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-800">
            <div className="w-6 h-6 border-2 border-surface-600 border-t-accent-500 rounded-full animate-spin" />
          </div>
        )}

        {/* 缩略图 */}
        {imgSrc && !imgError && (
          <img
            src={imgSrc}
            alt={photo.fileName}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        )}

        {/* 加载失败 */}
        {imgError && (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-surface-500 p-1">
            <ImageOff size={16} strokeWidth={1} />
            <span className="text-[9px] text-center leading-tight break-all">{photo.fileName}</span>
          </div>
        )}

        {/* 文件名叠底 */}
        <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <p className="text-[10px] text-white/90 truncate leading-tight">{photo.fileName}</p>
        </div>

        {/* Flag */}
        {photo.flag === "pick" && (
          <div className="absolute top-1 left-1"><Flag size={12} className="text-green-400 fill-green-400" /></div>
        )}
        {photo.flag === "reject" && (
          <div className="absolute top-1 left-1"><Flag size={12} className="text-red-400 fill-red-400" /></div>
        )}

        {/* Color label */}
        {photo.colorLabel && colorLabelMap[photo.colorLabel] && (
          <div className="absolute top-0 left-0 right-0 h-0.5" style={{ backgroundColor: colorLabelMap[photo.colorLabel] }} />
        )}

        {/* Rating */}
        {photo.rating > 0 && (
          <div className="absolute top-1 right-1 flex gap-0.5">
            {Array.from({ length: photo.rating }).map((_, i) => (
              <Star key={i} size={8} className="text-yellow-400 fill-yellow-400" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
