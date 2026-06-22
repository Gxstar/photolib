import { useEffect, useMemo } from "react";
import { useAppStore } from "./stores/appStore";
import { Toolbar } from "./components/layout/Toolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { LeftPanel } from "./components/panel/LeftPanel";
import { FilterPanel } from "./components/panel/FilterPanel";
import { MetadataPanel } from "./components/panel/MetadataPanel";
import { ThumbnailGrid } from "./components/browser/ThumbnailGrid";

export default function App() {
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
  } = useAppStore();

  // Initialize theme class on mount
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  // Apply filters & sort — useMemo 避免 EXIF event 到达时多次重算
  const filteredPhotos = useMemo(() => {
    return photos
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
        // null/空值统一排到最后，避免 EXIF 异步到达时列表反复跳跃
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
  }, [photos, filter, sortBy, sortOrder]);

  return (
    <div className="h-full flex flex-col bg-surface-0 dark:bg-surface-0 text-surface-900 dark:text-surface-100">
      {/* Toolbar */}
      <Toolbar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        {leftPanelOpen && (
          <div className="w-60 shrink-0 border-r border-surface-200 dark:border-surface-200 overflow-hidden bg-surface-50 dark:bg-surface-50">
            <LeftPanel />
          </div>
        )}

        {/* Center: thumbnail grid */}
        <div className="flex-1 overflow-hidden bg-surface-0 dark:bg-surface-0">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-red-500 text-sm font-medium">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-surface-100 dark:bg-surface-100 hover:bg-surface-200 dark:hover:bg-surface-200 text-surface-700 dark:text-surface-300 text-xs rounded-lg transition-colors font-medium"
              >
                重试
              </button>
            </div>
          ) : (
            <ThumbnailGrid photos={filteredPhotos} />
          )}
        </div>

        {/* Right panel */}
        {rightPanelOpen && (
          <div className="w-72 shrink-0 border-l border-surface-200 dark:border-surface-200 overflow-hidden flex flex-col bg-surface-50 dark:bg-surface-50">
            <FilterPanel />
            <div className="flex-1 min-h-0 border-t border-surface-200 dark:border-surface-200">
              <MetadataPanel />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}
