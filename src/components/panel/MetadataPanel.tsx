import { useAppStore } from "../../stores/appStore";
import type { Photo } from "../../types";
import { Camera, Aperture, Timer, Sun, MapPin, FileImage, Ruler, Calendar, Star, Flag, Tag, Hash, ChevronDown } from "lucide-react";
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

  return (
    <div className="flex flex-col">
      <div className="px-3 py-2 text-xs font-semibold text-surface-500 uppercase tracking-wider flex items-center gap-1.5">
        <FileImage size={13} />
        元数据
      </div>
      <div className="pb-2 px-2.5 space-y-1.5">
        <MetaSection title="文件信息" icon={<Hash size={11} />} defaultOpen>
          <MetaRow label="文件名" value={photo.fileName} />
          <MetaRow label="类型" value={photo.mediaType.toUpperCase()} />
          {photo.imageWidth > 0 && photo.imageHeight > 0 && (
            <MetaRow label="尺寸" value={`${photo.imageWidth} × ${photo.imageHeight}`} />
          )}
          <MetaRow label="大小" value={formatFileSize(photo.fileSize)} />
        </MetaSection>

        <MetaSection title="相机" icon={<Camera size={11} />}>
          <MetaRow label="制造商" value={photo.cameraMake} />
          <MetaRow label="型号" value={photo.cameraModel} />
          <MetaRow label="镜头" value={photo.lensModel} />
          <MetaRow label="镜头品牌" value={photo.lensMake} />
        </MetaSection>

        <MetaSection title="曝光参数" icon={<Aperture size={11} />}>
          <MetaRow label="拍摄时间" value={formatDate(photo.dateTaken)} icon={<Calendar size={9} />} />
          <MetaRow label="快门" value={photo.shutterSpeed} icon={<Timer size={9} />} />
          <MetaRow label="光圈" value={`f/${photo.aperture}`} icon={<Aperture size={9} />} />
          <MetaRow label="ISO" value={`${photo.iso}`} icon={<Sun size={9} />} />
          <MetaRow label="曝光补偿" value={`${photo.exposureComp > 0 ? "+" : ""}${photo.exposureComp} EV`} />
          <MetaRow label="曝光程序" value={photo.exposureProgram} />
          <MetaRow label="焦距" value={`${photo.focalLength}mm`} icon={<Ruler size={9} />} />
          <MetaRow label="35mm" value={photo.focalLength35mm ? `${photo.focalLength35mm}mm` : ""} />
          <MetaRow label="最大光圈" value={photo.maxAperture ? `f/${photo.maxAperture}` : ""} />
          <MetaRow label="闪光灯" value={photo.flash ? "开启" : "关闭"} />
          <MetaRow label="白平衡" value={photo.whiteBalance} />
          <MetaRow label="测光模式" value={photo.meteringMode} />
          <MetaRow label="场景" value={photo.sceneCaptureType} />
          <MetaRow label="对比度" value={photo.contrast} />
        </MetaSection>

        {(photo.latitude || photo.longitude) && (
          <MetaSection title="GPS" icon={<MapPin size={11} />}>
            <MetaRow label="坐标" value={`${photo.latitude!.toFixed(6)}, ${photo.longitude!.toFixed(6)}`} />
            {photo.altitude != null && (
              <MetaRow label="海拔" value={`${(photo.altitude as number).toFixed(1)}m`} />
            )}
          </MetaSection>
        )}

        <MetaSection title="标记" icon={<Tag size={11} />}>
          <MetaRow label="评分" value={"★".repeat(photo.rating) + "☆".repeat(5 - photo.rating)} icon={<Star size={9} />} />
          <MetaRow label="色标" value={photo.colorLabel || "无"} />
          <MetaRow label="旗标" value={photo.flag === "pick" ? "Pick" : photo.flag === "reject" ? "Reject" : "无"} icon={<Flag size={9} />} />
          {photo.notes && <MetaRow label="备注" value={photo.notes} />}
        </MetaSection>
      </div>
    </div>
  );
}

function MetaSection({ title, children, icon, defaultOpen }: { title: string; children: React.ReactNode; icon?: React.ReactNode; defaultOpen?: boolean }) {
  const [collapsed, setCollapsed] = useState(!(defaultOpen ?? false));
  return (
    <div className="bg-surface-100/40 dark:bg-surface-100/20 rounded-xl border border-surface-200/30 dark:border-surface-200/15 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1.5 px-2.5 py-2 text-2xs font-semibold text-surface-500 uppercase tracking-wider hover:bg-surface-100/50 dark:hover:bg-surface-100/20 transition-colors"
      >
        <ChevronDown size={10} className={`transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`} />
        {icon}
        {title}
      </button>
      {!collapsed && <div className="pb-1.5">{children}</div>}
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
    <div className="flex items-start gap-2 px-2.5 py-0.5 text-xs group">
      {icon && <span className="text-surface-400 mt-px shrink-0">{icon}</span>}
      <span className="text-surface-400 shrink-0 w-12 text-2xs leading-5">{label}</span>
      <span className="text-surface-700 dark:text-surface-300 break-all leading-5 font-medium">{value}</span>
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
