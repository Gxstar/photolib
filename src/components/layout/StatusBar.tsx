import { useAppStore } from "../../stores/appStore";
import { HardDrive } from "lucide-react";

export function StatusBar() {
  const { photos, selectedIds, currentFolder, filter } = useAppStore();

  const selectedCount = selectedIds.size;

  return (
    <div className="flex items-center gap-4 h-6 px-3 bg-surface-900 border-t border-surface-700 text-[10px] text-surface-500">
      <span className="flex items-center gap-1">
        <HardDrive size={10} />
        {currentFolder || "未选择文件夹"}
      </span>
      <span>{photos.length} 张照片</span>
      {selectedCount > 0 && (
        <span className="text-accent-400">{selectedCount} 张已选择</span>
      )}
      <span className="flex-1" />
      <span>
        {filter.cameraModels.length > 0
          ? `筛选: ${filter.cameraModels.join(", ")}`
          : "无筛选"}
      </span>
    </div>
  );
}
