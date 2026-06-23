import { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { getPhotos, importPhotos, isTauri } from "../../api";
import type { ViewMode } from "../../types";
import {
  Grid3x3,
  List,
  Eye,
  Columns2,
  Upload,
  Search,
  PanelLeft,
  PanelRight,
  ArrowUpDown,
  Sun,
  Moon,
  Loader2,
} from "lucide-react";

const viewModes: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "grid", icon: <Grid3x3 size={14} />, label: "网格" },
  { mode: "list", icon: <List size={14} />, label: "列表" },
  { mode: "preview", icon: <Eye size={14} />, label: "预览" },
  { mode: "compare", icon: <Columns2 size={14} />, label: "对比" },
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
    theme,
    toggleTheme,
  } = useAppStore();

  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      if (isTauri()) {
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

        const updatedPhotos = await getPhotos();
        useAppStore.getState().setPhotos(updatedPhotos);
      } else {
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
    <div className="flex items-center gap-2 h-12 px-3 glass-panel shrink-0 relative z-10">
      {/* App brand */}
      <div className="flex items-center gap-2.5 mr-2">
        <div className="w-7 h-7 rounded-xl bg-accent-500 flex items-center justify-center shadow-sm shadow-accent-500/20">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-accent-600 dark:text-accent-400 tracking-tight hidden sm:inline">PhotoLib</span>
      </div>

      <div className="w-px h-6 bg-surface-200/60 dark:bg-surface-200/20 mx-0.5" />

      {/* Panel toggles */}
      <button
        onClick={toggleLeftPanel}
        className={`p-2 rounded-full transition-all duration-200 ${leftPanelOpen ? "bg-accent-500/10 text-accent-600 dark:text-accent-400" : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-400 hover:bg-surface-100/70 dark:hover:bg-surface-100/50"}`}
        title="切换左侧面板"
      >
        <PanelLeft size={15} />
      </button>

      {/* View modes */}
      <div className="flex items-center bg-surface-100/60 dark:bg-surface-100/40 backdrop-blur-sm rounded-full p-0.5 gap-0.5 border border-surface-200/40 dark:border-surface-200/20">
        {viewModes.map(({ mode, icon, label }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`p-1.5 rounded-full transition-all duration-200 ${viewMode === mode ? "bg-white dark:bg-surface-0 text-surface-800 dark:text-surface-200 shadow-sm" : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-400"}`}
            title={label}
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-surface-200/60 dark:bg-surface-200/20 mx-0.5" />

      {/* Sort */}
      <div className="flex items-center gap-1.5 bg-surface-100/60 dark:bg-surface-100/40 backdrop-blur-sm rounded-full px-3 py-1.5 border border-surface-200/40 dark:border-surface-200/20">
        <ArrowUpDown size={12} className="text-surface-400" />
        <select
          value={sortBy}
          onChange={(e) => setSort(e.target.value, sortOrder)}
          className="bg-transparent text-surface-700 dark:text-surface-300 text-xs outline-none cursor-pointer"
        >
          {sortOptions.map((opt) => (
            <option key={opt.by} value={opt.by}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={() => setSort(sortBy, sortOrder === "asc" ? "desc" : "asc")}
          className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-400 transition-colors text-xs font-medium"
          title={sortOrder === "asc" ? "升序" : "降序"}
        >
          {sortOrder === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <div className="flex items-center gap-2 bg-surface-100/60 dark:bg-surface-100/40 backdrop-blur-sm rounded-full px-3.5 py-1.5 border border-transparent focus-within:border-accent-300/50 focus-within:shadow-soft transition-all">
        <Search size={13} className="text-surface-400" />
        <input
          type="text"
          placeholder="搜索文件名..."
          className="bg-transparent text-xs text-surface-800 dark:text-surface-200 outline-none w-40 placeholder:text-surface-400"
          onChange={(e) => useAppStore.getState().setFilter({ searchText: e.target.value })}
        />
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-2xs font-medium transition-all duration-200 bg-surface-100/60 dark:bg-surface-100/40 hover:bg-surface-200/50 dark:hover:bg-surface-200/30 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 border border-surface-200/40 dark:border-surface-200/20"
        title={theme === "light" ? "切换暗色主题" : "切换亮色主题"}
      >
        {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
        {theme === "light" ? "暗色" : "亮色"}
      </button>

      {/* Import button */}
      <button
        onClick={handleImport}
        disabled={importing}
        className="flex items-center gap-1.5 px-4 py-1.5 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-full transition-all shadow-sm shadow-accent-500/20 hover:shadow-md hover:shadow-accent-500/30"
        title="导入照片"
      >
        {importing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
        导入
      </button>

      <div className="w-px h-6 bg-surface-200/60 dark:bg-surface-200/20 mx-0.5" />

      <button
        onClick={toggleRightPanel}
        className={`p-2 rounded-full transition-all duration-200 ${rightPanelOpen ? "bg-accent-500/10 text-accent-600 dark:text-accent-400" : "text-surface-400 hover:text-surface-600 dark:hover:text-surface-400 hover:bg-surface-100/70 dark:hover:bg-surface-100/50"}`}
        title="切换右侧面板"
      >
        <PanelRight size={15} />
      </button>
    </div>
  );
}
