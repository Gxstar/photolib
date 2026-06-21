import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { Camera, Aperture, Timer, Sun, MapPin, Maximize } from "lucide-react";
import { useState } from "react";

export function MetadataPanel() {
  const { photos, selectedIds } = useAppStore();
  const selectedPhotos = photos.filter((p) => selectedIds.has(p.id));
  const photo = selectedPhotos.length === 1 ? selectedPhotos[0] : null;

  if (!photo) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 text-[11px] font-semibold text-surface-400 uppercase tracking-wider border-b border-surface-800">
          元数据
        </div>
        <div className="flex-1 flex items-center justify-center text-surface-500 text-xs px-4 text-center">
          {selectedPhotos.length === 0
            ? "选中一张照片查看 EXIF 信息"
            : "多选时显示摘要（开发中）"}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-[11px] font-semibold text-surface-400 uppercase tracking-wider border-b border-surface-800">
        元数据
      </div>
      <div className="flex-1 overflow-auto">
        {/* File info */}
        <MetadataSection title="文件信息">
          <MetaRow label="文件名" value={photo.fileName} />
          <MetaRow label="类型" value={photo.mediaType.toUpperCase()} />
          <MetaRow label="尺寸" value={`${photo.imageWidth} × ${photo.imageHeight}`} />
          <MetaRow label="大小" value={formatFileSize(photo.fileSize)} />
          <MetaRow label="色彩空间" value={photo.colorSpace} />
        </MetadataSection>

        {/* Camera */}
        <MetadataSection title="相机">
          <MetaRow label="制造商" value={photo.cameraMake} icon={<Camera size={11} />} />
          <MetaRow label="型号" value={photo.cameraModel} />
          <MetaRow label="镜头" value={photo.lensModel} />
        </MetadataSection>

        {/* Exposure */}
        <MetadataSection title="曝光参数">
          <MetaRow label="拍摄时间" value={formatDate(photo.dateTaken)} />
          <MetaRow label="快门速度" value={photo.shutterSpeed} icon={<Timer size={11} />} />
          <MetaRow label="光圈" value={`f/${photo.aperture}`} icon={<Aperture size={11} />} />
          <MetaRow label="ISO" value={`${photo.iso}`} icon={<Sun size={11} />} />
          <MetaRow label="曝光补偿" value={`${photo.exposureComp > 0 ? "+" : ""}${photo.exposureComp} EV`} />
          <MetaRow label="焦距" value={`${photo.focalLength}mm`} />
          <MetaRow label="闪光灯" value={photo.flash ? "开启" : "关闭"} />
          <MetaRow label="白平衡" value={photo.whiteBalance} />
          <MetaRow label="测光模式" value={photo.meteringMode} />
        </MetadataSection>

        {/* GPS */}
        {(photo.latitude || photo.longitude) && (
          <MetadataSection title="GPS">
            <MetaRow
              label="坐标"
              value={`${photo.latitude!.toFixed(6)}, ${photo.longitude!.toFixed(6)}`}
              icon={<MapPin size={11} />}
            />
            {photo.altitude != null && (
              <MetaRow label="海拔" value={`${(photo.altitude as number).toFixed(1)}m`} />
            )}
          </MetadataSection>
        )}

        {/* Rating */}
        <MetadataSection title="标记">
          <MetaRow label="评分" value={"★".repeat(photo.rating) + "☆".repeat(5 - photo.rating)} />
          <MetaRow label="色标" value={photo.colorLabel || "无"} />
          <MetaRow label="旗标" value={photo.flag === "pick" ? "✓ Pick" : photo.flag === "reject" ? "✗ Reject" : "无"} />
          {photo.notes && <MetaRow label="备注" value={photo.notes} />}
        </MetadataSection>
      </div>
    </div>
  );
}

function MetadataSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="border-b border-surface-800">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1 px-3 py-1.5 text-[10px] text-surface-500 uppercase tracking-wider hover:bg-surface-800 transition-colors"
      >
        <span className="transition-transform" style={{ transform: collapsed ? "rotate(-90deg)" : "" }}>▾</span>
        {title}
      </button>
      {!collapsed && <div className="pb-1">{children}</div>}
    </div>
  );
}

function MetaRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-0.5 text-[11px]">
      {icon && <span className="text-surface-500 mt-px">{icon}</span>}
      <span className="text-surface-500 shrink-0 w-14">{label}</span>
      <span className="text-surface-200 break-all">{value}</span>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
