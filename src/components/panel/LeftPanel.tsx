import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  browseDirectory,
  openDirectory,
  reloadDirectory,
  extractExifBatch,
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
  children: TreeNode[] | null;    // null = not loaded yet
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
    albums,
    setAlbums,
    selectedAlbumId,
    setSelectedAlbumId,
  } = useAppStore();

  // ---------- 目录树状态 ----------
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);

  // 导航计数器：快速切换目录时丢弃过时结果
  const navRef = useRef(0);
  // 目录照片缓存：回访时 0ms 出图，后台静默刷新
  const photoCacheRef = useRef(new Map<string, Photo[]>());

  const expandNode = useCallback(async (node: TreeNode) => {
    if (node.children !== null) {
      // 已加载：仅切换展开
      setTree(prev => toggleInTree(prev, node.path));
      return;
    }
    // 未加载：先标记加载中
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

    // 标记当前导航
    const navId = ++navRef.current;
    const cache = photoCacheRef.current;

    // 缓存命中 → 0ms 出图；未命中 → 保留旧内容，数据到再更新
    const cached = cache.get(node.path);
    if (cached) {
      setPhotos(cached);
    }
    // 不再 setPhotos([]) — 保留上一目录内容避免空白闪烁

    try {
      const photos = await openDirectory(node.path);
      if (navId !== navRef.current) return;
      cache.set(node.path, photos);
      setPhotos(photos);

      // 子目录加载不阻塞照片展示，fire-and-forget
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

      // 后台：预热缩略图
      const dirPath = node.path;
      setTimeout(() => preloadThumbnails(dirPath).catch(() => {}), 500);

      // 后台：补充 EXIF 后从 DB 重新加载（保留缓存）
      extractExifBatch(dirPath).then(() => {
        if (navId !== navRef.current) return;
        reloadDirectory(dirPath).then(fresh => {
          if (navId === navRef.current) {
            cache.set(dirPath, fresh);
            setPhotos(fresh);
          }
        }).catch(() => {});
      }).catch(() => {});
    } catch (err) {
      if (navId !== navRef.current) return;
      console.error("selectNode error:", err);
      setError("加载照片失败");
    }
  }, [setCurrentDir, setSelectedAlbumId, setPhotos, setError]);

  // ---------- 初始化：加载盘符 ----------
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

  // ---------- 相册 ----------
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
    <div className="h-full flex flex-col bg-surface-900">
      {/* Tab 栏 */}
      <div className="flex border-b border-surface-700 shrink-0">
        <button onClick={() => setLeftTab("directory")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            leftTab === "directory"
              ? "text-accent-400 border-b-2 border-accent-500 bg-surface-800/50"
              : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/30"
          }`}>
          <HardDrive size={12} />目录
        </button>
        <button onClick={() => setLeftTab("album")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
            leftTab === "album"
              ? "text-accent-400 border-b-2 border-accent-500 bg-surface-800/50"
              : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/30"
          }`}>
          <BookImage size={12} />相册
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

// ==================== 树形目录视图 ====================
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
    return <div className="flex items-center justify-center py-8 text-surface-500 text-xs">加载中...</div>;
  }
  if (nodes.length === 0) {
    return <div className="flex items-center justify-center py-8 text-surface-500 text-xs">无可用驱动器</div>;
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
  const paddingLeft = 8 + depth * 16;

  return (
    <>
      <div
        className={`flex items-center gap-1 text-[12px] cursor-pointer select-none transition-colors ${
          isSelected
            ? "bg-accent-500/15 text-accent-300"
            : "text-surface-300 hover:bg-surface-800"
        }`}
        style={{ paddingLeft }}
        onClick={() => onSelect(node)}
      >
        {/* 展开/折叠箭头 */}
        <button
          className="p-0.5 shrink-0 rounded hover:bg-surface-700"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(node); }}
        >
          {node.loading ? (
            <div className="w-3 h-3 border border-surface-600 border-t-transparent rounded-full animate-spin" />
          ) : node.expanded ? (
            <ChevronDown size={12} className="text-surface-500" />
          ) : hasChildren ? (
            <ChevronRight size={12} className="text-surface-500" />
          ) : (
            <span className="w-3" /> // 占位，对齐用
          )}
        </button>

        {/* 图标 */}
        {node.isDrive ? (
          <HardDrive size={14} className="text-surface-400 shrink-0" />
        ) : node.expanded ? (
          <FolderOpen size={14} className="text-amber-500/70 shrink-0" />
        ) : (
          <Folder size={14} className="text-amber-500/50 shrink-0" />
        )}

        {/* 名称 */}
        <span className="truncate flex-1 pr-2">{node.name}</span>
      </div>

      {/* 子节点 */}
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

// ==================== 树状数据操作 ====================
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

// ==================== 相册Tab（不变） ====================
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
      <div className="flex items-center px-2 py-1.5 border-b border-surface-800 shrink-0">
        <button onClick={onAdd}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-accent-400 hover:text-accent-300 hover:bg-surface-800 rounded transition-colors w-full">
          <Plus size={13} />添加文件夹
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {albums.length > 0 ? (
          albums.map((album) => (
            <div key={album.id} onClick={() => onSelect(album)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors text-[12px] group ${
                selectedAlbumId === album.id ? "bg-accent-500/15 text-accent-300" : "text-surface-300 hover:bg-surface-800"
              }`}>
              <Image size={14} className="text-blue-400/60 shrink-0" />
              <span className="flex-1 truncate">{album.displayName || album.path}</span>
              <span className="text-[10px] text-surface-500 shrink-0">{album.photoCount || 0}</span>
              <button onClick={(e) => onRemove(album.id, e)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 hover:bg-surface-700 transition-all shrink-0">
                <Trash2 size={11} />
              </button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-surface-600">
            <BookImage size={28} strokeWidth={1} />
            <span className="text-xs">暂无相册</span>
            <button onClick={onAdd} className="text-[11px] text-accent-500 hover:text-accent-400 transition-colors">
              + 添加照片文件夹
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
