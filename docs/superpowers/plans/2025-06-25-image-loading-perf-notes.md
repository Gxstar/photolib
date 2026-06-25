# Image-List Loading — P0 Performance Notes

**Date:** 2026-06-25
**Branch:** `perf/image-list-loading-p0`
**Plan:** `docs/superpowers/plans/2025-06-25-image-list-loading-p0.md`

## Summary

This branch implements the 6 P0 optimizations identified in the image-list loading analysis. Manual GUI timing was **not** possible in the headless CI environment; numbers below are **expected structural impact** based on the code changes, not measured timings.

## Changes by Item

### P0.1: Skeleton arrives via event (Task 4)
- **Change:** `open_directory` now returns `()` instead of `Vec<Photo>`. The skeleton reaches the frontend via the `photos-skeleton` event with a `navId` for stale-drop.
- **Files:** `src-tauri/src/commands.rs:786`, `src/api.ts:111`, `src/components/panel/LeftPanel.tsx:100-141`, `src/main.tsx:50-60`
- **Expected impact:** Removes the IPC roundtrip wait for the skeleton. First paint of the empty grid happens immediately on click; skeleton fills it ~50-200ms later (vs. waiting for the IPC to return before any paint).

### P0.2: Skeleton includes cached EXIF (Task 3)
- **Change:** New `build_enriched_skeleton` helper in `commands.rs` does a single `SELECT ... WHERE file_path IN (...)` against the photos table and fills the skeleton's EXIF fields from the DB.
- **File:** `src-tauri/src/commands.rs:642-770`
- **Expected impact:** Re-opening a previously-scanned directory shows full EXIF in the initial skeleton, not a two-stage "blank then enriched" rendering. Saves the ~500-1000ms "background EXIF batch" emission entirely on revisit.

### P0.3: Skeleton includes `thumbnail_cache_path` (Task 3)
- **Change:** New `thumbnail_cache_path: Option<String>` field on `Photo`. `build_enriched_skeleton` calls `thumbnail::cache_is_valid` and includes the on-disk cache path if still valid. The JS `requestThumbnail` short-circuits when the path is present, skipping both the IPC and the concurrency slot.
- **Files:** `src-tauri/src/models.rs:21-22`, `src/components/browser/ThumbnailGrid.tsx:66,75,272`
- **Expected impact:** For directories where most thumbs are already cached, eliminates 100-200 per-cell IPC roundtrips. First paint of a previously-browsed folder is "instant" (no IPC for cached thumbs).

### P0.4: Thumbnail concurrency 4 → 12 (Task 2)
- **Change:** One-line constant.
- **File:** `src/components/browser/ThumbnailGrid.tsx:11`
- **Expected impact:** Visible grid fills ~3x faster on uncached directories. 12 slots is still well below the browser's HTTP connection limit for `asset://` requests.

### P0.5: `photos-skeleton` event with `navId` filter (Tasks 3 + 4)
- **Change:** Event payload now includes `navId`; listener in `main.tsx` drops events whose `navId` is older than the last accepted one.
- **Files:** `src/main.tsx:50-60`, `src-tauri/src/commands.rs:812`
- **Expected impact:** Rapid A→B→A clicks always end on A's photos. No stale data leaks.

### P0.6: Windows Shell thumbnail cache (Task 5)
- **Change:** New `win_thumbcache.rs` module wraps `IShellItemImageFactory::GetImage` (the same API Windows Explorer uses) and is wired into the cascade **before** the `try_rawler_thumbnail` path for slow formats.
- **Files:** `src-tauri/src/win_thumbcache.rs` (new, 105 lines), `src-tauri/src/thumbnail.rs:23-37`
- **Expected impact:** RAW/HEIC/AVIF thumbs: 50-200ms (rawler) → 5-10ms (shell cache warm) on second+ visit. Cold (first-ever) visit is the same as before (shell cache miss → falls through to rawler).

### Side: Incremental `patchPhotos` (Task 6)
- **Change:** `mutated` flag in the `set` callback returns the previous state unchanged when no patch matches. All `||` → `??` for nullable field coalesces.
- **File:** `src/stores/appStore.ts:141-190`
- **Expected impact:** During a 5000-photo background EXIF extraction, the main thread no longer re-renders 5000 cells for every patch batch. Re-renders now scale with `patches.length` instead of `photos.length`.

## Verification

All automated tests pass on the final branch:
- Vitest: **4/4 passing**
- Rust: **1/1 passing** (`build_enriched_skeleton`)
- TypeScript: `npx tsc -b` clean
- Rust release: `cargo build --release` clean (4m 36s, no warnings)

## Known Follow-ups (Out of Scope for P0)

1. **`exif_pool.in_flight` HashMap never clears** — long-running sessions accumulate memory. A bounded LRU would cap it.
2. **`preloadThumbnails` could be parallelized** with a `JoinSet` and the `500ms` delay could be removed.
3. **Meta-loaded vs skeleton EXIF double-emit** — the background `fs::metadata` step still emits `meta-loaded` even though the skeleton already has `fileSize`/`fileDate` from the DB. Harmless but wasteful.
4. **The 200ms EXIF debounce in `rangeChanged`** could become adaptive (faster when scrolling fast, slower when idle).
5. **`Win32_Storage_Xps` Cargo feature** is enabled but unused — could be removed to slim the build graph.
