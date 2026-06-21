import { create } from "zustand";
import type { Photo, FilterState, ViewMode, Folder, DirectoryEntry, LeftPanelTab } from "../types";

interface AppState {
  // Loading & Error
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;

  // Photos
  photos: Photo[];
  setPhotos: (photos: Photo[]) => void;

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

export const useAppStore = create<AppState>((set, get) => ({
  isLoading: false,
  setLoading: (loading) => set({ isLoading: loading }),
  error: null,
  setError: (error) => set({ error }),

  photos: [],
  setPhotos: (photos) => set({ photos }),

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
  thumbnailSize: 200,
  setThumbnailSize: (size) => set({ thumbnailSize: size }),

  filter: { ...defaultFilter },
  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),
  resetFilter: () => set({ filter: { ...defaultFilter } }),

  leftPanelOpen: true,
  rightPanelOpen: true,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  sortBy: "dateTaken",
  sortOrder: "desc",
  setSort: (by, order) => set({ sortBy: by, sortOrder: order }),
}));
