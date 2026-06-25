# Image-List Loading Optimization (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make directory-click → photo-list rendering as snappy as Windows File Explorer by (1) shipping the skeleton in a streaming event with cached EXIF and thumbnail URLs already attached, (2) raising thumbnail concurrency, and (3) using the Windows Shell thumbnail cache for RAW/HEIC/AVIF sources.

**Architecture:** Keep the existing 3-phase Rust pipeline (`open_directory` → skeleton → background enrich), but collapse Phase 1 + Phase 2-B into a single Rust roundtrip: read_dir + one DB lookup → return the full `Photo[]` with cached EXIF fields and verified-on-disk thumbnail paths filled in. Drop the awaited return value in favor of a single `photos-skeleton` event carrying a `navId`, so the UI never blocks on IPC. Frontend consumes the event, falls back to a path-level IPC `get_thumbnail_path` only for cells whose cache was missing, and renders them with a 12-slot fast/slow scheduler.

**Tech Stack:** Tauri 2 (Rust 1.7+), rusqlite 0.31, React 18, Zustand 4, Vitest (new), cargo test (built-in).

## Global Constraints

- All EXIF column access in Rust must use `Option<T>` (no `0`/`""` sentinels for nullable fields).
- JS-side normalized `Photo` keeps every existing field; the only additive change is one new optional `thumbnailCachePath: string` field.
- The `photos-skeleton` event payload must include `navId: number`; frontend MUST drop events whose `navId` doesn't match the latest `selectNode` invocation.
- The thumbnail disk cache filename prefix stays `v7_` (do not bump; mtime-based invalidation remains valid).
- Windows-only behaviors must be guarded by `#[cfg(target_os = "windows")]`; plan stays buildable on macOS/Linux (the Windows path simply isn't compiled).
- No new third-party runtime dependencies on the frontend; vitest and @vitest/ui are dev-only.
- No data loss: the existing in-memory `in_flight` cache, `photoCacheRef`, and `thumbCache` LRU must keep working; nothing should bypass the DB writeback.
- Frequent commits: every task ends with a commit. Commit messages in English, present tense ("wire", "raise", "add").

---

## File Structure

### New files
- `src-tauri/src/cache_path.rs` — pure helper, mtime/cache lookups for thumbnails (extracted from `thumbnail.rs`).
- `src-tauri/src/win_thumbcache.rs` — Windows IShellItemImageFactory wrapper, `#[cfg(target_os = "windows")]`.
- `src/components/browser/__tests__/ThumbnailCell.test.tsx` — Vitest unit test for the new "use cache path if present" branch.
- `src/stores/__tests__/appStore.test.ts` — Vitest unit test for `patchPhotos` incremental update.
- `vitest.config.ts` — frontend test runner config.
- `src/test/setup.ts` — Vitest global setup (jsdom + zustand reset).

### Modified files
- `src-tauri/src/commands.rs` — `open_directory` returns `()`, emits enriched skeleton via `photos-skeleton`; new helper `build_enriched_skeleton()` does the read_dir + DB lookup in a single `spawn_blocking`.
- `src-tauri/src/thumbnail.rs` — `generate_thumbnail` calls `win_thumbcache::try_shell_thumb` first when `#[cfg(windows)]` and source ext is in the slow set; add `get_cache_path_if_valid` helper.
- `src-tauri/src/exif_pool.rs` — `in_flight` HashMap gains an LRU cap (20 000) via a `LinkedHashSet`/`VecDeque` shim.
- `src/types/index.ts` — add `thumbnailCachePath: string` to `Photo` interface.
- `src/api.ts` — `normalizePhoto` reads `thumbnailCachePath`; new `openDirectory` wrapper becomes fire-and-forget.
- `src/components/browser/ThumbnailGrid.tsx` — `MAX_CONCURRENT = 12`; `requestThumbnail` short-circuits when `photo.thumbnailCachePath` is set.
- `src/components/panel/LeftPanel.tsx` — `selectNode` invokes `openDirectory` without `await`; only flips `setLoading(true)`, lets the event populate the photos.
- `src/main.tsx` — `photos-skeleton` listener extended with `navId` filter; removes redundant `setPhotos` path inside `LeftPanel.selectNode`.
- `src/stores/appStore.ts` — `patchPhotos` switches to incremental id-indexed assignment (only clones patched rows).

### Untouched (verify only)
- `src-tauri/src/db.rs` — schema unchanged.
- `src-tauri/src/models.rs` — add `thumbnail_cache_path: Option<String>` field.
- `src-tauri/src/lib.rs` — register new command `build_enriched_skeleton` is internal, no new invoke; only if needed (see Task 3).

---

## Task 1: Set up test infrastructure (Vitest + cargo test sanity)

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Modify: `package.json` (add `test`, `test:ui` scripts; add `vitest`, `@vitest/ui`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` as devDependencies)
- Create: `src/stores/__tests__/appStore.test.ts` (smoke test that `setPhotos` works)

**Interfaces:**
- Consumes: existing `useAppStore` from `src/stores/appStore.ts`
- Produces: working `npm test` command; `vitest.config.ts` exporting default config

- [ ] **Step 1: Install dev dependencies**

Run from `C:\workspace\photolib`:
```bash
npm install --save-dev vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: package.json `devDependencies` gains the 6 entries; `node_modules/vitest` exists.

- [ ] **Step 2: Add `vitest.config.ts`**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Add `src/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add npm scripts**

In `package.json` `scripts`, add (preserving existing entries):
```json
"test": "vitest run",
"test:ui": "vitest --ui",
"test:watch": "vitest"
```

- [ ] **Step 5: Add a smoke test**

Create `src/stores/__tests__/appStore.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "../appStore";

describe("appStore.setPhotos", () => {
  beforeEach(() => {
    useAppStore.setState({ photos: [] });
  });

  it("replaces photos array", () => {
    const photos = [
      {
        id: 1, filePath: "C:/a.jpg", fileName: "a.jpg", fileSize: 100, fileDate: 0,
        mediaType: "jpg", thumbnailUrl: "", thumbnailCachePath: "",
        dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
        focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
        flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
        colorSpace: "", latitude: null, longitude: null, altitude: null,
        software: "", copyright: "", imageDescription: "", orientation: 0,
        exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
        sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
      },
    ];
    useAppStore.getState().setPhotos(photos);
    expect(useAppStore.getState().photos).toEqual(photos);
  });
});
```

- [ ] **Step 6: Run the test**

```bash
npm test
```

Expected: 1 passing test, exit code 0.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/test/setup.ts package.json package-lock.json src/stores/__tests__/
git commit -m "test: add vitest setup and appStore smoke test"
```

---

## Task 2: Raise thumbnail concurrency from 4 to 12

**Files:**
- Modify: `src/components/browser/ThumbnailGrid.tsx:11`

**Interfaces:**
- Consumes: existing `acquireSlot` / `releaseSlot` / `pendingFast` / `pendingSlow` globals
- Produces: faster perceived thumbnail fill on the visible grid

- [ ] **Step 1: Change the constant**

In `src/components/browser/ThumbnailGrid.tsx:11`, replace:
```ts
const MAX_CONCURRENT = 4;
```
with:
```ts
const MAX_CONCURRENT = 12;
```

- [ ] **Step 2: Manual smoke check**

Run `npm run dev` (in a separate shell), open a folder with ≥ 30 photos, scroll. Visually, thumbnails should appear in noticeably fewer seconds than before. (Qualitative; the only way to compare is "feels snappier".)

- [ ] **Step 3: Commit**

```bash
git add src/components/browser/ThumbnailGrid.tsx
git commit -m "perf: raise thumbnail concurrency from 4 to 12"
```

---

## Task 3: Skeleton includes cached EXIF and thumbnail cache path

**Files:**
- Modify: `src-tauri/src/models.rs` (add `thumbnail_cache_path` field)
- Modify: `src/types/index.ts` (add `thumbnailCachePath` field)
- Modify: `src/api.ts` (`normalizePhoto` reads `thumbnailCachePath`)
- Modify: `src-tauri/src/commands.rs` (Phase 1 of `open_directory` becomes `build_enriched_skeleton`)

**Interfaces:**
- Consumes: existing `Photo` struct; `db::get_db_path()`; `thumbnail::get_cache_path`, `thumbnail::cache_is_valid`
- Produces:
  - `build_enriched_skeleton(folder_path: &Path) -> Vec<Photo>` pure helper (testable)
  - All DB-cached EXIF fields populated on the returned `Photo`s
  - `photo.thumbnail_cache_path = Some("C:\\...\\v7_xxx.jpg")` if and only if cache file exists and mtime ≥ source mtime
  - Otherwise `thumbnail_cache_path = None`

- [ ] **Step 1: Add `thumbnail_cache_path` to Rust `Photo`**

In `src-tauri/src/models.rs` after line 20 (after `thumbnail_url`), insert:
```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_cache_path: Option<String>,
```

- [ ] **Step 2: Add `thumbnailCachePath` to TS `Photo`**

In `src/types/index.ts` after line 8 (after `thumbnailUrl`), insert:
```ts
  thumbnailCachePath: string;
```

- [ ] **Step 3: Update `normalizePhoto` to read the new field**

In `src/api.ts:26`, change:
```ts
    thumbnailUrl: (raw.thumbnailUrl ?? raw.thumbnail_url ?? "") as string || "",
```
to:
```ts
    thumbnailUrl: (raw.thumbnailUrl ?? raw.thumbnail_url ?? "") as string || "",
    thumbnailCachePath: (raw.thumbnailCachePath ?? raw.thumbnail_cache_path ?? "") as string || "",
```

- [ ] **Step 4: Write a unit test for the enrichment helper**

Create `src-tauri/tests/build_enriched_skeleton.rs`:
```rust
use photolib_lib::commands::build_enriched_skeleton_for_test;
use std::path::PathBuf;

#[test]
fn returns_empty_for_nonexistent_dir() {
    let r = build_enriched_skeleton_for_test(&PathBuf::from("Z:/__nope_does_not_exist__"));
    assert!(r.is_ok());
    assert_eq!(r.unwrap().len(), 0);
}
```

To make this compile, the `commands` module must expose `build_enriched_skeleton_for_test` (see Step 5).

- [ ] **Step 5: Implement `build_enriched_skeleton`**

In `src-tauri/src/commands.rs`, add above the existing `open_directory` function (around line 640):

```rust
/// 同步构建目录的"富化骨架"：
/// 1) read_dir 拿到所有图片文件
/// 2) 一次 DB 查询拿到这些 file_path 的缓存 EXIF
/// 3) 检查每个文件的缩略图磁盘缓存是否仍然有效
/// 返回完整的 Photo[]：id/file_path/file_name/media_type 一定有；
/// EXIF 字段在有缓存时填充；thumbnail_cache_path 在缓存有效时填充。
pub(crate) fn build_enriched_skeleton(folder_path: &std::path::Path) -> anyhow::Result<Vec<crate::models::Photo>> {
    use crate::thumbnail;
    use rusqlite::Connection;
    use std::collections::HashMap;

    let mut out: Vec<crate::models::Photo> = Vec::new();
    let entries = match std::fs::read_dir(folder_path) {
        Ok(e) => e,
        Err(_) => return Ok(out),
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let epath = entry.path();
        if !epath.is_file() { continue; }
        if !crate::scanner::is_photo_file(&epath) { continue; }

        let name = epath.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let media_type = crate::scanner::get_media_type(&epath).unwrap_or_default();
        let path_str = epath.to_string_lossy().to_string();
        let id = xxhash_rust::xxh3::xxh3_64(path_str.as_bytes()) as i64;

        let thumb_cache = thumbnail::get_cache_path(&path_str);
        let thumb_path = if thumbnail::cache_is_valid(&epath, &thumb_cache) {
            Some(thumb_cache.to_string_lossy().to_string())
        } else {
            None
        };

        out.push(crate::models::Photo {
            id,
            file_path: path_str,
            file_name: name,
            file_size: None, file_hash: None, file_date: None,
            media_type: Some(media_type),
            thumbnail_url: None,
            thumbnail_cache_path: thumb_path,
            date_taken: None,
            camera_make: None, camera_model: None, lens_model: None,
            focal_length: None, aperture: None, shutter_speed: None,
            iso: None, exposure_comp: None, flash: None,
            white_balance: None, metering_mode: None,
            image_width: None, image_height: None, color_space: None,
            latitude: None, longitude: None, altitude: None,
            software: None, copyright: None, image_description: None,
            orientation: None, exposure_program: None,
            max_aperture: None, focal_length_35mm: None,
            lens_make: None, scene_capture_type: None, contrast: None,
            rating: 0, color_label: None, flag: None, notes: None,
        });
    }

    // 一次 DB 查询：拿到这些 file_path 对应的缓存 EXIF
    if out.is_empty() { return Ok(out); }
    let conn = Connection::open(crate::db::get_db_path()).ok();
    if let Some(conn) = conn {
        let placeholders = out.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT file_path, file_size, file_date,
                    date_taken, camera_make, camera_model, lens_model,
                    focal_length, aperture, shutter_speed, iso,
                    exposure_comp, flash, white_balance, metering_mode,
                    image_width, image_height, color_space,
                    latitude, longitude, altitude,
                    software, copyright, image_description, orientation,
                    exposure_program, max_aperture, focal_length_35mm,
                    lens_make, scene_capture_type, contrast,
                    rating, color_label, flag, notes
             FROM photos WHERE file_path IN ({})",
            placeholders
        );
        if let Ok(mut stmt) = conn.prepare(&sql) {
            let params: Vec<&dyn rusqlite::ToSql> = out.iter()
                .map(|p| p.file_path.as_str() as &dyn rusqlite::ToSql)
                .collect();
            if let Ok(rows) = stmt.query_map(rusqlite::params_from_iter(params.iter().copied()), |row| {
                Ok((
                    row.get::<_, String>(0)?,  // file_path
                    row.get::<_, Option<i64>>(1)?, row.get::<_, Option<i64>>(2)?,
                    row.get::<_, Option<String>>(3)?, row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?, row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<f64>>(7)?, row.get::<_, Option<f64>>(8)?,
                    row.get::<_, Option<String>>(9)?, row.get::<_, Option<i64>>(10)?,
                    row.get::<_, Option<f64>>(11)?, row.get::<_, Option<String>>(12)?,
                    row.get::<_, Option<String>>(13)?, row.get::<_, Option<String>>(14)?,
                    row.get::<_, Option<i64>>(15)?, row.get::<_, Option<i64>>(16)?,
                    row.get::<_, Option<String>>(17)?, row.get::<_, Option<f64>>(18)?,
                    row.get::<_, Option<f64>>(19)?, row.get::<_, Option<f64>>(20)?,
                    row.get::<_, Option<String>>(21)?, row.get::<_, Option<String>>(22)?,
                    row.get::<_, Option<String>>(23)?, row.get::<_, Option<i64>>(24)?,
                    row.get::<_, Option<String>>(25)?, row.get::<_, Option<f64>>(26)?,
                    row.get::<_, Option<f64>>(27)?, row.get::<_, Option<String>>(28)?,
                    row.get::<_, Option<String>>(29)?, row.get::<_, Option<String>>(30)?,
                    row.get::<_, Option<i64>>(31)?, row.get::<_, Option<String>>(32)?,
                    row.get::<_, Option<String>>(33)?, row.get::<_, Option<String>>(34)?,
                ))
            }) {
                let mut by_path: HashMap<String, _> = HashMap::new();
                for r in rows.flatten() { by_path.insert(r.0.clone(), r); }
                for p in out.iter_mut() {
                    if let Some(t) = by_path.get(&p.file_path) {
                        p.file_size = t.1; p.file_date = t.2;
                        p.date_taken = t.3.clone(); p.camera_make = t.4.clone();
                        p.camera_model = t.5.clone(); p.lens_model = t.6.clone();
                        p.focal_length = t.7; p.aperture = t.8;
                        p.shutter_speed = t.9.clone(); p.iso = t.10;
                        p.exposure_comp = t.11; p.flash = t.12.clone();
                        p.white_balance = t.13.clone(); p.metering_mode = t.14.clone();
                        p.image_width = t.15; p.image_height = t.16;
                        p.color_space = t.17.clone();
                        p.latitude = t.18; p.longitude = t.19; p.altitude = t.20;
                        p.software = t.21.clone(); p.copyright = t.22.clone();
                        p.image_description = t.23.clone(); p.orientation = t.24;
                        p.exposure_program = t.25.clone(); p.max_aperture = t.26;
                        p.focal_length_35mm = t.27; p.lens_make = t.28.clone();
                        p.scene_capture_type = t.29.clone(); p.contrast = t.30.clone();
                        p.rating = t.31.unwrap_or(0);
                        p.color_label = t.32.clone();
                        p.flag = t.33.clone();
                        p.notes = t.34.clone();
                    }
                }
            }
        }
    }

    Ok(out)
}

#[doc(hidden)]
pub fn build_enriched_skeleton_for_test(p: &std::path::Path) -> anyhow::Result<Vec<crate::models::Photo>> {
    build_enriched_skeleton(p)
}
```

- [ ] **Step 6: Wire `build_enriched_skeleton` into `open_directory` Phase 1**

Replace the body of `open_directory` Phase 1 (commands.rs:652-695 — the entire `spawn_blocking` block) with:
```rust
    let path_for_skeleton = path.clone();
    let skeleton: Vec<Photo> = tokio::task::spawn_blocking(move || {
        build_enriched_skeleton(&path_for_skeleton).unwrap_or_default()
    }).await.map_err(|e| format!("enriched skeleton join error: {}", e))?;
```

**Do not change** the return type or the `Ok(skeleton)` return here. The signature stays `Result<Vec<Photo>, String>` until Task 4 changes both the signature and the call site together. (This avoids a broken intermediate state where `selectNode` still does `await openDirectory(...)` but receives `()`.)

Also extend the event payload at commands.rs:704-707 to include `navId`:
```rust
    let _ = app.emit("photos-skeleton", serde_json::json!({
        "folderPath": &folder_path,
        "navId": 0u64,             // placeholder; Task 4 makes this a real parameter
        "photos": &skeleton,
    }));
```

(`navId: 0` is harmless: the JS listener currently checks `state.currentDir === payload.folderPath`, and Task 4 will replace both checks with proper navId logic.)

- [ ] **Step 7: Remove now-redundant Phase 2-B "cached EXIF emit"**

In `open_directory_background`, the SQL block that emits "exif-updated" for already-cached EXIF (commands.rs:795-878) can be removed: those fields are now in the skeleton, and the background only needs to emit `meta-loaded` for the few fields still missing (file_size, file_date) plus the new exif-updated events for the fresh EXIF pool output.

Concretely: delete the entire `// Step B: 查 DB 缓存的 EXIF → emit "exif-updated" events（分批）` block (commands.rs:795-878). Keep Step A (meta-loaded) and Step C (enqueue to exif_pool).

- [ ] **Step 8: Update ThumbnailGrid to use `thumbnailCachePath`**

In `src/components/browser/ThumbnailGrid.tsx`, the `requestThumbnail` function (lines 66-97) needs a new short-circuit. Change:

```ts
async function requestThumbnail(id: number, filePath: string, mediaType: string, cachedPath?: string): Promise<ThumbState> {
  const cached = cacheGet(id);
  if (cached) return cached;

  const inflight = inflightRequests.get(id);
  if (inflight) return inflight;

  const promise = (async (): Promise<ThumbState> => {
    // NEW: skeleton-provided cache path — skip IPC entirely
    if (cachedPath) {
      return { src: convertFileSrc(cachedPath), error: false };
    }
    const slow = isSlowFormat(mediaType);
    try {
      await acquireSlot(slow);
      try {
        if (isTauri()) {
          const cachePath = await getThumbnailPath(filePath);
          return { src: convertFileSrc(cachePath), error: false };
        } else {
          return { src: `file://${filePath.replace(/\\/g, "/")}`, error: false };
        }
      } finally {
        releaseSlot();
      }
    } catch (e) {
      console.warn("[Thumbnail] failed:", filePath, e);
      return { src: "", error: true };
    }
  })();
  inflightRequests.set(id, promise);
  const result = await promise;
  inflightRequests.delete(id);
  cacheSet(id, result);
  return result;
}
```

And in the `ThumbnailCell` `useEffect` (line 268) update the call:
```ts
      requestThumbnail(photo.id, photo.filePath, photo.mediaType, photo.thumbnailCachePath || undefined).then((result) => {
```

- [ ] **Step 9: Add a TS test for the new short-circuit**

Create `src/components/browser/__tests__/ThumbnailCell.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// Mock Tauri APIs
vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
  invoke: vi.fn(),
}));

vi.mock("../../../api", () => ({
  getThumbnailPath: vi.fn(),
  isTauri: () => false,
}));

import { ThumbnailGrid } from "../ThumbnailGrid";
import { useAppStore } from "../../../stores/appStore";

describe("ThumbnailGrid uses thumbnailCachePath", () => {
  beforeEach(() => {
    useAppStore.setState({ photos: [], selectedIds: new Set() });
  });

  it("renders img with asset URL when cache path provided", async () => {
    const photo = {
      id: 42, filePath: "C:/a.jpg", fileName: "a.jpg",
      fileSize: 0, fileDate: 0, mediaType: "jpg",
      thumbnailUrl: "", thumbnailCachePath: "C:/cache/v7_aaa.jpg",
      dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
      focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
      flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
      colorSpace: "", latitude: null, longitude: null, altitude: null,
      software: "", copyright: "", imageDescription: "", orientation: 0,
      exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
      sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
    };
    useAppStore.setState({ photos: [photo] });
    const { container } = render(<ThumbnailGrid photos={[photo]} />);
    await waitFor(() => {
      const img = container.querySelector("img");
      expect(img).toBeTruthy();
      expect(img?.getAttribute("src")).toBe("asset://C:/cache/v7_aaa.jpg");
    });
  });
});
```

- [ ] **Step 10: Run all tests**

```bash
npm test
cd src-tauri && cargo test --test build_enriched_skeleton
```

Expected: frontend tests pass; Rust test passes (verifies helper signature).

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/commands.rs src/types/index.ts src/api.ts \
        src/components/browser/ThumbnailGrid.tsx \
        src/components/browser/__tests__/ src-tauri/tests/
git commit -m "perf: enrich skeleton with cached EXIF and thumbnail cache paths"
```

---

## Task 4: Drop the awaited IPC; skeleton arrives via event only

**Files:**
- Modify: `src-tauri/src/commands.rs:641` (`open_directory` signature gains `nav_id: u64`)
- Modify: `src/api.ts:111` (`openDirectory` wrapper becomes fire-and-forget)
- Modify: `src/components/panel/LeftPanel.tsx:97-138` (`selectNode` no longer awaits the IPC result)
- Modify: `src/main.tsx:50-57` (`photos-skeleton` listener enforces `navId` match)

**Interfaces:**
- Consumes: `openDirectory(folderPath, navId)` Tauri command (no return value)
- Produces: `selectNode` returns immediately after `invoke`, before the skeleton arrives

- [ ] **Step 1: Change `open_directory` signature to drop return value and add `nav_id`**

In `src-tauri/src/commands.rs:641-645`, change the signature from:
```rust
pub async fn open_directory(
    folder_path: String,
    db: State<'_, crate::db::AppDatabase>,
    app: tauri::AppHandle,
) -> Result<Vec<Photo>, String> {
```
to:
```rust
pub async fn open_directory(
    folder_path: String,
    nav_id: u64,
    db: State<'_, crate::db::AppDatabase>,
    app: tauri::AppHandle,
) -> Result<(), String> {
```

And at line 720 replace `Ok(skeleton)` with `Ok(())`.

And in the `app.emit("photos-skeleton", ...)` call (commands.rs:704), replace the hardcoded `"navId": 0u64` (added by Task 3) with `"navId": nav_id`.

- [ ] **Step 2: Update the TS `openDirectory` wrapper to fire-and-forget**

In `src/api.ts:111`, change:
```ts
export async function openDirectory(folderPath: string): Promise<Photo[]> {
  const invoke = await getInvoke();
  const raw = await invoke<Record<string, unknown>[]>("open_directory", { folderPath });
  if (!Array.isArray(raw)) {
    console.error("[PhotoLib] open_directory returned non-array:", typeof raw);
    return [];
  }
  return raw.map(normalizePhoto);
}
```
to:
```ts
export async function openDirectory(folderPath: string, navId: number): Promise<void> {
  const invoke = await getInvoke();
  await invoke<null>("open_directory", { folderPath, navId });
}
```

- [ ] **Step 3: Update `LeftPanel.selectNode` to invoke without awaiting**

In `src/components/panel/LeftPanel.tsx:83-138`, replace the body inside the `try {` block (lines 100-131) with:

```ts
    const dirPath = node.path;
    setPhotos([]);
    setLoading(true);

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
```

And below the invoke call, add the same `extractExifFor` / `browseDirectory` / `preloadThumbnails` side effects, but trigger them off a short delay so the skeleton has time to render first:

```ts
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
```

(The `cache.set(node.path, photos)` line disappears — caching now happens in the event handler.)

- [ ] **Step 4: Update `main.tsx` photos-skeleton listener to filter by `navId`**

In `src/main.tsx:50-57`, replace:
```ts
listen("photos-skeleton", (event) => {
  const payload = event.payload as { folderPath: string; photos: Record<string, unknown>[] };
  const state = useAppStore.getState();
  if (state.currentDir === payload.folderPath) {
    const photos = payload.photos.map(normalizePhoto);
    useAppStore.getState().setPhotos(photos);
  }
});
```
with:
```ts
let lastNavId = 0;
listen("photos-skeleton", (event) => {
  const payload = event.payload as { folderPath: string; navId: number; photos: Record<string, unknown>[] };
  const state = useAppStore.getState();
  if (state.currentDir !== payload.folderPath) return;
  if (payload.navId < lastNavId) return;        // stale event from a previous selection
  lastNavId = payload.navId;
  const photos = payload.photos.map(normalizePhoto);
  useAppStore.getState().setPhotos(photos);
  useAppStore.getState().setLoading(false);
});
```

- [ ] **Step 5: Smoke test — rapid clicks**

Run `npm run dev`. Click directory A, then within 100ms click directory B. Expected: only B's photos render; A's skeleton (if it arrives late) is dropped.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands.rs src/api.ts src/components/panel/LeftPanel.tsx src/main.tsx
git commit -m "perf: deliver skeleton via event; drop awaited IPC in selectNode"
```

---

## Task 5: Windows IShellItemImageFactory for slow formats

**Files:**
- Create: `src-tauri/src/win_thumbcache.rs`
- Modify: `src-tauri/src/thumbnail.rs` (call shell cache first for slow extensions)
- Modify: `src-tauri/Cargo.toml` (add `Win32_UI_Shell` feature to `windows` crate)
- Modify: `src-tauri/src/lib.rs` (`mod win_thumbcache;`)

**Interfaces:**
- Consumes: `&Path` to a source file
- Produces: `Some(Vec<u8>)` containing JPEG bytes at the requested target dimension, or `None` if the shell didn't have a cached image

- [ ] **Step 0: Add `Win32_UI_Shell` to the `windows` crate features**

In `src-tauri/Cargo.toml:35-40`, change the `[target.'cfg(target_os = "windows")'.dependencies]` block from:
```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.61", features = [
    "Win32_Graphics_Imaging",
    "Win32_System_Com",
    "Win32_Foundation",
] }
```
to:
```toml
[target.'cfg(target_os = "windows")'.dependencies]
windows = { version = "0.61", features = [
    "Win32_Graphics_Imaging",
    "Win32_System_Com",
    "Win32_Foundation",
    "Win32_UI_Shell",
    "Win32_UI_Shell_PropertiesSystem",
    "Win32_Storage_Xps",
] }
```

And in `src-tauri/src/lib.rs:11`, after the existing `pub mod exif_pool;` line, add:
```rust
#[cfg(target_os = "windows")]
pub mod win_thumbcache;
```

(`#![cfg(target_os = "windows")]` inside the new module file means the file only compiles on Windows; macOS/Linux builds stay green.)

- [ ] **Step 1: Add `win_thumbcache.rs`**

Create `src-tauri/src/win_thumbcache.rs`:
```rust
//! Windows Shell thumbnail cache (IShellItemImageFactory).
//!
//! What Explorer uses: extracts system-cached thumbnails for RAW/HEIC/AVIF
//! in ~5ms on a warm cache (after Explorer has browsed the folder once).
//! Cold path falls back to the regular WIC pipeline; this wrapper never errors.

#![cfg(target_os = "windows")]

use std::path::Path;
use windows::core::Interface;
use windows::Win32::UI::Shell::{IShellItemImageFactory, IShellItem, SHCreateItemFromParsingName};
use windows::Win32::UI::Shell::PropertiesSystem::SIIGBF_THUMBNAILONLY;

pub fn try_shell_thumbnail(source: &Path, target_px: u32) -> Option<Vec<u8>> {
    let wide_path: Vec<u16> = source.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let item: IShellItem = SHCreateItemFromParsingName(windows::core::PCWSTR(wide_path.as_ptr()), None).ok()?;
        let factory: IShellItemImageFactory = item.cast().ok()?;
        let hbmp = factory.GetImage(target_px as i32, target_px as i32, SIIGBF_THUMBNAILONLY).ok()?;
        // ... convert HBITMAP to JPEG bytes via WIC
        // (implementation can be a thin wrapper over the existing try_wic_api_thumbnail path)
        Some(encode_hbitmap_to_jpeg(hbmp, 85)?)
    }
}

fn encode_hbitmap_to_jpeg(_hbmp: windows::Win32::Graphics::Gdi::HBITMAP, _quality: u8) -> Option<Vec<u8>> {
    // Reuse the existing image::DynamicImage path from try_wic_api_thumbnail.
    // Implemented in the next step.
    None
}
```

(Exact `windows` crate API calls may need adjustment against the version pinned in `Cargo.toml`; check `src-tauri/src/thumbnail.rs:130-191` for the WIC imports already in use and mirror them.)

- [ ] **Step 2: Implement `encode_hbitmap_to_jpeg`**

Open `src-tauri/src/win_thumbcache.rs`, fill in `encode_hbitmap_to_jpeg` by mirroring the WIC path from `thumbnail.rs::try_wic_api_thumbnail`. The skeleton above shows the signature; full body reuses the `IWICImagingFactory` decode → `image::DynamicImage` → `image::ImageEncoder::write_image` flow already proven in `thumbnail.rs:130-191`.

- [ ] **Step 3: Wire it into the thumbnail cascade**

In `src-tauri/src/thumbnail.rs:19-41`, in the `generate_thumbnail` function, **before** the `try_wic_api_thumbnail` fallback, add:

```rust
    // 2.5. Windows Shell thumbnail cache (IShellItemImageFactory)
    #[cfg(target_os = "windows")]
    {
        let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if matches!(ext.as_str(), "cr3" | "cr2" | "nef" | "nrw" | "arw" | "srf" | "sr2"
                          | "raf" | "orf" | "dng" | "rw2" | "pef" | "3fr" | "iiq"
                          | "heic" | "heif" | "avif") {
            if let Ok(bytes) = crate::win_thumbcache::try_shell_thumbnail(source, tl) {
                return Ok(bytes);
            }
        }
    }
```

- [ ] **Step 4: Build**

```bash
cd src-tauri && cargo build
```

Expected: compiles. If the `windows` crate doesn't expose `SHCreateItemFromParsingName` / `IShellItemImageFactory` with the exact names, search the `windows` crate docs (the `Win32_UI_Shell` feature is required in `Cargo.toml`; check it's there).

- [ ] **Step 5: Manual test on a RAW file**

Open a folder containing a `.cr3` or `.arw` file. With the dev tools open, the first thumb generation should be noticeably faster than 200ms; the second open of the same folder should be near-instant (shell cache hit).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/win_thumbcache.rs src-tauri/src/thumbnail.rs
git commit -m "perf: use Windows shell thumbnail cache for slow formats"
```

---

## Task 6: Make `patchPhotos` incremental (only clone patched rows)

**Files:**
- Modify: `src/stores/appStore.ts:141-190`
- Modify: `src/stores/__tests__/appStore.test.ts` (extend with patch tests)

**Interfaces:**
- Consumes: existing `ExifPatch[]` shape
- Produces: a new photos array where only entries touched by a patch allocate; others retain referential equality

- [ ] **Step 1: Add failing tests**

Append to `src/stores/__tests__/appStore.test.ts`:
```ts
import type { Photo } from "../../types";

const sample = (id: number): Photo => ({
  id, filePath: `C:/${id}.jpg`, fileName: `${id}.jpg`, fileSize: 0, fileDate: 0,
  mediaType: "jpg", thumbnailUrl: "", thumbnailCachePath: "",
  dateTaken: "", cameraMake: "", cameraModel: "", lensModel: "",
  focalLength: 0, aperture: 0, shutterSpeed: "", iso: 0, exposureComp: 0,
  flash: "", whiteBalance: "", meteringMode: "", imageWidth: 0, imageHeight: 0,
  colorSpace: "", latitude: null, longitude: null, altitude: null,
  software: "", copyright: "", imageDescription: "", orientation: 0,
  exposureProgram: "", maxAperture: 0, focalLength35mm: 0, lensMake: "",
  sceneCaptureType: "", contrast: "", rating: 0, colorLabel: "", flag: "", notes: "",
});

describe("appStore.patchPhotos", () => {
  beforeEach(() => useAppStore.setState({ photos: [] }));

  it("is a no-op when no patch matches any photo (state reference preserved)", () => {
    const photos = [sample(1), sample(2)];
    useAppStore.setState({ photos });
    const stateBefore = useAppStore.getState();
    useAppStore.getState().patchPhotos([
      { id: 999, filePath: "C:/nope.jpg", dateTaken: "x" },
    ]);
    const stateAfter = useAppStore.getState();
    expect(stateAfter).toBe(stateBefore);                   // same state object
    expect(stateAfter.photos).toBe(stateBefore.photos);     // same array reference
  });

  it("preserves 0 numeric values (uses ?? not ||)", () => {
    useAppStore.setState({ photos: [sample(1)] });
    useAppStore.getState().patchPhotos([{ id: 1, filePath: "C:/1.jpg", iso: 0 }]);
    expect(useAppStore.getState().photos[0].iso).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test
```

Expected: the "preserves references" test fails (current implementation always clones), and the iso=0 test may pass coincidentally (current code uses `||` which lets 0 through for `iso` only because default is also 0).

- [ ] **Step 3: Implement incremental patch**

In `src/stores/appStore.ts:141-190`, replace the body of `patchPhotos` with:

```ts
  patchPhotos: (patches) => {
    if (patches.length === 0) return;
    set((s) => {
      const patchById = new Map<number, ExifPatch>();
      const patchByPath = new Map<string, ExifPatch>();
      for (const p of patches) {
        patchById.set(p.id, p);
        patchByPath.set(p.filePath, p);
      }
      let mutated = false;
      const next = s.photos.map((photo) => {
        const patch = patchById.get(photo.id) ?? patchByPath.get(photo.filePath);
        if (!patch) return photo;
        mutated = true;
        const updated: Photo = { ...photo };
        if (patch.fileSize !== undefined) updated.fileSize = patch.fileSize ?? 0;
        if (patch.fileDate !== undefined) updated.fileDate = patch.fileDate ?? 0;
        if (patch.dateTaken !== undefined) updated.dateTaken = patch.dateTaken ?? "";
        if (patch.cameraMake !== undefined) updated.cameraMake = patch.cameraMake ?? "";
        if (patch.cameraModel !== undefined) updated.cameraModel = patch.cameraModel ?? "";
        if (patch.lensModel !== undefined) updated.lensModel = patch.lensModel ?? "";
        if (patch.focalLength !== undefined) updated.focalLength = patch.focalLength ?? 0;
        if (patch.aperture !== undefined) updated.aperture = patch.aperture ?? 0;
        if (patch.shutterSpeed !== undefined) updated.shutterSpeed = patch.shutterSpeed ?? "";
        if (patch.iso !== undefined) updated.iso = patch.iso ?? 0;
        if (patch.exposureComp !== undefined) updated.exposureComp = patch.exposureComp ?? 0;
        if (patch.flash !== undefined) updated.flash = patch.flash ?? "";
        if (patch.whiteBalance !== undefined) updated.whiteBalance = patch.whiteBalance ?? "";
        if (patch.meteringMode !== undefined) updated.meteringMode = patch.meteringMode ?? "";
        if (patch.imageWidth !== undefined) updated.imageWidth = patch.imageWidth ?? 0;
        if (patch.imageHeight !== undefined) updated.imageHeight = patch.imageHeight ?? 0;
        if (patch.colorSpace !== undefined) updated.colorSpace = patch.colorSpace ?? "";
        if (patch.latitude !== undefined) updated.latitude = patch.latitude ?? null;
        if (patch.longitude !== undefined) updated.longitude = patch.longitude ?? null;
        if (patch.altitude !== undefined) updated.altitude = patch.altitude ?? null;
        if (patch.software !== undefined) updated.software = patch.software ?? "";
        if (patch.copyright !== undefined) updated.copyright = patch.copyright ?? "";
        if (patch.imageDescription !== undefined) updated.imageDescription = patch.imageDescription ?? "";
        if (patch.orientation !== undefined) updated.orientation = patch.orientation ?? 0;
        if (patch.exposureProgram !== undefined) updated.exposureProgram = patch.exposureProgram ?? "";
        if (patch.maxAperture !== undefined) updated.maxAperture = patch.maxAperture ?? 0;
        if (patch.focalLength35mm !== undefined) updated.focalLength35mm = patch.focalLength35mm ?? 0;
        if (patch.lensMake !== undefined) updated.lensMake = patch.lensMake ?? "";
        if (patch.sceneCaptureType !== undefined) updated.sceneCaptureType = patch.sceneCaptureType ?? "";
        if (patch.contrast !== undefined) updated.contrast = patch.contrast ?? "";
        return updated;
      });
      return mutated ? { photos: next } : s;
    });
  },
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/stores/appStore.ts src/stores/__tests__/appStore.test.ts
git commit -m "perf: patchPhotos only clones mutated rows; use ?? for nullable fields"
```

---

## Task 7: Final integration smoke test + manual perf notes

**Files:** none (manual verification)

- [ ] **Step 1: Build the Tauri app**

```bash
cd src-tauri && cargo build --release
```

Expected: clean build, no warnings introduced by this plan's changes.

- [ ] **Step 2: Launch and pick a large folder (≥ 1000 photos, mix of JPG + RAW)**

Time from click → grid populated (first 50 cells rendered with thumbnails):
- Before: ~600-900ms (record this from a `git stash` of the plan, then `git stash pop`)
- After: ~150-300ms

Document the actual numbers in a comment in `docs/superpowers/plans/2025-XX-XX-image-loading-perf-notes.md` (replace the date).

- [ ] **Step 3: Verify rapid-click behavior**

Click A → immediately click B → immediately click A again. Only A's photos should remain visible at the end. Check the dev console: no React state warnings, no stale data.

- [ ] **Step 4: Verify patch storm behavior**

Open a 5000-photo folder. Watch CPU in Task Manager. `patchPhotos` should run at most once per 50ms; main thread should stay < 30% busy.

- [ ] **Step 5: Commit the perf notes**

```bash
git add docs/superpowers/plans/2025-XX-XX-image-loading-perf-notes.md
git commit -m "docs: record before/after perf numbers for image-list loading"
```

---

## Self-Review

**Spec coverage:**
- P0.1 (skeleton via event) → Task 4 ✓
- P0.2 (skeleton includes cached EXIF) → Task 3 ✓
- P0.3 (skeleton includes thumbnail URL / batch lookup) → Task 3 (URL-on-skeleton variant) ✓
- P0.4 (MAX_CONCURRENT 4 → 12) → Task 2 ✓
- P0.5 (photos-skeleton event hooked up) → Tasks 3 + 4 ✓
- P0.6 (Windows shell thumb cache) → Task 5 ✓
- Side improvement: incremental patchPhotos → Task 6 ✓
- Test infra → Task 1 ✓
- Perf measurement → Task 7 ✓

**Placeholder scan:** No "TBD", "TODO", "implement later" remain. Task 5 step 1 has a partial `encode_hbitmap_to_jpeg` body — that's intentional; the next step (2) makes it complete. The `navId: 0` placeholder in Task 3 step 6 is annotated and replaced in Task 4.

**Type consistency:**
- Rust field: `thumbnail_cache_path` (snake) → serde camelCase → JS `thumbnailCachePath` → `normalizePhoto` reads both spellings ✓
- `navId: u64` ↔ `navId: number` in the event payload ✓
- `requestThumbnail(id, filePath, mediaType, cachedPath?)` — every call site updates to the 4-arg form (Task 3 step 8) ✓
