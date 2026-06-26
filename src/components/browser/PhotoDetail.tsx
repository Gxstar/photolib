import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  getAllPhotos,
  getPreviewImage,
  updatePhotoMeta,
  isTauri,
} from "../../api";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { Photo } from "../../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

const colorLabelMap: Record<string, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  blue: "#3b82f6",
  purple: "#a855f7",
};

function ExifTable({ photo }: { photo: Photo }) {
  const rows: [string, string][] = [
    ["文件名", photo.fileName],
    ["路径", photo.filePath],
    ["大小", formatBytes(photo.fileSize)],
    ["尺寸", `${photo.imageWidth || "-"} × ${photo.imageHeight || "-"}`],
    ["相机", [photo.cameraMake, photo.cameraModel].filter(Boolean).join(" ")],
    ["镜头", photo.lensModel],
    ["焦距", photo.focalLength ? `${photo.focalLength}mm` : ""],
    ["光圈", photo.aperture ? `f/${photo.aperture}` : ""],
    ["快门", photo.shutterSpeed],
    ["ISO", photo.iso ? String(photo.iso) : ""],
    ["曝光补偿", photo.exposureComp ? `EV ${photo.exposureComp}` : ""],
    ["日期", photo.dateTaken],
    ["白平衡", photo.whiteBalance],
    ["测光", photo.meteringMode],
    ["闪光灯", photo.flash],
    ["色彩空间", photo.colorSpace],
    ["软件", photo.software],
    ["版权", photo.copyright],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="divide-y divide-white/5">
      {rows.map(([label, value]) => (
        <div key={label} className="py-1.5">
          <p className="text-2xs text-white/30">{label}</p>
          <p className="text-xs text-white/80 break-all">{value}</p>
        </div>
      ))}
    </div>
  );
}

function RatingStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button key={star} onClick={() => onChange(star === value ? 0 : star)}
          className="p-0.5 transition-colors hover:scale-110">
          <svg className={`w-5 h-5 ${star <= value ? "text-yellow-400 fill-yellow-400" : "text-white/20 fill-none"}`}
            viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function ColorButtons({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const colors = ["red", "yellow", "green", "blue", "purple"] as const;
  return (
    <div className="flex gap-2 items-center">
      {colors.map((c) => (
        <button key={c} onClick={() => onChange(value === c ? "" : c)}
          className={`w-6 h-6 rounded-full transition-all border-2 ${
            value === c ? "border-white scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: colorLabelMap[c] }}
        />
      ))}
      {value && (
        <button onClick={() => onChange("")} className="text-2xs text-white/40 hover:text-white/70 ml-1">
          清除
        </button>
      )}
    </div>
  );
}

function FlagButtons({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <button onClick={() => onChange(value === "pick" ? "" : "pick")}
        className={`px-3 py-1 rounded-full text-xs transition-all ${
          value === "pick"
            ? "bg-green-500 text-white"
            : "bg-white/10 text-white/50 hover:bg-white/20"
        }`}>
        ✓ 精选
      </button>
      <button onClick={() => onChange(value === "reject" ? "" : "reject")}
        className={`px-3 py-1 rounded-full text-xs transition-all ${
          value === "reject"
            ? "bg-red-500 text-white"
            : "bg-white/10 text-white/50 hover:bg-white/20"
        }`}>
        ✗ 排除
      </button>
    </div>
  );
}

function parsePhotoId(): number | null {
  const m = window.location.hash.match(/^#\/photo\/(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

export function PhotoDetail() {
  const { updatePhotoMeta: updateStore } = useAppStore();
  const [allPhotos, setAllPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoId, setPhotoId] = useState<number | null>(parsePhotoId);
  const [imgSrc, setImgSrc] = useState("");
  const [imgError, setImgError] = useState(false);
  const [rotation, setRotation] = useState(0);

  // Edit form state
  const [rating, setRating] = useState(0);
  const [colorLabel, setColorLabel] = useState("");
  const [flag, setFlag] = useState("");
  const [notes, setNotes] = useState("");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>("");

  const currentPhoto = useMemo(
    () => allPhotos.find((p) => p.id === photoId) ?? null,
    [allPhotos, photoId],
  );

  const currentIndex = useMemo(
    () => allPhotos.findIndex((p) => p.id === photoId),
    [allPhotos, photoId],
  );

  // Load all photos on mount
  useEffect(() => {
    if (!isTauri()) return;
    getAllPhotos()
      .then((list) => {
        setAllPhotos(list);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Listen for hash changes (nav, initial load)
  useEffect(() => {
    const handler = () => {
      const pid = parsePhotoId();
      if (pid !== null && pid !== photoId) {
        setPhotoId(pid);
        setImgSrc("");
        setImgError(false);
        setRotation(0);
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, [photoId]);

  // When photoId changes, update image src and form state
  useEffect(() => {
    if (!currentPhoto) return;
    if (!isTauri()) return;

    // Update window title
    getCurrentWindow()
      .setTitle(`照片详情 - ${currentPhoto.fileName}`)
      .catch(() => {});

    // Set image src
    setImgSrc(convertFileSrc(currentPhoto.filePath));

    // Sync form state from photo data
    setRating(currentPhoto.rating);
    setColorLabel(currentPhoto.colorLabel);
    setFlag(currentPhoto.flag);
    setNotes(currentPhoto.notes);
  }, [currentPhoto]);

  // Auto-save: debounce 400ms on form changes
  const doSave = useCallback(
    (r: number, cl: string, f: string, n: string) => {
      if (!photoId || !isTauri()) return;
      const serialized = `${r}|${cl}|${f}|${n}`;
      if (serialized === lastSavedRef.current) return;
      updatePhotoMeta({ photoId, rating: r, colorLabel: cl, flag: f, notes: n })
        .then(() => {
          lastSavedRef.current = serialized;
          // Sync to main window store
          updateStore(photoId, {
            rating: r,
            colorLabel: cl,
            flag: f,
            notes: n,
          });
        })
        .catch(console.error);
    },
    [photoId, updateStore],
  );

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      doSave(rating, colorLabel, flag, notes);
    }, 400);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [rating, colorLabel, flag, notes, doSave]);

  // Image error → L2 fallback
  const handleImgError = useCallback(async () => {
    if (imgError || !currentPhoto) return;
    setImgError(true);
    try {
      const l2 = await getPreviewImage(currentPhoto.filePath);
      setImgSrc(convertFileSrc(l2));
    } catch {
      console.warn("L2 fallback failed");
    }
  }, [imgError, currentPhoto]);

  // Navigation
  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      window.location.hash = `#/photo/${allPhotos[currentIndex - 1].id}`;
    } else if (allPhotos.length > 0) {
      window.location.hash = `#/photo/${allPhotos[allPhotos.length - 1].id}`;
    }
  }, [currentIndex, allPhotos]);

  const goNext = useCallback(() => {
    if (currentIndex < allPhotos.length - 1) {
      window.location.hash = `#/photo/${allPhotos[currentIndex + 1].id}`;
    } else if (allPhotos.length > 0) {
      window.location.hash = `#/photo/${allPhotos[0].id}`;
    }
  }, [currentIndex, allPhotos]);

  // Global keyboard
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getCurrentWindow().close().catch(() => {});
        return;
      }
      if (e.key === "ArrowLeft") { goPrev(); return; }
      if (e.key === "ArrowRight") { goNext(); return; }
      if (e.key === "r") {
        e.preventDefault();
        setRotation((r) => (e.shiftKey ? r - 90 : r + 90));
      }
    },
    [goPrev, goNext],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  if (loading) {
    return (
      <div className="h-full bg-surface-950 flex items-center justify-center text-white/40 text-sm">
        加载中...
      </div>
    );
  }

  if (!currentPhoto) {
    return (
      <div className="h-full bg-surface-950 flex flex-col items-center justify-center gap-4 text-white/40 text-sm">
        <span>照片不存在</span>
        <button onClick={() => getCurrentWindow().close().catch(() => {})}
          className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
          关闭
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-surface-950 flex flex-col text-white">
      {/* Top toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0 border-b border-white/5">
        <button onClick={() => getCurrentWindow().close().catch(() => {})}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm text-white/80 truncate flex-1">{currentPhoto.fileName}</span>
        <button onClick={() => setRotation((r) => r - 90)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="逆时针旋转">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M1 4v6h6M23 20v-6h-6" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
          </svg>
        </button>
        <button onClick={() => setRotation((r) => r + 90)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" title="顺时针旋转">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M23 4v6h-6M1 20v-6h6" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
        </button>
      </div>

      {/* Main content: image + side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Image area */}
        <div className="flex-1 flex items-center justify-center overflow-hidden p-4">
          <TransformWrapper
            minScale={1}
            maxScale={8}
            doubleClick={{ mode: "zoomIn" }}
            wheel={{ step: 0.1 }}
            centerOnInit
          >
            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!flex !items-center !justify-center">
              <img
                src={imgSrc}
                alt={currentPhoto.fileName}
                style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.2s" }}
                className="max-w-full max-h-full object-contain select-none"
                draggable={false}
                onError={handleImgError}
              />
            </TransformComponent>
          </TransformWrapper>
        </div>

        {/* Side panel — EXIF + edit */}
        <div className="w-[320px] shrink-0 border-l border-white/5 overflow-y-auto bg-surface-900/80 backdrop-blur-xl">
          <div className="p-4 space-y-5">
            <section>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">EXIF 信息</h3>
              <ExifTable photo={currentPhoto} />
            </section>

            <section className="border-t border-white/5 pt-4">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">标记与评分</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-2xs text-white/30 mb-1.5">评分</p>
                  <RatingStars value={rating} onChange={setRating} />
                </div>
                <div>
                  <p className="text-2xs text-white/30 mb-1.5">颜色标签</p>
                  <ColorButtons value={colorLabel} onChange={setColorLabel} />
                </div>
                <div>
                  <p className="text-2xs text-white/30 mb-1.5">旗标</p>
                  <FlagButtons value={flag} onChange={setFlag} />
                </div>
                <div>
                  <p className="text-2xs text-white/30 mb-1.5">备注</p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-white/80 resize-none focus:outline-none focus:border-white/20"
                    placeholder="添加备注..."
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-center gap-4 px-4 py-2.5 shrink-0 border-t border-white/5">
        <button onClick={goPrev}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-xs text-white/60">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          上一张
        </button>
        <span className="text-xs text-white/40 tabular-nums">
          {currentIndex + 1} / {allPhotos.length}
        </span>
        <button onClick={goNext}
          className="flex items-center gap-1 px-4 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-xs text-white/60">
          下一张
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
