import { useState } from "react";
import { Folder, ChevronRight, ChevronDown, FolderOpen, HardDrive, Image } from "lucide-react";
import type { Folder as FolderType } from "../../types";
import { mockFolders } from "../../mock/data";

interface FolderTreeProps {
  currentFolder: string;
  onSelect: (path: string) => void;
}

export function FolderTree({ currentFolder, onSelect }: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["D:/Photos"]));

  const toggleExpand = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 text-[11px] font-semibold text-surface-400 uppercase tracking-wider border-b border-surface-800">
        文件夹
      </div>
      <div className="flex-1 overflow-auto py-1">
        {mockFolders.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            expanded={expanded}
            currentFolder={currentFolder}
            onToggle={toggleExpand}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

function FolderNode({
  folder,
  depth,
  expanded,
  currentFolder,
  onToggle,
  onSelect,
}: {
  folder: FolderType;
  depth: number;
  expanded: Set<string>;
  currentFolder: string;
  onToggle: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  const isExpanded = expanded.has(folder.path);
  const isSelected = currentFolder === folder.path;
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-[12px] transition-colors
          ${isSelected ? "bg-accent-500/20 text-accent-300" : "text-surface-300 hover:bg-surface-800"}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          onSelect(folder.path);
          if (hasChildren) onToggle(folder.path);
        }}
      >
        {hasChildren ? (
          isExpanded ? <ChevronDown size={12} className="text-surface-500 shrink-0" /> : <ChevronRight size={12} className="text-surface-500 shrink-0" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isExpanded || !hasChildren ? (
          <FolderOpen size={14} className="text-accent-500 shrink-0" />
        ) : (
          <Folder size={14} className="text-accent-500 shrink-0" />
        )}
        <span className="truncate flex-1">{folder.displayName}</span>
        <span className="text-[10px] text-surface-500 shrink-0">{folder.photoCount}</span>
      </div>
      {isExpanded && hasChildren && (
        <div>
          {folder.children!.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              expanded={expanded}
              currentFolder={currentFolder}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
