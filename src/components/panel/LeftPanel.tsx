import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  browseDirectory,
  openDirectory,
  preloadThumbnails,
  extractExifFor,
  getAlbums,
  addAlbum,
  removeAlbum,
  isTauri,
  getAllAlbumPhotos,
} from "../../api";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Plus,
  Trash2,
  HardDrive,
  BookImage,
  ChevronDown,
} from "lucide-react";
import type { DirectoryEntry } from "../../types";

// ==================== Tree Node ====================
interface TreeNode {
  path: string;
  name: string;
  children: TreeNode[] | null;
  loading: boolean;
  expanded: boolean;
  isDrive: boolean;
}

export function LeftPanel() {
  const {
    leftTab,
    setLeftTab,
    setCurrentDir,
    setPhotos,
    setError,
    setLoading,
    albums,
    setAlbums,
    setSelectedAlbumId,
    setCurrentFolder,
  } = useAppStore();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [albumExpanded, setAlbumExpanded] = useState(true);

  const navRef = useRef(0);

  const expandNode = useCallback(async (node: TreeNode) => {
    if (node.children !== null) {
      setTree(prev => toggleInTree(prev, node.path));
      return;
    }
    setTree(prev => markLoading(prev, node.path, true));
    try {
      const entries = await browseDirectory(node.path);
      const children: TreeNode[] = entries.map(e => ({
        path: e.path,
        name: e.name,
        children: null,
        loading: false,
        expanded: false,
        isDrive: false,
      }));
      setTree(prev => expandWithChildren(prev, node.path, children));
    } catch {
      setTree(prev => markLoading(prev, node.path, false));
    }
  }, []);

  const collapseNode = useCallback((path: string) => {
    setTree(prev => toggleInTree(prev, path));
  }, []);

  const selectNode = useCallback(async (node: TreeNode) => {
    if (node.isDrive) return;
    setCurrentDir(node.path);
    setSelectedAlbumId(null);

    const navId = ++navRef.current;

    setPhotos([]);
    setLoading(true);

    const dirPath = node.path;

    // Fire-and-forget: skeleton arrives via the "photos-skeleton" event in main.tsx
    openDirectory(dirPath, navId).catch((err) => {
      if (navId !== navRef.current) return;
      setLoading(false);
      console.error("openDirectory error:", err);
      setError("加载照片失败");
    });

    // The skeleton (with cached EXIF) arrives asynchronously and triggers setPhotos.
    // Once it's rendered, the grid mount fires rangeChanged, which calls extractExifFor.
    // Here we still kick off:
    //   - viewport-priority EXIF (visible cells), in case the skeleton EXIF is empty
    //   - side children prefetch
    //   - thumbnail preload
    setTimeout(() => {
      if (navId !== navRef.current) return;
      const cur = useAppStore.getState().photos;
      if (cur.length === 0) return;
      const visCount = Math.ceil(window.innerHeight / 200) * Math.ceil(window.innerWidth / 200) + 10;
      const initialVisPaths = cur
        .slice(0, Math.min(visCount, 100))
        .filter((p) => !p.dateTaken || p.dateTaken === "")
        .map((p) => p.filePath);
      if (initialVisPaths.length > 0) {
        extractExifFor(initialVisPaths).catch(() => {});
      }
    }, 100);

    browseDirectory(dirPath).then((entries) => {
      if (navId !== navRef.current) return;
      const children: TreeNode[] = entries.map((e) => ({
        path: e.path, name: e.name, children: null, loading: false, expanded: false, isDrive: false,
      }));
      setTree((prev) => expandWithChildren(prev, dirPath, children));
    }).catch(() => {});

    setTimeout(() => {
      if (navId !== navRef.current) return;
      preloadThumbnails(dirPath).catch(() => {});
    }, 500);
  }, [setCurrentDir, setSelectedAlbumId, setPhotos, setLoading, setError]);

  // Directory tree: initial load + polling every 3s for drive changes
  useEffect(() => {
    if (leftTab !== "directory") return;
    let first = true;

    const loadDrives = () => {
      browseDirectory("ROOT").then(entries => {
        if (first) setTreeLoading(false);
        first = false;

        setTree(prev => {
          const prevPaths = new Map(prev.map(d => [d.path, d]));
          const newPaths = new Set(entries.map(e => e.path));

          // No change — skip re-render
          if (prev.length === entries.length && entries.every(e => prevPaths.has(e.path))) {
            return prev;
          }

          // Merge: keep existing nodes (with expansion state), add new drives
          return entries.map(e => {
            const existing = prevPaths.get(e.path);
            return existing ?? {
              path: e.path,
              name: e.name,
              children: null,
              loading: false,
              expanded: false,
              isDrive: true,
            };
          });
        });
      }).catch(() => {
        if (first) { setTree([]); setTreeLoading(false); first = false; }
      });
    };

    loadDrives();
    const interval = setInterval(loadDrives, 3000);
    return () => clearInterval(interval);
  }, [leftTab]);

  const loadAlbums = useCallback(async () => {
    try { const list = await getAlbums(); setAlbums(list); }
    catch (err) { console.error("getAlbums error:", err); }
  }, [setAlbums]);

  // Album tab: load all photos from all added directories
  const loadAllAlbumPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const photos = await getAllAlbumPhotos();
      setPhotos(photos);
    } catch (err) {
      console.error("getAllAlbumPhotos error:", err);
      setError("加载相册照片失败");
    } finally {
      setLoading(false);
    }
  }, [setPhotos, setLoading, setError]);

  // Album tab activation: load photos + album list, clear dir state
  useEffect(() => {
    if (leftTab !== "album") return;
    setCurrentDir("");
    setCurrentFolder("总相册");
    setSelectedAlbumId(null);
    loadAllAlbumPhotos();
    loadAlbums();
  }, [leftTab, loadAllAlbumPhotos, loadAlbums, setCurrentDir, setCurrentFolder, setSelectedAlbumId]);

  const refreshAlbumPhotos = useCallback(async () => {
    await loadAllAlbumPhotos();
    await loadAlbums();
  }, [loadAllAlbumPhotos, loadAlbums]);

  const handleAddAlbum = async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, title: "选择要添加的文件夹" });
        if (selected && typeof selected === "string") {
          await addAlbum(selected);
          await refreshAlbumPhotos();
        }
      } catch (err) { console.error("addAlbum error:", err); }
    } else {
      const path = prompt("输入文件夹路径：");
      if (path) { await addAlbum(path); await refreshAlbumPhotos(); }
    }
  };

  const handleRemoveAlbum = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要移除此相册？")) {
      await removeAlbum(id);
      await refreshAlbumPhotos();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar — pill style */}
      <div className="flex border-b border-surface-200/50 dark:border-surface-200/20 shrink-0 p-2 gap-1.5">
        <button onClick={() => setLeftTab("directory")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all duration-200 ${
            leftTab === "directory"
              ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
              : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100/70 dark:hover:bg-surface-100/40"
          }`}>
          <HardDrive size={14} />目录
        </button>
        <button onClick={() => setLeftTab("album")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-xl transition-all duration-200 ${
            leftTab === "album"
              ? "bg-accent-500 text-white shadow-sm shadow-accent-500/20"
              : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100/70 dark:hover:bg-surface-100/40"
          }`}>
          <BookImage size={14} />相册
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {leftTab === "directory" ? (
          <TreeView
            nodes={tree}
            loading={treeLoading}
            onToggleExpand={(n) => n.expanded ? collapseNode(n.path) : expandNode(n)}
            onSelect={selectNode}
          />
        ) : (
          <AlbumManager
            albums={albums}
            albumExpanded={albumExpanded}
            onToggleExpand={() => setAlbumExpanded((v) => !v)}
            onAdd={handleAddAlbum}
            onRemove={handleRemoveAlbum}
          />
        )}
      </div>
    </div>
  );
}

// ==================== Tree View ====================
function TreeView({
  nodes,
  loading,
  onToggleExpand,
  onSelect,
}: {
  nodes: TreeNode[];
  loading: boolean;
  onToggleExpand: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-surface-400 text-xs gap-2">
        <div className="w-4 h-4 rounded-full border-2 border-surface-300/60 border-t-accent-500 animate-spin" />
        加载中...
      </div>
    );
  }
  if (nodes.length === 0) {
    return <div className="flex items-center justify-center py-12 text-surface-400 text-xs">无可用驱动器</div>;
  }

  return (
    <div className="py-1.5 px-1.5 space-y-0.5">
      {nodes.map(node => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  onToggleExpand,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onToggleExpand: (node: TreeNode) => void;
  onSelect: (node: TreeNode) => void;
}) {
  const { currentDir } = useAppStore();
  const isSelected = currentDir === node.path;
  const hasChildren = node.children === null || node.children.length > 0;
  const paddingLeft = 8 + depth * 16;

  return (
    <>
      <div
        className={`flex items-center gap-1.5 text-[13px] cursor-pointer select-none transition-all duration-200 rounded-xl ${
          isSelected
            ? "bg-accent-500/10 text-accent-600 dark:text-accent-400 font-medium"
            : "text-surface-600 dark:text-surface-400 hover:bg-surface-100/70 dark:hover:bg-surface-100/40"
        }`}
        style={{ paddingLeft, paddingRight: 8, paddingTop: 5, paddingBottom: 5 }}
        onClick={() => onSelect(node)}
      >
        <button
          className="p-0.5 shrink-0 rounded-lg hover:bg-surface-200/50 dark:hover:bg-surface-200/30 transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(node); }}
        >
          {node.loading ? (
            <div className="w-3.5 h-3.5 rounded-full border-2 border-surface-300/60 border-t-accent-500 animate-spin" />
          ) : node.expanded ? (
            <ChevronDown size={13} className="text-surface-400" />
          ) : hasChildren ? (
            <ChevronRight size={13} className="text-surface-400" />
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {node.isDrive ? (
          <HardDrive size={15} className="text-surface-500 shrink-0" />
        ) : node.expanded ? (
          <FolderOpen size={15} className="text-brand-500 shrink-0" />
        ) : (
          <Folder size={15} className="text-brand-400 shrink-0" />
        )}

        <span className="truncate flex-1">{node.name}</span>
      </div>

      {node.expanded && node.children && node.children.length > 0 && (
        <>
          {node.children.map(child => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </>
      )}
    </>
  );
}

// ==================== Tree helpers ====================
function toggleInTree(nodes: TreeNode[], targetPath: string): TreeNode[] {
  return nodes.map(n => {
    if (n.path === targetPath) {
      return { ...n, expanded: !n.expanded };
    }
    if (n.children) {
      return { ...n, children: toggleInTree(n.children, targetPath) };
    }
    return n;
  });
}

function markLoading(nodes: TreeNode[], targetPath: string, loading: boolean): TreeNode[] {
  return nodes.map(n => {
    if (n.path === targetPath) {
      return { ...n, loading };
    }
    if (n.children) {
      return { ...n, children: markLoading(n.children, targetPath, loading) };
    }
    return n;
  });
}

function expandWithChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map(n => {
    if (n.path === targetPath) {
      return { ...n, loading: false, expanded: true, children };
    }
    if (n.children) {
      return { ...n, children: expandWithChildren(n.children, targetPath, children) };
    }
    return n;
  });
}

// ==================== Album Manager ====================
export function AlbumManager({
  albums,
  albumExpanded,
  onToggleExpand,
  onAdd,
  onRemove,
}: {
  albums: { id: number; path: string; displayName?: string; photoCount?: number }[];
  albumExpanded: boolean;
  onToggleExpand: () => void;
  onAdd: () => void;
  onRemove: (id: number, e: React.MouseEvent) => void;
}) {
  const totalPhotos = albums.reduce((sum, a) => sum + (a.photoCount || 0), 0);

  return (
    <div className="flex flex-col h-full">
      {/* Album header — always visible */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b border-surface-200/50 dark:border-surface-200/20 shrink-0 cursor-pointer select-none"
        onClick={onToggleExpand}
      >
        <BookImage size={16} className="text-accent-500 shrink-0" />
        <span className="flex-1 text-sm font-medium text-surface-700 dark:text-surface-300">总相册</span>
        <span className="text-2xs text-surface-400 tabular-nums font-medium">{totalPhotos} 张</span>
        <ChevronDown size={14} className={`text-surface-400 transition-transform ${albumExpanded ? "" : "-rotate-90"}`} />
      </div>

      {/* Directory list — conditionally visible */}
      {albumExpanded && (
        <div className="flex-1 overflow-auto py-1.5 px-1.5 space-y-0.5">
          {albums.length > 0 ? (
            albums.map((album) => (
              <div key={album.id}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs group text-surface-600 dark:text-surface-400"
                style={{ paddingLeft: 8 + 16 }}>
                <Folder size={15} className="text-surface-400 shrink-0" />
                <span className="flex-1 truncate">{album.displayName || album.path}</span>
                <span className="text-2xs text-surface-400 shrink-0 tabular-nums font-medium">{album.photoCount || 0}</span>
                <button onClick={(e) => onRemove(album.id, e)}
                  className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-surface-400">
              <div className="w-10 h-10 rounded-xl bg-surface-100/60 dark:bg-surface-100/30 flex items-center justify-center">
                <BookImage size={18} strokeWidth={1.5} className="text-surface-400" />
              </div>
              <span className="text-xs">还没有添加任何目录</span>
            </div>
          )}

          <button onClick={onAdd}
            className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-accent-600 dark:text-accent-400 hover:bg-accent-500/10 rounded-xl transition-colors w-full font-medium mt-1">
            <Plus size={14} />添加文件夹
          </button>
        </div>
      )}
    </div>
  );
}
