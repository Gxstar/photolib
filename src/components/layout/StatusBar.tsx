import { useAppStore } from "../../stores/appStore";
import { HardDrive, Image, CheckSquare, Filter } from "lucide-react";

export function StatusBar() {
  const { photos, selectedIds, currentFolder, filter } = useAppStore();

  const selectedCount = selectedIds.size;
  const hasActiveFilter =
    filter.cameraModels.length > 0 ||
    filter.lensModels.length > 0 ||
    filter.ratingMin > 0 ||
    filter.colorLabels.length > 0 ||
    filter.flag !== "" ||
    filter.searchText !== "";

  return (
    <div className="flex items-center gap-3 h-8 px-3 glass-panel border-t-0 text-2xs text-surface-500 shrink-0 relative z-10">
      <span className="flex items-center gap-1.5">
        <HardDrive size={11} className="text-surface-400" />
        <span className="truncate max-w-[200px]">{currentFolder || "未选择文件夹"}</span>
      </span>

      <span className="text-surface-300 dark:text-surface-500/50">·</span>

      <span className="flex items-center gap-1.5 tabular-nums">
        <Image size={11} className="text-surface-400" />
        {photos.length} 张照片
      </span>

      {selectedCount > 0 && (
        <>
          <span className="text-surface-300 dark:text-surface-500/50">·</span>
          <span className="flex items-center gap-1.5 text-accent-600 dark:text-accent-400 font-medium">
            <CheckSquare size={11} />
            {selectedCount} 张已选择
          </span>
        </>
      )}

      {hasActiveFilter && (
        <>
          <span className="text-surface-300 dark:text-surface-500/50">·</span>
          <span className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400">
            <Filter size={11} />
            筛选中
          </span>
        </>
      )}

      <span className="flex-1" />

      <span className="text-surface-400/70 text-3xs">
        PhotoLib v0.1.0
      </span>
    </div>
  );
}
