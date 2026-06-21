import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { importPhotos, detectRemovableDrives, isTauri } from "../../api";
import type { ViewMode } from "../../types";
import {
  Grid3x3,
  List,
  Eye,
  Columns2,
  Upload,
  Search,
  SlidersHorizontal,
  PanelLeft,
  PanelRight,
  Star,
  Flag,
  Download,
  Loader2,
} from "lucide-react";

const viewModes: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "grid", icon: <Grid3x3 size={16} />, label: "网格" },
  { mode: "list", icon: <List size={16} />, label: "列表" },
  { mode: "preview", icon: <Eye size={16} />, label: "预览" },
  { mode: "compare", icon: <Columns2 size={16} />, label: "对比" },
];

const sortOptions = [
  { by: "dateTaken", label: "拍摄时间" },
  { by: "fileName", label: "文件名" },
  { by: "rating", label: "评分" },
  { by: "iso", label: "ISO" },
  { by: "fileSize", label: "文件大小" },
];

export function Toolbar() {
  const {
    viewMode,
    setViewMode,
    leftPanelOpen,
    rightPanelOpen,
    toggleLeftPanel,
    toggleRightPanel,
    sortBy,
    sortOrder,
    setSort,
    photos,
    filter,
  } = useAppStore();

  const [importing, setImporting] = useState(false);
  const filteredCount = photos.length; // TODO: apply filter

  const handleImport = async () => {
    setImporting(true);
    try {
      if (isTauri()) {
        // 使用 Tauri dialog 选择文件夹
        const { open } = await import("@tauri-apps/plugin-dialog");
        const sourceDir = await open({
          directory: true,
          title: "选择要导入的文件夹（存储卡等）",
        });
        if (!sourceDir || typeof sourceDir !== "string") {
          setImporting(false);
          return;
        }

        const destDir = await open({
          directory: true,
          title: "选择导入目标文件夹",
        });
        if (!destDir || typeof destDir !== "string") {
          setImporting(false);
          return;
        }

        const count = await importPhotos(sourceDir, destDir);
        alert(`成功导入 ${count} 张照片`);

        // 导入后刷新照片列表
        const { getPhotos } = await import("../../api");
        const updatedPhotos = await getPhotos();
        useAppStore.getState().setPhotos(updatedPhotos);
      } else {
        // 浏览器开发模式：用 prompt 模拟
        const source = prompt("输入源文件夹路径：", "D:/SD_CARD/DCIM");
        const dest = prompt("输入目标文件夹路径：", "D:/Photos/import");
        if (source && dest) {
          const count = await importPhotos(source, dest);
          alert(`[开发模式] 模拟导入 ${count} 张照片`);
        }
      }
    } catch (err) {
      console.error("Import failed:", err);
      alert(`导入失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex items-center gap-1 h-10 px-2 bg-surface-900 border-b border-surface-700">
      {/* Panel toggles */}
      <button
        onClick={toggleLeftPanel}
        className={`p-1.5 rounded transition-colors ${leftPanelOpen ? "bg-accent-500/20 text-accent-400" : "text-surface-400 hover:bg-surface-800"}`}
        title="切换左侧面板"
      >
        <PanelLeft size={14} />
      </button>

      <div className="w-px h-5 bg-surface-700 mx-1" />

      {/* View modes */}
      {viewModes.map(({ mode, icon, label }) => (
        <button
          key={mode}
          onClick={() => setViewMode(mode)}
          className={`p-1.5 rounded transition-colors ${viewMode === mode ? "bg-surface-700 text-surface-100" : "text-surface-400 hover:bg-surface-800"}`}
          title={label}
        >
          {icon}
        </button>
      ))}

      <div className="w-px h-5 bg-surface-700 mx-1" />

      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => setSort(e.target.value, sortOrder)}
        className="bg-surface-800 text-surface-200 text-[11px] px-2 py-1 rounded border border-surface-700 outline-none"
      >
        {sortOptions.map((opt) => (
          <option key={opt.by} value={opt.by}>{opt.label}</option>
        ))}
      </select>

      <button
        onClick={() => setSort(sortBy, sortOrder === "asc" ? "desc" : "asc")}
        className="p-1 text-surface-400 hover:text-surface-200 text-[11px]"
        title={sortOrder === "asc" ? "升序 ↑" : "降序 ↓"}
      >
        {sortOrder === "asc" ? "↑" : "↓"}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-1 bg-surface-800 rounded px-2 py-1 border border-surface-700">
        <Search size={12} className="text-surface-500" />
        <input
          type="text"
          placeholder="搜索文件名..."
          className="bg-transparent text-[11px] text-surface-200 outline-none w-36 placeholder:text-surface-600"
          onChange={(e) => useAppStore.getState().setFilter({ searchText: e.target.value })}
        />
      </div>

      {/* Import button */}
      <button
        onClick={handleImport}
        disabled={importing}
        className="flex items-center gap-1 px-3 py-1.5 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white text-xs rounded transition-colors ml-2"
        title="导入照片"
      >
        {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        导入
      </button>

      <div className="w-px h-5 bg-surface-700 mx-1" />

      <button
        onClick={toggleRightPanel}
        className={`p-1.5 rounded transition-colors ${rightPanelOpen ? "bg-accent-500/20 text-accent-400" : "text-surface-400 hover:bg-surface-800"}`}
        title="切换右侧面板"
      >
        <PanelRight size={14} />
      </button>
    </div>
  );
}
