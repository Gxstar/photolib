# AGENTS.md — PhotoLib

## 架构

- **Tauri v2** 桌面应用：React 18 + TypeScript 前端，Rust 后端 + SQLite
- 前端入口：`src/main.tsx` → `src/App.tsx`
- Rust 入口：`src-tauri/src/lib.rs`，IPC 命令在 `src-tauri/src/commands.rs`（约 1131 行）
- 状态管理：单一 Zustand store 位于 `src/stores/appStore.ts`
- CSS：Tailwind 3 + 自定义设计令牌（CSS 变量定义在 `src/index.css`，亮色/暗色通过 `<html>` 上的 `.dark` class 切换）

## 常用命令

```bash
npm run dev        # Vite 开发服务器，端口 1420（strictPort）
npm run build      # tsc -b && vite build（先类型检查再打包）
npm run test       # vitest run
npm run test:watch # vitest watch 模式
npm run tauri      # Tauri CLI
```

- `npm run build` 是 Tauri 唯一的构建步骤（`tauri.conf.json` 中 `beforeBuildCommand`）
- 没有单独的 `lint` 或 `typecheck` 脚本；类型检查包含在 `build` 中

## 测试

- 框架：Vitest + jsdom 环境 + `@testing-library/react`
- 配置：`vitest.config.ts` — 启用 globals，setup 文件在 `src/test/setup.ts`
- 测试文件位于 `__tests__/` 目录；匹配模式：`src/**/__tests__/**/*.test.{ts,tsx}`
- Setup 提供了 `window.matchMedia` mock（测试中 store 默认亮色主题）
- 运行单个测试文件：`npx vitest run src/__tests__/main-skeleton-handler.test.ts`

## 关键约定

- **路径别名**：`@/*` → `./src/*`（tsconfig 和 vite 均已配置）
- **Rust ↔ 前端数据流**：Rust 结构体使用 `#[serde(rename_all = "camelCase")]`。前端 `normalizePhoto()`（`src/api.ts:18`）也会将 Tauri 事件中的 snake_case JSON → camelCase 转换。注意：`camera_model`（Rust）/ `cameraModel`（TS）。
- **EXIF 加载**：惰性异步加载。Rust `exif_pool` 通过优先队列处理照片，结果以 `exif-updated` Tauri 事件推送，前端在 `src/main.tsx:11` 做 50ms debounce 后调用 `useAppStore.patchPhotos()` 合并。
- **`patchPhotos` 数值默认值用 `??` 而非 `||`** — 这是关键：值为 `0` 时有意义（如 ISO 0 合法），不能用 fallback 替换为 0。
- **骨架协议**：打开大目录时 Rust 发送 `photos-skeleton` 事件，附带 `navId`。`src/main-skeleton-handler.ts` 中的处理函数会丢弃过期事件（navId < lastNavId），防止旧的选择结果覆盖新结果。
- **`isTauri()` 守卫**：`src/api.ts:7` — 调用任何 Tauri invoke 前必须检查。非 Tauri 环境下使用 `src/mock/data.ts` 中的模拟数据。
- **文件监控**：Rust `watchdog.rs` 基于 `notify` crate。前端调用 `watchDirectory` / `unwatchDirectory` 来监听 `files-changed` 事件实现自动刷新。
- **`noUnusedLocals` 和 `noUnusedParameters` 为 `false`** — tsconfig 中有意关闭，未使用的 import/变量不会导致构建报错。

## Rust 后端模块

| 模块 | 用途 |
|------|------|
| `db.rs` | SQLite 数据库 schema、连接管理，存储在用户数据目录 |
| `scanner.rs` | 文件发现（浅层扫描 + 递归扫描） |
| `metadata.rs` | nom-exif 解析 |
| `thumbnail.rs` | 缩略图生成 + 磁盘缓存 |
| `exif_pool.rs` | 异步 EXIF 提取，带优先队列 |
| `watchdog.rs` | 文件系统变更通知 |
| `win_thumbcache.rs` | Windows 缩略图缓存集成（cfg 条件编译） |
| `models.rs` | Serde 结构体，前后端共享 |
| `commands.rs` | 所有 Tauri IPC 命令处理函数 |
| `export.rs` | 导出功能 |

## Tauri 配置要点

- 资产协议已启用，scope 为 `$CACHE/**/*`，用于提供缓存的缩略图
- CSP 为 `null`（本地资产宽松策略）
- 最小窗口：1024×600，默认：1400×900
- 数据库路径：`dirs::data_dir()/photolib/catalog.db`
- `Cargo.lock` 已提交（二进制应用，确保可复现构建）
- `src-tauri/gen/schemas/` 为自动生成，已 gitignore
