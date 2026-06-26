# Photo Preview (Large Image Viewer) Design

## Background

Add an XnViewMP-style large image preview triggered by double-clicking a thumbnail in the grid. The viewer opens a full-screen overlay with navigation, zoom/pan, rotation, EXIF info panel, thumbnails strip, slideshow, and original-image priority with L2 JPEG fallback.

## Architecture

| Layer | Responsibility | Key Files |
|---|---|---|
| State | `previewPhotoId: number \| null` — store ID not index (filter/sort safe) | `appStore.ts` |
| Rust | `get_preview_image` L2 command, `allow_directory` scope registration, L1/L2 cache split | `commands.rs`, `lib.rs`, `thumbnail.rs` |
| Frontend | `PhotoPreview.tsx` component wrapping YARL Lightbox + EXIF panel + rotation + fallback | `PhotoPreview.tsx`, `ThumbnailGrid.tsx`, `App.tsx` |

## Data Flow

```
[Double-click thumbnail] → setPreviewPhotoId(photo.id)
  → App.tsx finds index in filteredPhotos
  → PhotoPreview renders <Lightbox> with slides
  → Arrow keys / click nav → update photoId
  → Filter/sort changes → if photoId gone from list → auto-close
  → ESC / X → setPreviewPhotoId(null)
```

## Rust Changes

### L1/L2 cache path split (`thumbnail.rs`)

Split `get_cache_path`:
- `get_cache_path_l1(file_path)` → `v7_{hash}.jpg`
- `get_cache_path_l2(file_path)` → `v7_{hash}_l2.jpg`

`generate_and_cache` takes a `ThumbLevel` parameter and uses the corresponding path.

### New command `get_preview_image` (`commands.rs`)

```rust
#[tauri::command]
pub async fn get_preview_image(file_path: String) -> Result<String, String>
```

Calls `generate_and_cache(path, ThumbLevel::L2)` and returns the cache path.

### Dynamic asset protocol scope (`lib.rs` + `commands.rs`)

- Startup: query `folders` table → `app.asset_protocol_scope().allow_directory(path, true)` for each
- `add_album` hook: after INSERT → `allow_directory(new_path, true)`

## Frontend Changes

### 1. Dependency

`npm install yet-another-react-lightbox`
Plugins: Zoom, Fullscreen, Counter, Thumbnails, Slideshow

### 2. Store (`appStore.ts`)

```ts
previewPhotoId: number | null;
setPreviewPhotoId: (id: number | null) => void;
```

### 3. API (`api.ts`)

```ts
export async function getPreviewImage(filePath: string): Promise<string>
```

### 4. Double-click (`ThumbnailGrid.tsx:286`)

```tsx
onDoubleClick={() => setPreviewPhotoId(photo.id)}
```

### 5. PhotoPreview component (new: `src/components/browser/PhotoPreview.tsx`)

- Receives `photos: Photo[]` from filteredPhotos
- `photoId` from store → find current index
- Build slides array with `convertFileSrc(filePath)` as src (original)
- On `<img onError>` per slide → call `getPreviewImage(photo.filePath)` → replace src with L2
- YARL plugins: Zoom, Fullscreen, Counter, Thumbnails, Slideshow (delay 3s)
- EXIF panel: right-side 280px glass panel default visible, toggle with `I` key
- Rotation: component-local `rotationAngles: Map<number, number>` (CW 90° increment)
  - `R` → add 90, `Shift+R` → subtract 90
  - Applied as CSS `transform: rotate(angle deg)` on the image

### 6. Wire into App.tsx

Render `<PhotoPreview>` at the bottom of the main div, controlled by `previewPhotoId`.

## UI Layout

```
┌────────────────────────────────────────────────────┐
│  [✕]  filename.jpg                          [⛶]   │
│                                                    │
│  [❮]                                        [❯]   │
│                                                    │
│                    ┌──────────────┐                │
│                    │  EXIF panel  │  [I toggle]    │  280px right
│                    │  (default on)│                │  glass-panel
│                    └──────────────┘                │
│                                                    │
│  ┌── [Close] 12/234  [100%][Fit][R↶][Ჭ][⛶][ⓘ][⏵] ─┐  bottom bar
│  └────────────────────────────────────────────┘  │
│  ── [thumb] [thumb] [thumb] [thumb] [thumb] ── │  80px strip
└────────────────────────────────────────────────────┘
```

## Keyboard

| Key | Action | Source |
|---|---|---|
| ← → | Prev/next | YARL |
| ESC | Close | YARL |
| F | Toggle fullscreen | YARL Fullscreen |
| Space | Toggle slideshow | YARL Slideshow |
| + / - | Zoom in/out | YARL Zoom |
| 0 | Fit to window | YARL Zoom |
| 1 | 100% view | YARL Zoom |
| I | Toggle EXIF panel | Custom |
| R | Rotate CW 90° | Custom |
| Shift+R | Rotate CCW 90° | Custom |

## Edge Cases

- **File deleted**: `<img onError>` → L2 fallback → if fails too, show placeholder
- **Filter/sort change during preview**: `filteredPhotos.findIndex(p.id === photoId)` returns -1 → auto-close
- **HEIC/TIFF/RAW**: original fails → L2 fallback; user sees JPEG preview
- **AVIF/JPEG/PNG/WebP/BMP/GIF**: original works natively in WebView2
- **Empty filtered list**: nothing to preview
- **add_album before preview**: scope already registered

## Files Changed

- `package.json` (+1 dep)
- `src/stores/appStore.ts` (+2 fields)
- `src/api.ts` (+1 function)
- `src/components/browser/ThumbnailGrid.tsx` (+1 line)
- `src/App.tsx` (render PhotoPreview)
- `src-tauri/src/lib.rs` (startup scope registration)
- `src-tauri/src/commands.rs` (new command + add_album hook)
- `src-tauri/src/thumbnail.rs` (L1/L2 cache path split)

## New Files

- `src/components/browser/PhotoPreview.tsx`
- `src/components/browser/__tests__/PhotoPreview.test.tsx`
