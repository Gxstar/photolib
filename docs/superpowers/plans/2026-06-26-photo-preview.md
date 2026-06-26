# Photo Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add large-image preview triggered by double-click thumbnail

**Architecture:** Rust `get_preview_image` command (L2 JPEG fallback) + YARL Lightbox frontend component + EXIF panel + rotation

**Tech Stack:** React 18, TypeScript, Tailwind 3, Rust/Tauri v2, yet-another-react-lightbox 3.32, lucide-react

## Global Constraints

- `npm install yet-another-react-lightbox` — no other new deps
- All existing tests must pass after every task
- In Rust, new cache path: `v7_{hash}_l2.jpg` (L1 stays `v7_{hash}.jpg`)
- Store preview state as `previewPhotoId: number | null` (not index)
- Original src first → `<img onError>` → L2 fallback per slide
- EXIF panel default visible, toggle with `I`
- `R` / `Shift+R` for rotation (CSS transform, local state)

---

### Task 1: Rust backend — L2 cache + new command + scope registration

**Files:**
- Modify: `src-tauri/src/thumbnail.rs`
- Modify: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `ThumbLevel` enum exists, `generate_and_cache` exists
- Produces: `get_preview_image(file_path: String) -> String` command, `get_cache_path_l2` function, startup scope registration

- [ ] **Step 1: Split L1/L2 cache paths in thumbnail.rs**

  Replace `get_cache_path` with two functions:

  ```rust
  pub fn get_cache_path(file_path: &str) -> PathBuf {
      let dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from(".")).join("photolib").join("thumbs");
      fs::create_dir_all(&dir).ok();
      dir.join(format!("v7_{:016x}.jpg", xxhash_rust::xxh3::xxh3_64(file_path.as_bytes())))
  }

  pub fn get_cache_path_l2(file_path: &str) -> PathBuf {
      let dir = dirs::cache_dir().unwrap_or_else(|| PathBuf::from(".")).join("photolib").join("thumbs");
      fs::create_dir_all(&dir).ok();
      dir.join(format!("v7_{:016x}_l2.jpg", xxhash_rust::xxh3::xxh3_64(file_path.as_bytes())))
  }
  ```

  Keep `get_cache_path` as-is for L1 (existing callers use it). `get_thumbnail_cache_path` stays the same (calls `get_cache_path`).

  Update `generate_and_cache` to take a `level` param and dispatch to the correct path:

  ```rust
  pub fn generate_and_cache(source: &Path, level: ThumbLevel) -> anyhow::Result<PathBuf> {
      let cp = match level {
          ThumbLevel::L1 => get_cache_path(&source.to_string_lossy()),
          ThumbLevel::L2 => get_cache_path_l2(&source.to_string_lossy()),
      };
      if cache_is_valid(source, &cp) { return Ok(cp); }
      fs::write(&cp, generate_thumbnail(source, level)?)?;
      Ok(cp)
  }
  ```

  No callers need updating: `generate_and_cache` is called from `commands.rs` with `ThumbLevel::L1` — those calls remain unchanged.

- [ ] **Step 2: Add new command get_preview_image in commands.rs**

  After `get_thumbnail_path` (line ~1122), add:

  ```rust
  /// 生成大图预览（L2 1920px JPEG），返回磁盘缓存路径
  #[tauri::command]
  pub async fn get_preview_image(
      file_path: String,
  ) -> Result<String, String> {
      let path = std::path::PathBuf::from(&file_path);
      if !path.exists() {
          return Err("文件不存在".to_string());
      }

      tokio::task::spawn_blocking(move || {
          crate::thumbnail::generate_and_cache(&path, crate::thumbnail::ThumbLevel::L2)
              .map(|p| p.to_string_lossy().to_string())
              .map_err(|e| {
                  eprintln!("[PhotoLib::get_preview_image] FAILED for {:?}: {:#}", path, e);
                  format!("预览图生成失败: {}", e)
              })
      }).await.map_err(|e| format!("join error: {}", e))?
  }
  ```

- [ ] **Step 3: Register command in lib.rs**

  Add `commands::get_preview_image` to the invoke_handler list (line ~53-65).

- [ ] **Step 4: Startup asset scope registration in lib.rs**

  In `run()`, after `init_db(&db_path)`, before building the app:

  ```rust
  // Register all photo directories to asset protocol scope
  if let Ok(conn) = rusqlite::Connection::open(&db_path) {
      if let Ok(mut stmt) = conn.prepare("SELECT path FROM folders") {
          if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
              let paths: Vec<String> = rows.filter_map(|r| r.ok()).collect();
              if !paths.is_empty() {
                  let handle = app_handle.clone();
                  tauri::async_runtime::spawn(async move {
                      for p in paths {
                          let _ = handle.asset_protocol_scope().allow_directory(&p, true);
                      }
                  });
              }
          }
      }
  }
  ```

  Note: `app_handle` needs to be captured before building. The Tauri builder pattern:
  ```rust
  tauri::Builder::default()
      .setup(|app| {
          let handle = app.handle().clone();
          // register scope
          tauri::async_runtime::spawn(async move {
              //...
          });
          Ok(())
      })
  ```

- [ ] **Step 5: Add scope registration to add_album hook**

  In `commands.rs::add_album`, after the INSERT succeeds, add:

  ```rust
  // Register the new directory to asset protocol scope
  let app_handle = app.handle();
  let folder = folder_path.clone();
  tauri::async_runtime::spawn(async move {
      let _ = app_handle.asset_protocol_scope().allow_directory(&folder, true);
  });
  ```

  Note: `add_album` already takes `db: State<'_, crate::db::AppDatabase>` — need to add `app: tauri::AppHandle` as parameter.

- [ ] **Step 6: Verify Rust compiles**

  Run: `cd src-tauri; cargo check`
  Expected: `Finished dev profile`

- [ ] **Step 7: Commit**

  ```bash
  git add src-tauri/src/thumbnail.rs src-tauri/src/commands.rs src-tauri/src/lib.rs
  git commit -m "feat: add get_preview_image command, L2 cache path, asset scope registration"
  ```

---

### Task 2: Frontend foundation — install YARL, store state, API wrapper, double-click wiring

**Files:**
- Modify: `package.json`
- Modify: `src/stores/appStore.ts`
- Modify: `src/api.ts`
- Modify: `src/components/browser/ThumbnailGrid.tsx`

- [ ] **Step 1: Install YARL**

  Run: `npm install yet-another-react-lightbox`
  Expected: added to package.json, node_modules updated

- [ ] **Step 2: Add preview state to appStore.ts**

  Add to `AppState` interface:
  ```ts
  previewPhotoId: number | null;
  setPreviewPhotoId: (id: number | null) => void;
  ```

  Add initial values in the store creator:
  ```ts
  previewPhotoId: null,
  setPreviewPhotoId: (id) => set({ previewPhotoId: id }),
  ```

- [ ] **Step 3: Add getPreviewImage to api.ts**

  ```ts
  export async function getPreviewImage(filePath: string): Promise<string> {
    const invoke = await getInvoke();
    return invoke<string>("get_preview_image", { filePath });
  }
  ```

- [ ] **Step 4: Wire double-click in ThumbnailGrid.tsx**

  Import `setPreviewPhotoId` from store:
  ```tsx
  const { isLoading, selectedIds, toggleSelect, thumbnailSize, setThumbnailSize, setPreviewPhotoId } = useAppStore();
  ```

  Change line 286:
  ```tsx
  onDoubleClick={() => setPreviewPhotoId(photo.id)}
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add package.json src/stores/appStore.ts src/api.ts src/components/browser/ThumbnailGrid.tsx
  git commit -m "feat: wire YARL, preview store state, double-click"
  ```

---

### Task 3: PhotoPreview component — YARL wrapper, EXIF panel, rotation, fallback

**Files:**
- Create: `src/components/browser/PhotoPreview.tsx`

- [ ] **Step 1: Write the component**

  Create `src/components/browser/PhotoPreview.tsx`:

  ```tsx
  import { useState, useEffect, useCallback, useRef, useMemo } from "react";
  import { useAppStore } from "../../stores/appStore";
  import { getPreviewImage, isTauri } from "../../api";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import Lightbox from "yet-another-react-lightbox";
  import Zoom from "yet-another-react-lightbox/plugins/zoom";
  import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen";
  import Counter from "yet-another-react-lightbox/plugins/counter";
  import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
  import Slideshow from "yet-another-react-lightbox/plugins/slideshow";
  import "yet-another-react-lightbox/styles.css";
  import "yet-another-react-lightbox/plugins/thumbnails/styles.css";
  import "yet-another-react-lightbox/plugins/counter/styles.css";
  import type { Photo } from "../../types";
  import {
    X, FileImage, Camera, Aperture, Timer, Sun, MapPin,
    Monitor, Maximize2
  } from "lucide-react";

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  function ExifPanel({ photo }: { photo: Photo | null }) {
    if (!photo) return null;
    const rows: [string, string][] = [
      ["文件名", photo.fileName],
      ["路径", photo.filePath],
      ["大小", formatBytes(photo.fileSize)],
      ["尺寸", `${photo.imageWidth || "-"} × ${photo.imageHeight || "-"}`],
      ["相机", [photo.cameraMake, photo.cameraModel].filter(Boolean).join(" ")],
      ["镜头", photo.lensModel],
      ["焦距", photo.focalLength ? `${photo.focalLength}mm` : ""],
      ["光圈", photo.aperture ? `f/${photo.aperture}` : ""],
      ["快门", photo.shutterSpeed],
      ["ISO", photo.iso ? String(photo.iso) : ""],
      ["曝光补偿", photo.exposureComp ? `EV ${photo.exposureComp}` : ""],
      ["日期", photo.dateTaken],
      ["白平衡", photo.whiteBalance],
      ["测光", photo.meteringMode],
      ["闪光灯", photo.flash],
      ["色彩空间", photo.colorSpace],
      ["软件", photo.software],
      ["版权", photo.copyright],
    ].filter(([, v]) => v);

    return (
      <div className="fixed right-0 top-0 bottom-0 w-[280px] z-[100] bg-surface-900/90 backdrop-blur-xl border-l border-white/10 overflow-y-auto">
        <div className="p-4 space-y-2">
          <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">EXIF 信息</h3>
          <div className="divide-y divide-white/5">
            {rows.map(([label, value]) => (
              <div key={label} className="py-2">
                <p className="text-2xs text-white/30">{label}</p>
                <p className="text-xs text-white/80 break-all">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  export function PhotoPreview({
    photos,
    onClose,
  }: {
    photos: Photo[];
    onClose: () => void;
  }) {
    const { previewPhotoId, setPreviewPhotoId } = useAppStore();
    const [showExif, setShowExif] = useState(true);
    const [rotationMap, setRotationMap] = useState<Map<number, number>>(new Map());
    const [failedIndices, setFailedIndices] = useState<Set<number>>(new Set());

    const currentIndex = photos.findIndex(p => p.id === previewPhotoId);

    const slides = useMemo(() => photos.map((p, i) => {
      const rotation = rotationMap.get(p.id) || 0;
      const isFailed = failedIndices.has(i);
      const src = isFailed
        ? (isTauri() ? convertFileSrc("") : "") // placeholder for fallback
        : (isTauri() ? convertFileSrc(p.filePath) : "file://" + p.filePath.replace(/\\/g, "/"));
      return {
        src,
        width: p.imageWidth || undefined,
        height: p.imageHeight || undefined,
        alt: p.fileName,
        rotation,
      };
    }), [photos, rotationMap, failedIndices]);

    const slideRefs = useRef<(HTMLImageElement | null)[]>([]);

    const handleImageError = useCallback(async (index: number) => {
      if (failedIndices.has(index)) return;
      const photo = photos[index];
      if (!photo) return;
      try {
        const l2Path = await getPreviewImage(photo.filePath);
        setFailedIndices(prev => new Set(prev).add(index));
        // Update the slideRef to use L2
        const img = slideRefs.current[index];
        if (img) {
          img.src = isTauri() ? convertFileSrc(l2Path) : "file://" + l2Path.replace(/\\/g, "/");
        }
      } catch {
        // L2 also failed — leave error state
      }
    }, [failedIndices, photos]);

    const handleViewChange = useCallback(({ index }: { index: number }) => {
      const photo = photos[index];
      if (photo) setPreviewPhotoId(photo.id);
    }, [photos, setPreviewPhotoId]);

    // Auto-close if photoId no longer in filtered list
    useEffect(() => {
      if (previewPhotoId !== null && currentIndex === -1) {
        setPreviewPhotoId(null);
      }
    }, [previewPhotoId, currentIndex, setPreviewPhotoId]);

    // Rotation handler
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (e.key === "i" || e.key === "I") {
        setShowExif(v => !v);
        return;
      }
      if (e.key === "r" && previewPhotoId !== null) {
        setRotationMap(prev => {
          const next = new Map(prev);
          const current = next.get(previewPhotoId) || 0;
          next.set(previewPhotoId, e.shiftKey ? current - 90 : current + 90);
          return next;
        });
      }
    }, [previewPhotoId]);

    useEffect(() => {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    if (previewPhotoId === null || currentIndex === -1) return null;

    return (
      <div className="fixed inset-0 z-[99]">
        <Lightbox
          open={true}
          close={onClose}
          index={currentIndex}
          slides={slides}
          plugins={[Zoom, Fullscreen, Counter, Thumbnails, Slideshow]}
          animation={{ zoom: 300 }}
          zoom={{
            maxZoomPixelRatio: 4,
            zoomInMultiplier: 2,
            doubleTapDelay: 300,
          }}
          slideshow={{ delay: 3000 }}
          thumbnails={{ width: 80, height: 60 }}
          carousel={{
            preload: 2,
            finite: false,
          }}
          render={{
            buttonPrev: () => null,
            buttonNext: () => null,
          }}
          toolbar={{
            buttons: [
              <button key="close" onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <X size={20} className="text-white/80" />
              </button>,
              <button key="exif" onClick={() => setShowExif(v => !v)}
                className={`p-2 rounded-full transition-colors ${showExif ? "bg-white/20" : "hover:bg-white/10"}`}>
                <Monitor size={18} className="text-white/80" />
              </button>,
              <button key="fullscreen" className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <Maximize2 size={18} className="text-white/80" />
              </button>,
            ],
          }}
          on={{
            view: handleViewChange,
          }}
        />
        {showExif && (
          <ExifPanel photo={photos[currentIndex]} />
        )}
      </div>
    );
  }
  ```

  Wait — the `render` API in YARL v3 might be different. Let me simplify the implementation to use the standard toolbar props and just render the EXIF panel as a sibling overlay.

  Actually, `render` is a YARL 3.x prop. Let me check what version we're using (3.32.0). In v3, custom toolbar buttons use `render` with a `slide`? No, they use `toolbar.buttons` array. But `toolbar.buttons` takes arrays of React elements for built-in button positions... hmm, this is getting complex with YARL's specific API.

  Let me simplify: just render the EXIF panel as a sibling `<div>` (absolute positioned) and handle keyboard with a global keydown. Use YARL's built-in toolbar.

  ```tsx
  export function PhotoPreview({
    photos,
    onClose,
  }: {
    photos: Photo[];
    onClose: () => void;
  }) {
    const { previewPhotoId, setPreviewPhotoId } = useAppStore();
    const [showExif, setShowExif] = useState(true);
    const [rotationMap, setRotationMap] = useState<Map<number, number>>(new Map());
    const [slideSrcs, setSlideSrcs] = useState<Map<number, string>>(new Map());

    const currentIndex = photos.findIndex(p => p.id === previewPhotoId);

    const slides = useMemo(() => photos.map((p, i) => ({
      src: slideSrcs.get(i) || (isTauri() ? convertFileSrc(p.filePath) : ""),
      width: p.imageWidth || undefined,
      height: p.imageHeight || undefined,
      alt: p.fileName,
    })), [photos, slideSrcs]);

    // Try original, fall back to L2 on error
    const handleViewChange = useCallback(({ index }: { index: number }) => {
      const photo = photos[index];
      if (photo) {
        setPreviewPhotoId(photo.id);
        // If this slide hasn't been loaded yet, try original src
        if (!slideSrcs.has(index)) {
          // Already using original via convertFileSrc — error will trigger fallback
        }
      }
    }, [photos, setPreviewPhotoId, slideSrcs]);

    // Fallback logic using YARL's `render` custom image
    // Instead of the complex ref approach, we'll rebuild slides with L2 on error
    const handleError = useCallback(async (index: number) => {
      if (slideSrcs.has(index)) return; // Already fallback
      const photo = photos[index];
      if (!photo) return;
      try {
        const l2Path = await getPreviewImage(photo.filePath);
        const src = isTauri() ? convertFileSrc(l2Path) : "";
        setSlideSrcs(prev => new Map(prev).set(index, src));
      } catch {
        // stay on broken state
      }
    }, [photos, slideSrcs]);

    // Override slide rendering to attach onError
    const renderSlide = useCallback((_slide: any, index: number) => {
      const photo = photos[index];
      if (!photo) return null;
      const src = isTauri()
        ? convertFileSrc(slideSrcs.get(index) || photo.filePath)
        : "";
      const rotation = rotationMap.get(photo.id) || 0;
      return (
        <img
          src={src}
          alt={photo.fileName}
          style={{ transform: `rotate(${rotation}deg)`, transition: "transform 0.2s" }}
          className="max-w-full max-h-full object-contain"
          onError={() => handleError(index)}
        />
      );
    }, [photos, slideSrcs, rotationMap, handleError]);

    // Keyboard: I for EXIF toggle, R for rotation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (e.key === "i" || e.key === "I") {
        setShowExif(v => !v);
        return;
      }
      if (e.key === "r" && previewPhotoId !== null) {
        e.preventDefault();
        setRotationMap(prev => {
          const next = new Map(prev);
          const current = next.get(previewPhotoId) || 0;
          next.set(previewPhotoId, e.shiftKey ? current - 90 : current + 90);
          return next;
        });
      }
    }, [previewPhotoId]);

    useEffect(() => {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Auto-close if photoId no longer in list
    useEffect(() => {
      if (previewPhotoId !== null && currentIndex === -1) {
        setPreviewPhotoId(null);
      }
    }, [previewPhotoId, currentIndex, setPreviewPhotoId]);

    if (previewPhotoId === null || currentIndex === -1) return null;

    const currentPhoto = photos[currentIndex];

    return (
      <div className="fixed inset-0 z-[99]">
        <Lightbox
          open={true}
          close={onClose}
          index={currentIndex}
          slides={slides}
          plugins={[Zoom, Fullscreen, Counter, Thumbnails, Slideshow]}
          animation={{ zoom: 300 }}
          zoom={{
            maxZoomPixelRatio: 4,
            zoomInMultiplier: 2,
            doubleTapDelay: 300,
          }}
          slideshow={{ delay: 3000 }}
          thumbnails={{ width: 80, height: 60 }}
          carousel={{ preload: 2, finite: false }}
          on={{
            view: handleViewChange,
          }}
          render={{
            slide: renderSlide,
          }}
        />
        {showExif && currentPhoto && (
          <ExifPanel photo={currentPhoto} />
        )}
      </div>
    );
  }
  ```

  Simplified EXIF panel:
  ```tsx
  function ExifPanel({ photo }: { photo: Photo }) {
    ...
  }
  ```

  Note: I need to handle the `render.slide` prop correctly in YARL v3. The `render` prop takes `{ slide: (slide, index) => JSX }`.

- [ ] **Step 2: Verify TS compiles (partial — skip App.tsx mount since not wired yet)**

  Run: `npx tsc --noEmit`
  Expected: some errors because App.tsx doesn't use PhotoPreview yet

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/browser/PhotoPreview.tsx
  git commit -m "feat: add PhotoPreview component with YARL, EXIF panel, rotation, L2 fallback"
  ```

---

### Task 4: Wire PhotoPreview into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Import and render PhotoPreview**

  Import:
  ```tsx
  import { PhotoPreview } from "./components/browser/PhotoPreview";
  ```

  Import store:
  ```tsx
  const { ... previewPhotoId, setPreviewPhotoId } = useAppStore();
  ```

  At the bottom of the main `<div>` (before StatusBar or inside the flex container), add:
  ```tsx
  <PhotoPreview
    photos={filteredPhotos}
    onClose={() => setPreviewPhotoId(null)}
  />
  ```

  Place it after the right panel or at the end of the main content div.

- [ ] **Step 2: Build + verify**

  Run: `npm run build`
  Expected: build succeeds

- [ ] **Step 3: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat: wire PhotoPreview into App.tsx"
  ```

---

### Task 5: Tests + Final verification

**Files:**
- Create: `src/components/browser/__tests__/PhotoPreview.test.tsx`

- [ ] **Step 1: Write PhotoPreview test**

  ```tsx
  import { describe, it, expect, vi, beforeEach } from "vitest";
  import React from "react";
  import { render } from "@testing-library/react";

  vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: (p: string) => `asset://${p}`,
    invoke: vi.fn(),
  }));

  vi.mock("../../api", () => ({
    getPreviewImage: vi.fn().mockResolvedValue("C:/cache/v7_l2.jpg"),
    isTauri: () => false,
  }));

  // Mock YARL — Lightbox is complex
  vi.mock("yet-another-react-lightbox", () => ({
    __esModule: true,
    default: ({ open, children }: any) => open ? <div data-testid="lightbox">{children}</div> : null,
  }));

  // Mock YARL plugins
  vi.mock("yet-another-react-lightbox/plugins/zoom", () => ({ default: {} }));
  vi.mock("yet-another-react-lightbox/plugins/fullscreen", () => ({ default: {} }));
  vi.mock("yet-another-react-lightbox/plugins/counter", () => ({ default: {} }));
  vi.mock("yet-another-react-lightbox/plugins/thumbnails", () => ({ default: {} }));
  vi.mock("yet-another-react-lightbox/plugins/slideshow", () => ({ default: {} }));

  import { PhotoPreview } from "../PhotoPreview";
  import { useAppStore } from "../../../stores/appStore";

  function makePhoto(id: number, overrides = {}) {
    return {
      id, filePath: `C:/photos/${id}.jpg`, fileName: `${id}.jpg`,
      fileSize: 1000, fileDate: 0, mediaType: "jpg",
      thumbnailUrl: "", thumbnailCachePath: "",
      dateTaken: "2024-01-15", cameraMake: "Canon", cameraModel: "EOS R5",
      lensModel: "RF 24-70mm f/2.8", focalLength: 50, aperture: 2.8,
      shutterSpeed: "1/250", iso: 400, exposureComp: 0,
      flash: "", whiteBalance: "Auto", meteringMode: "Evaluative",
      imageWidth: 6720, imageHeight: 4480, colorSpace: "sRGB",
      latitude: null, longitude: null, altitude: null,
      software: "", copyright: "", imageDescription: "",
      orientation: 0, exposureProgram: "", maxAperture: 0,
      focalLength35mm: 0, lensMake: "", sceneCaptureType: "",
      contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
      ...overrides,
    };
  }

  describe("PhotoPreview", () => {
    beforeEach(() => {
      useAppStore.setState({
        previewPhotoId: null,
        photos: [],
        albums: [],
        currentDir: "",
        currentFolder: "",
        leftTab: "album",
        filter: { cameraModels: [], lensModels: [],
          focalLengthMin: 0, focalLengthMax: 800,
          apertureMin: 0, apertureMax: 64, isoMin: 0, isoMax: 102400,
          dateFrom: "", dateTo: "", ratingMin: 0,
          colorLabels: [], flag: "", searchText: "" },
        sortBy: "fileName",
        sortOrder: "asc",
      });
    });

    it("renders nothing when previewPhotoId is null", () => {
      const { container } = render(
        <PhotoPreview photos={[]} onClose={() => {}} />
      );
      expect(container.querySelector("[data-testid='lightbox']")).toBeNull();
    });

    it("renders Lightbox when previewPhotoId is set", () => {
      useAppStore.setState({ previewPhotoId: 1 });
      const photos = [makePhoto(1), makePhoto(2)];
      const { getByTestId } = render(
        <PhotoPreview photos={photos} onClose={() => {}} />
      );
      expect(getByTestId("lightbox")).toBeTruthy();
    });

    it("shows EXIF panel with correct photo data", () => {
      useAppStore.setState({ previewPhotoId: 1 });
      const photos = [makePhoto(1, { cameraMake: "Nikon" })];
      const { getByText } = render(
        <PhotoPreview photos={photos} onClose={() => {}} />
      );
      expect(getByText("Nikon")).toBeTruthy();
    });
  });
  ```

- [ ] **Step 2: Run tests**

  Run: `npm run test`
  Expected: Passes

- [ ] **Step 3: Full build verification**

  Run: `npm run build` (typescript + vite)
  Expected: succeeds

- [ ] **Step 4: Rust check**

  Run: `cd src-tauri; cargo check`
  Expected: succeeds

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/browser/__tests__/PhotoPreview.test.tsx
  git commit -m "test: add PhotoPreview unit tests"
  ```
