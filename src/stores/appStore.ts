import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { Photo, FilterState, ViewMode, Folder, DirectoryEntry, LeftPanelTab } from "../types";

export interface ExifPatch {
  id: number;
  filePath: string;
  dateTaken?: string | null;
  cameraMake?: string | null;
  cameraModel?: string | null;
  lensModel?: string | null;
  focalLength?: number | null;
  aperture?: number | null;
  shutterSpeed?: string | null;
  iso?: number | null;
  exposureComp?: number | null;
  flash?: number | null;
  whiteBalance?: string | null;
  meteringMode?: string | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
  colorSpace?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  software?: string | null;
  copyright?: string | null;
  imageDescription?: string | null;
  orientation?: number | null;
  exposureProgram?: string | null;
  maxAperture?: number | null;
  focalLength35mm?: number | null;
  lensMake?: string | null;
  sceneCaptureType?: string | null;
  contrast?: string | null;
}

interface AppState {
  // Loading & Error
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Photos
  photos: Photo[];
  setPhotos: (photos: Photo[]) => void;
  patchPhotos: (patches: ExifPatch[]) => void;

  // Theme
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;

  // Left panel tabs
  leftTab: LeftPanelTab;
  setLeftTab: (tab: LeftPanelTab) => void;

  // Directory browser (目录模式)
  currentDir: string;
  setCurrentDir: (dir: string) => void;
  dirEntries: DirectoryEntry[];
  setDirEntries: (entries: DirectoryEntry[]) => void;
  dirHistory: string[];  // 导航历史
  pushDirHistory: (dir: string) => void;
  popDirHistory: () => string | null;

  // Albums (相册模式)
  albums: Folder[];
  setAlbums: (albums: Folder[]) => void;
  selectedAlbumId: number | null;
  setSelectedAlbumId: (id: number | null) => void;
  currentFolder: string;
  setCurrentFolder: (path: string) => void;

  // Selection
  selectedIds: Set<number>;
  toggleSelect: (id: number, multi?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // View
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  thumbnailSize: number;
  setThumbnailSize: (size: number) => void;

  // Filter
  filter: FilterState;
  setFilter: (filter: Partial<FilterState>) => void;
  resetFilter: () => void;

  // Panels
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Sort
  sortBy: string;
  sortOrder: "asc" | "desc";
  setSort: (by: string, order: "asc" | "desc") => void;
}

const defaultFilter: FilterState = {
  cameraModels: [],
  lensModels: [],
  focalLengthMin: 0,
  focalLengthMax: 800,
  apertureMin: 0,
  apertureMax: 64,
  isoMin: 0,
  isoMax: 102400,
  dateFrom: "",
  dateTo: "",
  ratingMin: 0,
  colorLabels: [],
  flag: "",
  searchText: "",
};

function getInitialTheme(): "light" | "dark" {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("photolib-theme") as "light" | "dark" | null;
    if (saved) return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export const useAppStore = create<AppState>((set, get) => ({
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error }),

  photos: [],
  setPhotos: (photos) => set({ photos }),
  patchPhotos: (patches) => {
    if (patches.length === 0) return;
    set((s) => {
      // 用 Map 一次构建 O(n) 索引，避免 O(n*m) 查找
      const patchById = new Map<number, ExifPatch>();
      const patchByPath = new Map<string, ExifPatch>();
      for (const p of patches) {
        patchById.set(p.id, p);
        patchByPath.set(p.filePath, p);
      }
      const next = s.photos.map((photo) => {
        const patch = patchById.get(photo.id) || patchByPath.get(photo.filePath);
        if (!patch) return photo;
        // 只更新 patch 中提供的字段
        const updated: Photo = { ...photo };
        if (patch.dateTaken !== undefined) updated.dateTaken = patch.dateTaken || "";
        if (patch.cameraMake !== undefined) updated.cameraMake = patch.cameraMake || "";
        if (patch.cameraModel !== undefined) updated.cameraModel = patch.cameraModel || "";
        if (patch.lensModel !== undefined) updated.lensModel = patch.lensModel || "";
        if (patch.focalLength !== undefined) updated.focalLength = patch.focalLength || 0;
        if (patch.aperture !== undefined) updated.aperture = patch.aperture || 0;
        if (patch.shutterSpeed !== undefined) updated.shutterSpeed = patch.shutterSpeed || "";
        if (patch.iso !== undefined) updated.iso = patch.iso || 0;
        if (patch.exposureComp !== undefined) updated.exposureComp = patch.exposureComp || 0;
        if (patch.flash !== undefined) updated.flash = patch.flash || 0;
        if (patch.whiteBalance !== undefined) updated.whiteBalance = patch.whiteBalance || "";
        if (patch.meteringMode !== undefined) updated.meteringMode = patch.meteringMode || "";
        if (patch.imageWidth !== undefined) updated.imageWidth = patch.imageWidth || 0;
        if (patch.imageHeight !== undefined) updated.imageHeight = patch.imageHeight || 0;
        if (patch.colorSpace !== undefined) updated.colorSpace = patch.colorSpace || "";
        if (patch.latitude !== undefined) updated.latitude = patch.latitude ?? null;
        if (patch.longitude !== undefined) updated.longitude = patch.longitude ?? null;
        if (patch.altitude !== undefined) updated.altitude = patch.altitude ?? null;
        if (patch.software !== undefined) updated.software = patch.software || "";
        if (patch.copyright !== undefined) updated.copyright = patch.copyright || "";
        if (patch.imageDescription !== undefined) updated.imageDescription = patch.imageDescription || "";
        if (patch.orientation !== undefined) updated.orientation = patch.orientation || 0;
        if (patch.exposureProgram !== undefined) updated.exposureProgram = patch.exposureProgram || "";
        if (patch.maxAperture !== undefined) updated.maxAperture = patch.maxAperture || 0;
        if (patch.focalLength35mm !== undefined) updated.focalLength35mm = patch.focalLength35mm || 0;
        if (patch.lensMake !== undefined) updated.lensMake = patch.lensMake || "";
        if (patch.sceneCaptureType !== undefined) updated.sceneCaptureType = patch.sceneCaptureType || "";
        if (patch.contrast !== undefined) updated.contrast = patch.contrast || "";
        return updated;
      });
      return { photos: next };
    });
  },

  // Theme
  theme: getInitialTheme(),
  toggleTheme: () => {
    const newTheme = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("photolib-theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ theme: newTheme });
  },
  setTheme: (theme) => {
    localStorage.setItem("photolib-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    set({ theme });
  },

  // Left panel
  leftTab: "directory",
  setLeftTab: (tab) => set({ leftTab: tab }),

  // Directory browser
  currentDir: "",
  setCurrentDir: (dir) => {
    const prev = get().currentDir;
    if (prev && prev !== dir) {
      set((s) => ({ currentDir: dir, dirHistory: [...s.dirHistory, prev] }));
    } else {
      set({ currentDir: dir });
    }
  },
  dirEntries: [],
  setDirEntries: (entries) => set({ dirEntries: entries }),
  dirHistory: [],
  pushDirHistory: (dir) => set((s) => ({ dirHistory: [...s.dirHistory, dir] })),
  popDirHistory: () => {
    const history = get().dirHistory;
    if (history.length === 0) return null;
    const prev = history[history.length - 1];
    set({ dirHistory: history.slice(0, -1), currentDir: prev });
    return prev;
  },

  // Albums
  albums: [],
  setAlbums: (albums) => set({ albums }),
  selectedAlbumId: null,
  setSelectedAlbumId: (id) => set({ selectedAlbumId: id }),
  currentFolder: "",
  setCurrentFolder: (path) => set({ currentFolder: path }),

  selectedIds: new Set<number>(),
  toggleSelect: (id, multi = false) => {
    const prev = get().selectedIds;
    const next = new Set(multi ? prev : []);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    set({ selectedIds: next });
  },
  selectAll: () => {
    const allIds = new Set(get().photos.map((p) => p.id));
    set({ selectedIds: allIds });
  },
  clearSelection: () => set({ selectedIds: new Set<number>() }),

  viewMode: "grid",
  setViewMode: (mode) => set({ viewMode: mode }),
  thumbnailSize: 150,
  setThumbnailSize: (size) => set({ thumbnailSize: size }),

  filter: { ...defaultFilter },
  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),
  resetFilter: () => set({ filter: { ...defaultFilter } }),

  leftPanelOpen: true,
  rightPanelOpen: true,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  sortBy: "fileName",
  sortOrder: "asc",
  setSort: (by, order) => set({ sortBy: by, sortOrder: order }),
}));
