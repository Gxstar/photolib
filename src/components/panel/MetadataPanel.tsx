import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import {
  Camera, Aperture, Timer, Sun, MapPin, FileImage,
  Star, Flag, Tag, ChevronDown, Hash, Ruler, Navigation,
} from "lucide-react";
import { useState } from "react";

export function MetadataPanel() {
  const { photos, selectedIds } = useAppStore();
  const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
  const photo = selectedPhotos.length === 1 ? selectedPhotos[0] : null;

  if (!photo) {
    return (
      <div className="flex flex-col">
        <div className="px-3 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1.5">
          <FileImage size={13} />
          元数据
        </div>
        <div className="flex items-center justify-center py-8 text-surface-400 text-xs px-4 text-center">
          {selectedPhotos.length === 0
            ? "选中一张照片查看 EXIF 信息"
            : `已选择 ${selectedPhotos.length} 张照片`}
        </div>
      </div>
    );
  }

  const megapixels = photo.imageWidth > 0 && photo.imageHeight > 0
    ? ((photo.imageWidth * photo.imageHeight) / 1_000_000).toFixed(1)
    : null;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1.5">
        <FileImage size={13} />
        元数据
      </div>

      <div className="pb-2 px-2.5 space-y-2">

        {/* ========== Hero: 文件名 + 基本信息 ========== */}
        <div className="bg-surface-100/40 dark:bg-surface-100/20 rounded-xl border border-surface-200/30 dark:border-surface-200/15 p-3 space-y-2">
          {/* 文件名 */}
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-200 break-all leading-snug">
            {photo.fileName}
          </h3>

          {/* 日期 · 大小 · 分辨率 */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs text-surface-400">
            {(() => {
              const items: string[] = [];
              const d = formatDateShort(photo.dateTaken);
              if (d) items.push(d);
              items.push(formatFileSize(photo.fileSize));
              if (photo.imageWidth > 0 && photo.imageHeight > 0) {
                let s = `${photo.imageWidth} × ${photo.imageHeight}`;
                if (megapixels) s += ` · ${megapixels} MP`;
                items.push(s);
              }
              return items.map((text, i) => (
                <>
                  {i > 0 && <span className="text-surface-300">·</span>}
                  <span key={i}>{text}</span>
                </>
              ));
            })()}
          </div>

          {/* 评分 + 色标 + 旗标 */}
          <div className="flex items-center gap-2">
            {photo.rating > 0 && (
              <div className="flex gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={11}
                    className={i < photo.rating ? "text-yellow-500 fill-yellow-500" : "text-surface-300"}
                  />
                ))}
              </div>
            )}
            {photo.colorLabel && (
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: labelColor(photo.colorLabel) }}
              />
            )}
            {photo.flag === "pick" && (
              <span className="text-2xs font-medium text-green-600 dark:text-green-400">Pick</span>
            )}
            {photo.flag === "reject" && (
              <span className="text-2xs font-medium text-red-600 dark:text-red-400">Reject</span>
            )}
          </div>
        </div>

        {/* ========== 相机信息 ========== */}
        <InfoCard>
          <InfoRow
            icon={<Camera size={14} className="text-surface-400" />}
            label="相机"
            value={cameraDisplay(photo)}
          />
          <InfoRow
            icon={<Aperture size={14} className="text-surface-400" />}
            label="镜头"
            value={photo.lensModel}
          />
          {photo.imageWidth > 0 && photo.imageHeight > 0 && (
            <InfoRow
              icon={<Hash size={14} className="text-surface-400" />}
              label="分辨率"
              value={`${photo.imageWidth} × ${photo.imageHeight}${megapixels ? ` · ${megapixels} MP` : ""}`}
            />
          )}
        </InfoCard>

        {/* ========== 曝光参数 — 2×3 网格 ========== */}
        <InfoCard>
          <div className="grid grid-cols-3 gap-y-3 gap-x-2">
            <GridCell label="ISO" value={`${photo.iso || "—"}`} />
            <GridCell label="光圈" value={photo.aperture ? `f/${photo.aperture}` : "—"} />
            <GridCell label="曝光补偿" value={photo.exposureComp ? `${photo.exposureComp > 0 ? "+" : ""}${photo.exposureComp.toFixed(2)} EV` : "—"} />
            <GridCell label="快门" value={photo.shutterSpeed || "—"} />
            <GridCell label="焦距" value={photo.focalLength ? `${photo.focalLength}mm` : "—"} />
            <GridCell label="测光模式" value={photo.meteringMode || "—"} />
          </div>
        </InfoCard>

        {/* ========== GPS ========== */}
        {(photo.latitude || photo.longitude) && (
          <InfoCard>
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-accent-500 shrink-0" />
              <span className="text-xs font-medium text-accent-600 dark:text-accent-400">
                {photo.latitude?.toFixed(4)}°N {photo.longitude?.toFixed(4)}°E
              </span>
              {photo.altitude != null && (
                <span className="text-2xs text-surface-400">{photo.altitude.toFixed(1)}m</span>
              )}
            </div>
          </InfoCard>
        )}

        {/* ========== 更多参数（折叠） ========== */}
        <MoreSection photo={photo} />

      </div>
    </div>
  );
}

// ==================== Components ====================

function InfoCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface-100/40 dark:bg-surface-100/20 rounded-xl border border-surface-200/30 dark:border-surface-200/15 p-2.5 space-y-2">
      {children}
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 w-5 flex justify-center">{icon}</span>
      <span className="text-2xs text-surface-400 shrink-0 w-10">{label}</span>
      <span
        title={value}
        className="flex-1 text-right text-xs font-medium text-surface-700 dark:text-surface-300 truncate"
      >
        {value}
      </span>
    </div>
  );
}

function GridCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center" title={`${label}: ${value}`}>
      <div className="text-2xs text-surface-400 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-surface-800 dark:text-surface-200 truncate">{value}</div>
    </div>
  );
}

function MoreSection({ photo }: { photo: Photo }) {
  const [open, setOpen] = useState(false);
  const hasMore =
    photo.focalLength35mm ||
    photo.maxAperture ||
    photo.flash ||
    photo.whiteBalance ||
    photo.meteringMode ||
    photo.exposureProgram ||
    photo.sceneCaptureType ||
    photo.contrast ||
    photo.software ||
    photo.copyright ||
    photo.notes;

  if (!hasMore) return null;

  return (
    <div className="bg-surface-100/40 dark:bg-surface-100/20 rounded-xl border border-surface-200/30 dark:border-surface-200/15 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-2xs font-semibold text-surface-500 uppercase tracking-wider hover:bg-surface-100/50 dark:hover:bg-surface-100/20 transition-colors"
      >
        <ChevronDown size={10} className={`transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
        <Tag size={11} />
        更多
      </button>
      {open && (
        <div className="px-2.5 pb-2.5 pt-1 space-y-1">
          {photo.focalLength35mm ? <MetaRow label="35mm焦距" value={`${photo.focalLength35mm}mm`} /> : null}
          {photo.maxAperture ? <MetaRow label="最大光圈" value={`f/${photo.maxAperture}`} /> : null}
          {photo.exposureProgram ? <MetaRow label="曝光程序" value={photo.exposureProgram} /> : null}
          {photo.whiteBalance ? <MetaRow label="白平衡" value={photo.whiteBalance} /> : null}
          {photo.meteringMode ? <MetaRow label="测光模式" value={photo.meteringMode} /> : null}
          {photo.flash ? <MetaRow label="闪光灯" value={photo.flash} /> : null}
          {photo.sceneCaptureType ? <MetaRow label="场景" value={photo.sceneCaptureType} /> : null}
          {photo.contrast ? <MetaRow label="对比度" value={photo.contrast} /> : null}
          {photo.software ? <MetaRow label="软件" value={photo.software} /> : null}
          {photo.copyright ? <MetaRow label="版权" value={photo.copyright} /> : null}
          {photo.notes ? <MetaRow label="备注" value={photo.notes} /> : null}
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-surface-400 shrink-0 w-14 text-2xs">{label}</span>
      <span
        title={`${label}: ${value}`}
        className="text-surface-700 dark:text-surface-300 font-medium truncate"
      >
        {value}
      </span>
    </div>
  );
}

// ==================== Helpers ====================

function cameraDisplay(photo: Photo): string {
  const make = photo.cameraMake?.replace(/\s+$/, "");
  const model = photo.cameraModel;
  if (make && model && model.startsWith(make)) return model;
  if (make && model) return `${make} ${model}`;
  return model || make || "—";
}

function labelColor(label: string): string {
  const map: Record<string, string> = {
    red: "#ef4444", blue: "#3b82f6", green: "#22c55e",
    yellow: "#eab308", purple: "#a855f7",
  };
  return map[label] || "#999";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
