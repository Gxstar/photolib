import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "../../stores/appStore";
import { getPreviewImage, isTauri } from "../../api";
import { convertFileSrc } from "@tauri-apps/api/core";
import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails/styles.css";
import "yet-another-react-lightbox/plugins/counter/styles.css";
import type { Photo } from "../../types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function ExifPanel({ photo }: { photo: Photo }) {
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
    <div className="fixed right-0 top-0 bottom-0 w-[280px] z-[100] bg-surface-900/90 backdrop-blur-xl border-l border-white/10 overflow-y-auto animate-fade-in">
      <div className="p-4 space-y-2">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">EXIF 信息</h3>
        <div className="divide-y divide-white/5">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2">
              <p className="text-2xs text-white/30">{label}</p>
              <p className="text-xs text-white/80 break-all">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function l2src(photo: Photo): string {
  if (isTauri()) {
    return convertFileSrc(photo.filePath);
  }
  return `file://${photo.filePath.replace(/\\/g, "/")}`;
}

export function PhotoPreview({
  photos,
  onClose,
}: {
  photos: Photo[];
  onClose: () => void;
}) {
  const { previewPhotoId, setPreviewPhotoId } = useAppStore();
  const [showExif, setShowExif] = useState(true);
  const [rotationMap, setRotationMap] = useState<Map<number, number>>(new Map());
  const [fallbackMap, setFallbackMap] = useState<Map<number, string>>(new Map());

  const currentIndex = photos.findIndex(p => p.id === previewPhotoId);

  const slides = useMemo(() => photos.map((p, i) => ({
    src: fallbackMap.get(i) || l2src(p),
    width: p.imageWidth || undefined,
    height: p.imageHeight || undefined,
    alt: p.fileName,
  })), [photos, fallbackMap]);

  const handleSlideError = useCallback(async (index: number) => {
    if (fallbackMap.has(index)) return;
    const photo = photos[index];
    if (!photo) return;
    try {
      const cachePath = await getPreviewImage(photo.filePath);
      const src = isTauri() ? convertFileSrc(cachePath) : "";
      setFallbackMap(prev => new Map(prev).set(index, src));
    } catch {
      // stay on broken state
    }
  }, [photos, fallbackMap]);

  const handleViewChange = useCallback(({ index }: { index: number }) => {
    const photo = photos[index];
    if (photo) setPreviewPhotoId(photo.id);
  }, [photos, setPreviewPhotoId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "i" || e.key === "I") {
      setShowExif(v => !v);
      return;
    }
    if (e.key === "r" && previewPhotoId !== null) {
      e.preventDefault();
      setRotationMap(prev => {
        const next = new Map(prev);
        const current = next.get(previewPhotoId) || 0;
        next.set(previewPhotoId, e.shiftKey ? current - 90 : current + 90);
        return next;
      });
    }
  }, [previewPhotoId]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (previewPhotoId !== null && currentIndex === -1) {
      setPreviewPhotoId(null);
    }
  }, [previewPhotoId, currentIndex, setPreviewPhotoId]);

  if (previewPhotoId === null || currentIndex === -1) return null;

  const currentPhoto = photos[currentIndex];

  return (
    <div className="fixed inset-0 z-[99]">
      <Lightbox
        open={true}
        close={onClose}
        index={currentIndex}
        slides={slides}
        plugins={[Zoom, Fullscreen, Counter, Thumbnails, Slideshow]}
        animation={{ zoom: 300 }}
        zoom={{
          maxZoomPixelRatio: 4,
          zoomInMultiplier: 2,
          doubleTapDelay: 300,
        }}
        slideshow={{ delay: 3000 }}
        thumbnails={{ width: 80, height: 60 }}
        carousel={{ preload: 2, finite: false }}
        render={{
          slide: ({ offset }) => {
            const idx = currentIndex + offset;
            const photo = photos[idx];
            if (!photo) return null;
            const rotation = rotationMap.get(photo.id) || 0;
            return (
              // eslint-disable-next-line jsx-a11y/alt-text
              <img
                src={slides[idx].src}
                alt={photo.fileName}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: "transform 0.2s",
                }}
                className="max-w-full max-h-full object-contain"
                onError={() => handleSlideError(idx)}
              />
            );
          },
        }}
        on={{
          view: handleViewChange,
        }}
      />
      {showExif && currentPhoto && (
        <ExifPanel photo={currentPhoto} />
      )}
    </div>
  );
}
