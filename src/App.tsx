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
  } = useAppStore();

  // Apply filters & sort
  const filteredPhotos = photos
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
      if (typeof va === "string" && typeof vb === "string") {
        return sortOrder === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (typeof va === "number" && typeof vb === "number") {
        return sortOrder === "asc" ? va - vb : vb - va;
      }
      return 0;
    });

  return (
    <div className="h-full flex flex-col bg-surface-950">
      {/* Toolbar */}
      <Toolbar />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel */}
        {leftPanelOpen && (
          <div className="w-56 shrink-0 border-r border-surface-700 overflow-hidden">
            <LeftPanel />
          </div>
        )}

        {/* Center: thumbnail grid — always visible, handles empty state internally */}
        <div className="flex-1 overflow-hidden bg-surface-950">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="text-red-400 text-sm">{error}</div>
              <button
                onClick={() => window.location.reload()}
                className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-surface-200 text-xs rounded transition-colors"
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
          <div className="w-64 shrink-0 border-l border-surface-700 bg-surface-900 overflow-hidden flex flex-col">
            <FilterPanel />
            <div className="flex-1 min-h-0 border-t border-surface-800">
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
