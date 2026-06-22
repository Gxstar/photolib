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
    <div className="flex items-center gap-4 h-7 px-3 bg-surface-50 dark:bg-surface-50 border-t border-surface-200 dark:border-surface-200 text-2xs text-surface-500 shrink-0">
      <span className="flex items-center gap-1.5">
        <HardDrive size={11} className="text-surface-400" />
        <span className="truncate max-w-[200px]">{currentFolder || "未选择文件夹"}</span>
      </span>

      <div className="w-px h-3 bg-surface-200 dark:bg-surface-200" />

      <span className="flex items-center gap-1.5">
        <Image size={11} className="text-surface-400" />
        {photos.length} 张照片
      </span>

      {selectedCount > 0 && (
        <>
          <div className="w-px h-3 bg-surface-200 dark:bg-surface-200" />
          <span className="flex items-center gap-1.5 text-accent-600 dark:text-accent-400 font-medium">
            <CheckSquare size={11} />
            {selectedCount} 张已选择
          </span>
        </>
      )}

      {hasActiveFilter && (
        <>
          <div className="w-px h-3 bg-surface-200 dark:bg-surface-200" />
          <span className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400">
            <Filter size={11} />
            筛选中
          </span>
        </>
      )}

      <span className="flex-1" />

      <span className="text-surface-400">
        PhotoLib v0.1.0
      </span>
    </div>
  );
}
