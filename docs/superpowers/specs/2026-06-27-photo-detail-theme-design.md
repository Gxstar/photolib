# Photo Detail Page Theme Optimization Design

## Problem

`PhotoDetail.tsx` uses hardcoded dark-only colors — `bg-surface-950`, `text-white/80`, `bg-white/10`, `border-white/5` — with zero `dark:` Tailwind variants. The component does not read theme from the Zustand store. Result:

- **Light mode**: `--surface-950` = `#0b0d13` (near-black) → page always appears dark
- **Dark mode**: `--surface-950` = `#f7f7fa` (near-white) + all `text-white/*` → text nearly invisible

## Solution: Lightroom-Style Approach

**Image canvas**: Always black (`bg-black`) for optimal photo viewing regardless of theme.
**UI chrome** (toolbar, side panel, bottom nav): Adapts to theme via `dark:` Tailwind variants, following the same pattern as `Toolbar.tsx` and the rest of the app.

### Color System Mapping

| Surface Level | Light Mode | Dark Mode |
|---|---|---|
| `surface-0` | `#ffffff` | `#0b0d14` |
| `surface-100` | `#f0f1f5` | `#1a1d28` |
| `surface-200` | `#e2e4ea` | `#232735` |
| `surface-700` | `#3d414f` | `#bcbfd0` |
| `surface-600` | `#555a68` | `#a8adc0` |

### Class Change Strategy

For every hardcoded `text-white/*`, `bg-white/*`, `border-white/*`, `divide-white/*`:
- Add a **light-mode** class using surface tokens
- Keep the **dark-mode** class as-is with `dark:` prefix

Pattern:
```
current: text-white/80
new:     text-surface-700 dark:text-white/80
```

### Zone-by-Zone Changes

#### 1. Loading / Not-found states (lines 333-348)
- `bg-surface-950` → `bg-surface-0`
- `text-white/40` → `text-surface-600 dark:text-white/40`
- `bg-white/10` → `bg-surface-200/40 dark:bg-white/10`
- `hover:bg-white/20` → `hover:bg-surface-200/60 dark:hover:bg-white/20`

#### 2. Root container (line 352)
- `bg-surface-950` → `bg-surface-0` (then overridden to `bg-black` for image area)
- `text-white` → `text-surface-700 dark:text-white/80`

#### 3. Toolbar (lines 354-370)
- `border-white/5` → `border-surface-200/40 dark:border-white/5`
- `hover:bg-white/10` → `hover:bg-surface-200/30 dark:hover:bg-white/10`
- `text-white/80` (filename) → `text-surface-700 dark:text-white/80`

#### 4. Image area (lines 375-394)
- Inherited background → `bg-black` (direct style on the flex-1 wrapper)

#### 5. Side panel (lines 397-432)
- `bg-surface-900/80` → `bg-surface-100 dark:bg-surface-100/80`
- `border-white/5` → `border-surface-200/40 dark:border-white/5`
- All `text-white/XX` → `text-surface-6XX dark:text-white/XX`
- `divide-white/5` → `divide-surface-200 dark:divide-white/5`
- Textarea `bg-white/5` → `bg-surface-100/40 dark:bg-white/5`
- Textarea `border-white/10` → `border-surface-200/40 dark:border-white/10`
- ColorButtons selected: `border-white` → `border-surface-800 dark:border-white`
- FlagButtons inactive: `bg-white/10` → `bg-surface-200/40 dark:bg-white/10`
- FlagButtons inactive text: `text-white/50` → `text-surface-600 dark:text-white/50`

#### 6. Bottom nav (lines 436-454)
- `border-white/5` → `border-surface-200/40 dark:border-white/5`
- `hover:bg-white/10` → `hover:bg-surface-200/30 dark:hover:bg-white/10`
- `text-white/60` → `text-surface-600 dark:text-white/60`
- `text-white/40` → `text-surface-700 dark:text-white/40`

#### 7. RatingStars inactive (line 79)
- `text-white/20` → `text-surface-400 dark:text-white/20`

### Unchanged Elements
- RatingStars active: `text-yellow-400 fill-yellow-400`
- FlagButtons active: `bg-green-500 text-white` / `bg-red-500 text-white`
- ColorButtons hex colors + `border-transparent` default
- ColorButtons selected scale effect

## File Changed
- `src/components/browser/PhotoDetail.tsx` (only file modified)

## Testing
- Visual verification in both light and dark themes
- Run `npm run build` to confirm no type errors
