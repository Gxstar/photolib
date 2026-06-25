import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import { reloadDirectory, isTauri, normalizePhoto } from "./api";
import type { ExifPatch } from "./stores/appStore";
import { handlePhotosSkeleton, type SkeletonPayload } from "./main-skeleton-handler";

// 全局监听 EXIF 增量更新 — 50ms 短 debounce（patchPhotos 只更新变化项，渲染代价小）
let pendingPatches: ExifPatch[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushExifPatches() {
  if (pendingPatches.length === 0) return;
  const batch = pendingPatches;
  pendingPatches = [];
  flushTimer = null;
  useAppStore.getState().patchPhotos(batch);
}

// 监听 exif-updated 事件（背景提取 + 视口优先 共用）
listen("exif-updated", (event) => {
  const patches = event.payload as ExifPatch[];
  if (!Array.isArray(patches)) return;
  pendingPatches.push(...patches);
  if (flushTimer === null) {
    flushTimer = setTimeout(flushExifPatches, 50);
  }
});

// 监听 meta-loaded 事件（file_size + file_date）
listen("meta-loaded", (event) => {
  const patches = event.payload as { id: number; filePath: string; fileSize: number; fileDate: number }[];
  if (!Array.isArray(patches)) return;
  // 转为 ExifPatch 格式复用 patchPhotos
  const exifPatches: ExifPatch[] = patches.map((p) => ({
    id: p.id,
    filePath: p.filePath,
    fileSize: p.fileSize,
    fileDate: p.fileDate,
  }));
  pendingPatches.push(...exifPatches);
  if (flushTimer === null) {
    flushTimer = setTimeout(flushExifPatches, 50);
  }
});

// 监听骨架事件 — 进入大目录时立即渲染占位格
let lastNavId = 0;
listen("photos-skeleton", (event) => {
  const payload = event.payload as SkeletonPayload;
  const state = useAppStore.getState();
  const decision = handlePhotosSkeleton(payload, state.currentDir, lastNavId);
  if (!decision.accept) return;
  lastNavId = decision.newLastNavId;
  const photos = decision.photos.map(normalizePhoto);
  useAppStore.getState().setPhotos(photos);
  useAppStore.getState().setLoading(false);
});

// 监听目录文件变化 — 文件增删时自动重新加载
listen("files-changed", (event) => {
  const changedDir = event.payload as string;
  const state = useAppStore.getState();
  if (state.currentDir === changedDir) {
    reloadDirectory(changedDir).then((photos) => {
      useAppStore.getState().setPhotos(photos);
    }).catch(() => {
      // 目录可能已被删除，可选的静默处理
    });
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
