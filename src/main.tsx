import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import { reloadDirectory, isTauri } from "./api";
import type { ExifPatch } from "./stores/appStore";

// 全局监听 EXIF 增量更新 — 200ms debounce
let pendingPatches: ExifPatch[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushExifPatches() {
  if (pendingPatches.length === 0) return;
  const batch = pendingPatches;
  pendingPatches = [];
  flushTimer = null;
  useAppStore.getState().patchPhotos(batch);
}

listen("exif-updated", (event) => {
  const patches = event.payload as ExifPatch[];
  pendingPatches.push(...patches);
  if (flushTimer === null) {
    flushTimer = setTimeout(flushExifPatches, 200);
  }
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
