# Photo Detail Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `PhotoDetail.tsx` follow the app's light/dark theme system using `dark:` Tailwind variants, with a Lightroom-style always-dark image canvas.

**Architecture:** Single-file change to `src/components/browser/PhotoDetail.tsx`. Replace all hardcoded dark-only classes (`text-white/*`, `bg-white/*`, `border-white/*`, `divide-white/*`) with theme-adaptive alternatives using `dark:` variants. Image area gets `bg-black` directly.

**Tech Stack:** React 18, TypeScript, Tailwind CSS 3 (class-based dark mode), Zustand

## Global Constraints

- Follow existing `dark:` pattern used in `Toolbar.tsx` and other components
- Use `theme` from `useAppStore()` to conditionally render image canvas background
- Image canvas always black (`bg-black`) for optimal photo viewing
- No CSS changes needed — all changes in `PhotoDetail.tsx`

---

### Task 1: Transform PhotoDetail.tsx classes

**Files:**
- Modify: `src/components/browser/PhotoDetail.tsx`

**Changes:**
1. Import `theme` from store: `const { updatePhotoMeta: updateStore, theme } = useAppStore()`
2. Add `bg-black` to image area wrapper
3. Replace all dark-only classes with theme-adaptive pairs

**Class mapping:**

| Line(s) | Current | New |
|---------|---------|-----|
| 56 | `divide-white/5` | `divide-surface-200 dark:divide-white/5` |
| 59 | `text-white/30` | `text-surface-600 dark:text-white/30` |
| 60 | `text-white/80` | `text-surface-700 dark:text-white/80` |
| 79 | `text-white/20` (inactive) | `text-surface-400 dark:text-white/20` |
| 102 | `border-white` (selected) | `border-surface-800 dark:border-white` |
| 108 | `text-white/40` `hover:text-white/70` | `text-surface-600 dark:text-white/40` `hover:text-surface-800 dark:hover:text-white/70` |
| 129 | `bg-white/10` `text-white/50` | `bg-surface-200/40 dark:bg-white/10` `text-surface-600 dark:text-white/50` |
| 129 | `hover:bg-white/20` | `hover:bg-surface-200/60 dark:hover:bg-white/20` |
| 333 | `bg-surface-950` `text-white/40` | `bg-surface-0` `text-surface-600 dark:text-white/40` |
| 341 | `bg-surface-950` `text-white/40` | `bg-surface-0` `text-surface-600 dark:text-white/40` |
| 343-344 | `bg-white/10` `hover:bg-white/20` | `bg-surface-200/40 dark:bg-white/10` `hover:bg-surface-200/60 dark:hover:bg-white/20` |
| 352 | `bg-surface-950 text-white` | `bg-surface-0 text-surface-700 dark:text-white/80` |
| 354 | `border-white/5` | `border-surface-200/40 dark:border-white/5` |
| 356 | `hover:bg-white/10` | `hover:bg-surface-200/30 dark:hover:bg-white/10` |
| 361 | `text-white/80` | `text-surface-700 dark:text-white/80` |
| 363 | `hover:bg-white/10` | `hover:bg-surface-200/30 dark:hover:bg-white/10` |
| 367 | `hover:bg-white/10` | `hover:bg-surface-200/30 dark:hover:bg-white/10` |
| 375 | (inherited bg) | `bg-black` |
| 397 | `bg-surface-900/80` `border-white/5` | `bg-surface-100 dark:bg-surface-100/80` `border-surface-200/40 dark:border-white/5` |
| 400 | `text-white/40` | `text-surface-600 dark:text-white/40` |
| 404 | `border-white/5` | `border-surface-200/40 dark:border-white/5` |
| 405 | `text-white/40` | `text-surface-600 dark:text-white/40` |
| 408 | `text-white/30` | `text-surface-600 dark:text-white/30` |
| 412 | `text-white/30` | `text-surface-600 dark:text-white/30` |
| 416 | `text-white/30` | `text-surface-600 dark:text-white/30` |
| 420 | `text-white/30` | `text-surface-600 dark:text-white/30` |
| 425 | `bg-white/5 border-white/10 text-white/80` | `bg-surface-100/40 dark:bg-white/5 border-surface-200/40 dark:border-white/10 text-surface-700 dark:text-white/80` |
| 425 | `focus:border-white/20` | `focus:border-surface-400 dark:focus:border-white/20` |
| 436 | `border-white/5` | `border-surface-200/40 dark:border-white/5` |
| 438 | `hover:bg-white/10` `text-white/60` | `hover:bg-surface-200/30 dark:hover:bg-white/10` `text-surface-600 dark:text-white/60` |
| 444 | `text-white/40` | `text-surface-700 dark:text-white/40` |
| 448 | `hover:bg-white/10` `text-white/60` | `hover:bg-surface-200/30 dark:hover:bg-white/10` `text-surface-600 dark:text-white/60` |

- [ ] **Step 1: Apply all class replacements to PhotoDetail.tsx**

Using sequential edit operations to transform the file.

- [ ] **Step 2: Build to verify no type errors**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/browser/PhotoDetail.tsx
git commit -m "feat: make photo detail page follow app theme (light/dark)"
```
