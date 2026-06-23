import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  browseDirectory,
  openDirectory,
  preloadThumbnails,
  getPhotosByFolderDeep,
  getAlbums,
  addAlbum,
  removeAlbum,
  isTauri,
} from "../../api";
import {
  Folder,
  FolderOpen,
  ChevronRight,
  Plus,
  Trash2,
  Image,
  HardDrive,
  BookImage,
  ChevronDown,
} from "lucide-react";
import type { DirectoryEntry, Photo } from "../../types";

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
    selectedAlbumId,
    setSelectedAlbumId,
  } = useAppStore();

  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  const navRef = useRef(0);
  const photoCacheRef = useRef(new Map<string, Photo[]>());

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
    const cache = photoCacheRef.current;

    const cached = cache.get(node.path);
    if (cached) {
      setPhotos(cached);
      return;
    }

    setPhotos([]);
    setLoading(true);

    try {
      const photos = await openDirectory(node.path);
      if (navId !== navRef.current) return;
      cache.set(node.path, photos);
      setPhotos(photos);
      setLoading(false);

      browseDirectory(node.path).then(entries => {
        const children: TreeNode[] = entries.map(e => ({
          path: e.path,
          name: e.name,
          children: null,
          loading: false,
          expanded: false,
          isDrive: false,
        }));
        setTree(prev => expandWithChildren(prev, node.path, children));
      }).catch(() => {});

      const dirPath = node.path;
      setTimeout(() => preloadThumbnails(dirPath).catch(() => {}), 500);
    } catch (err) {
      if (navId !== navRef.current) return;
      setLoading(false);
      console.error("selectNode error:", err);
      setError("加载照片失败");
    }
  }, [setCurrentDir, setSelectedAlbumId, setPhotos, setLoading, setError]);

  useEffect(() => {
    if (leftTab !== "directory") return;
    setTreeLoading(true);
    browseDirectory("ROOT").then(entries => {
      const drives: TreeNode[] = entries.map(e => ({
        path: e.path,
        name: e.name,
        children: null,
        loading: false,
        expanded: false,
        isDrive: true,
      }));
      setTree(drives);
    }).catch(() => {
      setTree([]);
    }).finally(() => setTreeLoading(false));
  }, [leftTab]);

  const loadAlbums = useCallback(async () => {
    try { const list = await getAlbums(); setAlbums(list); }
    catch (err) { console.error("getAlbums error:", err); }
  }, [setAlbums]);

  const selectAlbum = useCallback(async (album: { id: number; path: string }) => {
    setSelectedAlbumId(album.id);
    setCurrentDir(album.path);
    setPhotos([]);

    const navId = ++navRef.current;
    try {
      const photos = await getPhotosByFolderDeep(album.path);
      if (navId !== navRef.current) return;
      setPhotos(photos);
    } catch (err) {
      if (navId !== navRef.current) return;
      console.error("selectAlbum error:", err);
      setError("加载相册照片失败");
    }
  }, [setSelectedAlbumId, setCurrentDir, setPhotos, setError]);

  useEffect(() => { if (leftTab === "album") loadAlbums(); }, [leftTab]);

  const handleAddAlbum = async () => {
    if (isTauri()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({ directory: true, title: "选择要添加的文件夹" });
        if (selected && typeof selected === "string") {
          await addAlbum(selected);
          await loadAlbums();
        }
      } catch (err) { console.error("addAlbum error:", err); }
    } else {
      const path = prompt("输入文件夹路径：");
      if (path) { await addAlbum(path); await loadAlbums(); }
    }
  };

  const handleRemoveAlbum = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要移除此相册？")) {
      await removeAlbum(id);
      await loadAlbums();
      if (selectedAlbumId === id) setSelectedAlbumId(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-50 dark:bg-surface-50">
      {/* Tab bar */}
      <div className="flex border-b border-surface-200 dark:border-surface-200 shrink-0 p-1 gap-1">
        <button onClick={() => setLeftTab("directory")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
            leftTab === "directory"
              ? "bg-surface-0 dark:bg-surface-0 text-accent-600 dark:text-accent-400 shadow-sm"
              : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-100"
          }`}>
          <HardDrive size={13} />目录
        </button>
        <button onClick={() => setLeftTab("album")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
            leftTab === "album"
              ? "bg-surface-0 dark:bg-surface-0 text-accent-600 dark:text-accent-400 shadow-sm"
              : "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-100"
          }`}>
          <BookImage size={13} />相册
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
          <AlbumTab
            albums={albums}
            selectedAlbumId={selectedAlbumId}
            onSelect={selectAlbum}
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
      <div className="flex items-center justify-center py-8 text-surface-400 text-xs gap-2">
        <div className="w-3.5 h-3.5 border-2 border-surface-300 border-t-accent-500 rounded-full animate-spin" />
        加载中...
      </div>
    );
  }
  if (nodes.length === 0) {
    return <div className="flex items-center justify-center py-8 text-surface-400 text-xs">无可用驱动器</div>;
  }

  return (
    <div className="py-1">
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
  const paddingLeft = 6 + depth * 14;

  return (
    <>
      <div
        className={`flex items-center gap-1 text-[12px] cursor-pointer select-none transition-all duration-150 rounded-md mx-1 ${
          isSelected
            ? "bg-accent-500/10 text-accent-600 dark:text-accent-400 font-medium"
            : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-100"
        }`}
        style={{ paddingLeft, paddingRight: 6, paddingTop: 3, paddingBottom: 3 }}
        onClick={() => onSelect(node)}
      >
        <button
          className="p-0.5 shrink-0 rounded hover:bg-surface-200 dark:hover:bg-surface-200 transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(node); }}
        >
          {node.loading ? (
            <div className="w-3 h-3 border border-surface-300 border-t-accent-500 rounded-full animate-spin" />
          ) : node.expanded ? (
            <ChevronDown size={12} className="text-surface-400" />
          ) : hasChildren ? (
            <ChevronRight size={12} className="text-surface-400" />
          ) : (
            <span className="w-3" />
          )}
        </button>

        {node.isDrive ? (
          <HardDrive size={14} className="text-surface-500 shrink-0" />
        ) : node.expanded ? (
          <FolderOpen size={14} className="text-brand-500 shrink-0" />
        ) : (
          <Folder size={14} className="text-brand-400 shrink-0" />
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

// ==================== Album Tab ====================
function AlbumTab({
  albums,
  selectedAlbumId,
  onSelect,
  onAdd,
  onRemove,
}: {
  albums: { id: number; path: string; displayName?: string; photoCount?: number }[];
  selectedAlbumId: number | null;
  onSelect: (album: { id: number; path: string }) => void;
  onAdd: () => void;
  onRemove: (id: number, e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center px-2 py-2 border-b border-surface-200 dark:border-surface-200 shrink-0">
        <button onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-accent-600 dark:text-accent-400 hover:bg-accent-500/10 rounded-lg transition-colors w-full font-medium">
          <Plus size={13} />添加文件夹
        </button>
      </div>
      <div className="flex-1 overflow-auto py-1">
        {albums.length > 0 ? (
          albums.map((album) => (
            <div key={album.id} onClick={() => onSelect(album)}
              className={`flex items-center gap-2 mx-1 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150 text-xs group ${
                selectedAlbumId === album.id
                  ? "bg-accent-500/10 text-accent-600 dark:text-accent-400 font-medium"
                  : "text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-100"
              }`}>
              <Image size={14} className="text-surface-400 shrink-0" />
              <span className="flex-1 truncate">{album.displayName || album.path}</span>
              <span className="text-2xs text-surface-400 shrink-0 tabular-nums">{album.photoCount || 0}</span>
              <button onClick={(e) => onRemove(album.id, e)}
                className="p-1 rounded-md opacity-0 group-hover:opacity-100 text-surface-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-surface-400">
            <BookImage size={28} strokeWidth={1.5} className="text-surface-300" />
            <span className="text-xs">暂无相册</span>
            <button onClick={onAdd} className="text-xs text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors font-medium">
              + 添加照片文件夹
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
