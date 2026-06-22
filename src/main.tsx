import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "./stores/appStore";
import type { ExifPatch } from "./stores/appStore";

// 全局监听 EXIF 增量更新 — 200ms debounce 合并窗口
// 避免 50 次/秒的 patch 轰炸导致 VirtuosoGrid 频繁 reconciliation
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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
