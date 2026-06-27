import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "./stores/appStore";
import { Toolbar } from "./components/layout/Toolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { LeftPanel } from "./components/panel/LeftPanel";
import { FilterPanel } from "./components/panel/FilterPanel";
import { MetadataPanel } from "./components/panel/MetadataPanel";
import { ThumbnailGrid } from "./components/browser/ThumbnailGrid";
import { PhotoDetail } from "./components/browser/PhotoDetail";
import { watchDirectory, unwatchDirectory, isTauri } from "./api";

function useHashDetail(): boolean {
  const [isDetail, setIsDetail] = useState(
    () => window.location.hash.startsWith("#/photo/"),
  );
  useEffect(() => {
    const handler = () => setIsDetail(window.location.hash.startsWith("#/photo/"));
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  return isDetail;
}

export default function App() {
  const isDetail = useHashDetail();

  // New Tauri window: detail page (hash routing)
  if (isDetail) {
    return <PhotoDetail />;
  }

  const {
    error,
    leftPanelOpen,
    rightPanelOpen,
    filter,
    sortBy,
    sortOrder,
    photos,
    theme,
    setTheme,
    currentDir,
    leftTab,
    selectedAlbumId,
    albums,
  } = useAppStore();

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Watch current directory for file changes
  useEffect(() => {
    if (!isTauri() || !currentDir || leftTab !== "directory") {
      if (isTauri()) unwatchDirectory().catch(() => {});
      return;
    }
    watchDirectory(currentDir).catch(() => {});
    return () => { unwatchDirectory().catch(() => {}); };
  }, [currentDir, leftTab]);

  const activePhotos = useMemo(() => {
    if (!selectedAlbumId) return photos;
    const album = albums.find((a) => a.id === selectedAlbumId);
    if (!album) return photos;
    return photos.filter((p) => p.filePath.startsWith(album.path));
  }, [photos, selectedAlbumId, albums]);

  const filteredPhotos = useMemo(() => {
    return activePhotos
      .filter((p) => {
        if (filter.cameraModels.length > 0 && !filter.cameraModels.includes(p.cameraModel)) return false;
        if (filter.lensModels.length > 0 && !filter.lensModels.includes(p.lensModel)) return false;
        if (p.focalLength < filter.focalLengthMin || p.focalLength > filter.focalLengthMax) return false;
        if (p.aperture < filter.apertureMin || p.aperture > filter.apertureMax) return false;
        if (p.iso < filter.isoMin || p.iso > filter.isoMax) return false;
        if (filter.ratingMin > 0 && p.rating < filter.ratingMin) return false;
        if (filter.colorLabels.length > 0 && !filter.colorLabels.includes(p.colorLabel)) return false;
        if (filter.flag && p.flag !== filter.flag) return false;
        if (filter.searchText && !p.fileName.toLowerCase().includes(filter.searchText.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        const key = sortBy as keyof typeof a;
        const va = a[key];
        const vb = b[key];
        if (va == null || (typeof va === "string" && va === "")) {
          return va == null ? 1 : (vb == null || (typeof vb === "string" && vb === "") ? 0 : 1);
        }
        if (vb == null || (typeof vb === "string" && vb === "")) return -1;
        if (typeof va === "string" && typeof vb === "string") {
          return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        if (typeof va === "number" && typeof vb === "number") {
          return sortOrder === "asc" ? va - vb : vb - va;
        }
        return 0;
      });
  }, [activePhotos, filter, sortBy, sortOrder]);

  // 持久化当前照片列表供 PhotoDetail 独立窗口使用
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("photolib-detail-photos", JSON.stringify(filteredPhotos.map((p) => p.id)));
      } catch {
        // 超大列表时可能配额不足，忽略即可
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [filteredPhotos]);

  return (
    <div className="h-full flex flex-col bg-surface-0 dark:bg-surface-0 text-surface-900 dark:text-surface-100 relative">
      <Toolbar />

      <div className="flex-1 flex overflow-hidden relative z-[1]">
        {leftPanelOpen && (
          <div className="w-64 shrink-0 overflow-hidden bg-surface-50/80 dark:bg-surface-50/80 backdrop-blur-sm border-r border-surface-200/60 dark:border-surface-200/30">
            <LeftPanel />
          </div>
        )}

        <div className="flex-1 overflow-hidden bg-transparent relative">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
              <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-red-500 text-sm font-medium">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2 bg-white/70 dark:bg-surface-100/70 backdrop-blur-sm hover:bg-white dark:hover:bg-surface-100 text-surface-700 dark:text-surface-300 text-xs rounded-full transition-all shadow-soft hover:shadow-soft-lg font-medium"
              >
                重试
              </button>
            </div>
          ) : (
            <ThumbnailGrid photos={filteredPhotos} />
          )}
        </div>

        {rightPanelOpen && (
          <div className="w-72 shrink-0 bg-surface-50/80 dark:bg-surface-50/80 backdrop-blur-sm border-l border-surface-200/60 dark:border-surface-200/30 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto">
              <FilterPanel activePhotos={activePhotos} />
              <div className="border-t border-surface-200/40 dark:border-surface-200/20" />
              <MetadataPanel />
            </div>
          </div>
        )}
      </div>

      <StatusBar />
    </div>
  );
}
