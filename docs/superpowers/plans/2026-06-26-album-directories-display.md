# Album Sidebar Directory Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wrap the existing flat directory list in the albums sidebar with a "总相册" album header + nested directory list.

**Architecture:** Pure UI change in `LeftPanel.tsx`. No backend, store, or API changes. Export `AlbumManager` for testing.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind 3, Lucide icons, Vitest + jsdom + @testing-library/react

## Global Constraints

- Only modify `src/components/panel/LeftPanel.tsx` (production code) and add `src/components/panel/__tests__/LeftPanel.test.tsx` (tests)
- No Rust backend changes, no store changes, no API changes
- Follow existing Tailwind class conventions from surrounding code
- Follow existing test patterns from `src/components/browser/__tests__/ThumbnailCell.test.tsx` (mock `@tauri-apps/api/core` and `../../api`)
- `albumExpanded` defaults to `true`

---

### Task 1: Modify LeftPanel.tsx with album header + nested directory list

**Files:**
- Modify: `src/components/panel/LeftPanel.tsx`

**Interfaces:**
- Consumes: `albums: Folder[]` from store (unchanged), `handleAddAlbum` / `handleRemoveAlbum` callbacks (unchanged)
- Produces: Export `AlbumManager` so tests can import it. New `AlbumManager` signature:
  - Props: `{ albums: Folder[]; albumExpanded: boolean; onToggleExpand: () => void; onAdd: () => void; onRemove: (id: number, e: React.MouseEvent) => void }`
  - Returns JSX with album header + optional nested directory list

- [ ] **Step 1: Add `export` to `AlbumManager` and update interface**

  In `src/components/panel/LeftPanel.tsx`, change:
  ```tsx
  function AlbumManager({
    albums,
    showManager,
    onToggle,
    onAdd,
    onRemove,
  }: {
    albums: { id: number; path: string; displayName?: string; photoCount?: number }[];
    showManager: boolean;
    onToggle: () => void;
    onAdd: () => void;
    onRemove: (id: number, e: React.MouseEvent) => void;
  })
  ```
  to:
  ```tsx
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
  })
  ```

- [ ] **Step 2: Replace `showManager` state with `albumExpanded` in `LeftPanel`**

  In the `LeftPanel` component function, change:
  ```tsx
  const [showAlbumManager, setShowAlbumManager] = useState(false);
  ```
  to:
  ```tsx
  const [albumExpanded, setAlbumExpanded] = useState(true);
  ```

- [ ] **Step 3: Rewrite `AlbumManager` body**

  Replace the full `AlbumManager` component body with:

  ```tsx
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
  ```

- [ ] **Step 4: Update `AlbumManager` usage in `LeftPanel` render**

  Change the JSX call site from:
  ```tsx
  <AlbumManager
    albums={albums}
    showManager={showAlbumManager}
    onToggle={() => setShowAlbumManager((v) => !v)}
    onAdd={handleAddAlbum}
    onRemove={handleRemoveAlbum}
  />
  ```
  to:
  ```tsx
  <AlbumManager
    albums={albums}
    albumExpanded={albumExpanded}
    onToggleExpand={() => setAlbumExpanded((v) => !v)}
    onAdd={handleAddAlbum}
    onRemove={handleRemoveAlbum}
  />
  ```

- [ ] **Step 5: Remove unused `Settings` import (no longer needed)**

  Remove `Settings` from the lucide-react import on line 24. The current import is:
  ```tsx
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
    Settings,
  } from "lucide-react";
  ```
  Remove `Settings,` (including the trailing comma).

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/panel/LeftPanel.tsx
  git commit -m "feat: add album header with nested directory list in sidebar"
  ```

---

### Task 2: Add unit tests for AlbumManager

**Files:**
- Create: `src/components/panel/__tests__/LeftPanel.test.tsx`

**Interfaces:**
- Consumes: `AlbumManager` component (exported from `../LeftPanel`)

- [ ] **Step 1: Write the test file**

  Create `src/components/panel/__tests__/LeftPanel.test.tsx`:

  ```tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import React from "react";
  import { render, screen, fireEvent } from "@testing-library/react";

  // Mock Tauri core so api module loads
  vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: (p: string) => `asset://${p}`,
    invoke: vi.fn(),
  }));

  // Mock the local api module
  vi.mock("../../api", () => ({
    getAlbums: vi.fn(),
    getAllAlbumPhotos: vi.fn(),
    addAlbum: vi.fn(),
    removeAlbum: vi.fn(),
    browseDirectory: vi.fn(),
    openDirectory: vi.fn(),
    isTauri: () => false,
    preloadThumbnails: vi.fn(),
    extractExifFor: vi.fn(),
  }));

  import { AlbumManager } from "../LeftPanel";

  describe("AlbumManager", () => {
    const defaultAlbums = [
      { id: 1, path: "D:/Photos/2025", displayName: "2025", photoCount: 150, lastScan: "" },
      { id: 2, path: "D:/Photos/2024", displayName: "2024", photoCount: 200, lastScan: "" },
    ];

    const defaultProps = {
      albums: defaultAlbums,
      albumExpanded: true,
      onToggleExpand: vi.fn(),
      onAdd: vi.fn(),
      onRemove: vi.fn(),
    };

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("renders album header with total photo count", () => {
      render(<AlbumManager {...defaultProps} />);
      expect(screen.getByText("总相册")).toBeTruthy();
      expect(screen.getByText("350 张")).toBeTruthy();
    });

    it("renders directory rows when expanded", () => {
      render(<AlbumManager {...defaultProps} />);
      expect(screen.getByText("2025")).toBeTruthy();
      expect(screen.getByText("2024")).toBeTruthy();
      expect(screen.getByText("150")).toBeTruthy();
      expect(screen.getByText("200")).toBeTruthy();
    });

    it("does not render directory rows when collapsed", () => {
      render(<AlbumManager {...defaultProps} albumExpanded={false} />);
      expect(screen.queryByText("2025")).toBeNull();
      expect(screen.queryByText("2024")).toBeNull();
    });

    it("calls onToggleExpand when album header is clicked", () => {
      const onToggleExpand = vi.fn();
      render(<AlbumManager {...defaultProps} onToggleExpand={onToggleExpand} />);
      fireEvent.click(screen.getByText("总相册"));
      expect(onToggleExpand).toHaveBeenCalledTimes(1);
    });

    it("shows empty state when no albums", () => {
      render(<AlbumManager {...defaultProps} albums={[]} />);
      expect(screen.getByText("还没有添加任何目录")).toBeTruthy();
    });

    it("renders + 添加文件夹 button", () => {
      render(<AlbumManager {...defaultProps} />);
      expect(screen.getByText("添加文件夹")).toBeTruthy();
    });

    it("calls onRemove when delete button is clicked", () => {
      const onRemove = vi.fn();
      const { container } = render(<AlbumManager {...defaultProps} onRemove={onRemove} />);
      const buttons = container.querySelectorAll<HTMLButtonElement>("button");
      const deleteBtn = Array.from(buttons).find(b => b.querySelector("svg"));
      expect(deleteBtn).toBeTruthy();
      if (deleteBtn) {
        fireEvent.click(deleteBtn);
        expect(onRemove).toHaveBeenCalledWith(1, expect.any(Object));
      }
    });

    it("+ 添加文件夹 button calls onAdd", () => {
      const onAdd = vi.fn();
      render(<AlbumManager {...defaultProps} onAdd={onAdd} />);

      // The "+ 添加文件夹" button renders text, so find by that text
      const addButtons = screen.getAllByText("添加文件夹");
      // The button in the directory list section
      fireEvent.click(addButtons[addButtons.length - 1].closest("button")!);
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] **Step 2: Run tests to verify they pass**

  Run: `npm run test`

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/panel/__tests__/LeftPanel.test.tsx
  git commit -m "test: add AlbumManager unit tests"
  ```

---

### Task 3: Final verification

- [ ] **Step 1: Run type check and build**

  Run: `npm run build`

- [ ] **Step 2: Run full test suite**

  Run: `npm run test`

- [ ] **Step 3: Commit any remaining changes**

  ```bash
  git add -A
  git commit -m "chore: final cleanup after album sidebar redesign"
  ```
