# Board navigation: Pagination or lazy-loaded scrolling

**Date:** 2026-10-21 · **Scope:** targeted follow-up to the approved StimmyzApp simplified settings handoff. **This specification overrides any earlier rule implying pagination is the only navigation mode.**

## Product requirement

Every board independently supports two ways to browse sounds, configured under **Board → Edit Board → More sounds** (NOT global Settings):

1. **Pages** (existing default): four rows per page, Prev / Next and `Page X of N`. Grid setting stays independent: `3×4` (3 columns, 12 slots) or `4×4` (4 columns, 16 slots). Quick Add is always the first tile **on each page**, leaving 11 or 15 ordinary sounds per page.
2. **Scroll** (lazy-loaded continuous board): no page buttons. Render one initial four-row batch: Quick Add first and 11 sounds (3×4) / 15 sounds (4×4). On approaching the end, append more sound pads in batches of **12** or **16** ordinary sounds (four complete rows). Quick Add appears **only once**, at absolute board position #1; never duplicate it midway through the feed. The rendered grid retains 3 or 4 columns, and may grow beyond four rows. Show a subtle `N of M sounds` count and a `Load more sounds` accessible fallback; on exhaustion show `All sounds loaded`. The observer should automatically load when near the bottom.

The mode is a **board preference**, like grid size and overlap, not a global app setting. New boards and boards without a stored mode default to **Pages** for backward compatibility. Switching the mode resets the page/batch cursor to the beginning **without modifying board ordering, audio files, assignments, Quick Add action preference or sound IDs**. Changing grid size also resets the view cursor and recalculates batch sizes; mode choice persists. Board identity must be a stable ID rather than mutable display name.

## Interaction details and edge cases

- **Edit Board only:** `More sounds: Pages | Scroll` appears beside `Grid size: 3×4 | 4×4` and the board-only `Allow overlapping sounds` toggle. The navigation controls are not in global Settings; no fourth bottom tab. Pad ⋮ and Quick Add arrow still appear only in Edit Board mode, while Library ⋮ is unchanged.
- **Normal Board:** Pages mode shows page navigation only when required; Scroll mode gives continuous natural touch scrolling with progressive loading, without edit controls. Editing, new pad creation and switching themes must not accidentally reset a previously chosen navigation mode.
- **Search:** Filter **before** paging/lazy batching. On a new query reset to page one or the first scroll batch; Quick Add stays first. Clearing search restores all sounds and the chosen mode; do not leave a stale cursor beyond filtered results. Switching board reinitializes scroll position appropriately and restores that board's persisted navigation mode.
- **Sound count & completion:** Empty state remains; short lists require no controls and no imaginary next page. With exactly 11 (3×4) / 15 (4×4) clips, the first batch fits. With one extra clip, show the second page or the scroll continuation. Never silently truncate a large board.
- **Playback continuity:** Loading a later batch must not stop currently playing/looping audio, reset existing pad progress, duplicate instances, or lose the contextual Stop All control. Scrolling itself does not invoke audio loading/decoding for offscreen clips unless needed; actual playing audio is separate from view lifecycle. If a playing pad goes offscreen, audio/session control remains valid.
- **Lazy performance:** Use the native framework's lazy/recycling grid (e.g., RecyclerView/GridLayoutManager or Compose LazyVerticalGrid, depending on **the real codebase**). Stable sound IDs/keys and scoped load state required; avoid instantiating the whole board's view tree or predecoding hundreds of audio clips. Prefetch near the end with predictable bounded work, cancellable/guarded against rapid mode switches, board switches and search changes. Avoid duplicates/skips when items are added/removed while scrolling.
- **Accessibility:** Both mode buttons have explicit selected state. Prev/Next and Load more are accessible via TalkBack and keyboard. Touch targets ≥48dp; avoid shrinking pads below functional size on narrow screens. No endless loading spinner, auto-jump or focus loss when a batch is appended. `Load more sounds` remains functional when scroll observation fails, accessibility focus is used, or network APIs aren't present (local app should be offline-ready).
- **Persistence/backup:** Persist `navigation: 'pages' | 'scroll'` on each board and include it in the versioned backup manifest. Older manifests lacking the field import with `pages`. Cloning and renaming a board preserve the preference; merging backups retains both sets of board choices. Do not alter clip, overlap or grid settings.

## Data contract proposal (adapt to actual repository)

```ts
type GridSize = '3x4' | '4x4';
type BoardNavigation = 'pages' | 'scroll';
type BoardPreferences = {
  boardId: string;
  grid: GridSize;                 // default 4x4
  navigation: BoardNavigation;    // default 'pages', migration-safe
  allowOverlap: boolean;
};
```

Do not persist transient page number, visible batch count or in-flight scroll observer state as durable board preferences. If restoring scroll position on returning to a board, scope it to a session and ensure it does not cause missing rows or stale data.

## Android acceptance criteria

- **BN-01**: Edit Board shows Grid size (3×4 / 4×4), More sounds (Pages / Scroll), and Allow overlapping sounds. No navigation choice appears in global Settings.
- **BN-02**: Default/migrated board uses Pages. A 3×4 board with 15 clips shows 11 clips + Quick Add on page 1 and the remaining 4 clips + Quick Add on page 2. 4×4 fits 15 + Quick Add on one page.
- **BN-03**: In Scroll mode, the initial batch includes one Quick Add and 11 / 15 clips; scrolling loads more in 12 / 16 clip increments and **never** repeats Quick Add. There are no page navigation buttons.
- **BN-04**: Scrolling toward the end auto-loads, with an accessible Load more fallback. Repeated triggers cannot duplicate or skip sounds. Display count/completion is correct.
- **BN-05**: Change grid size or mode repeatedly and switch between boards. Each board remembers its own mode, grid and overlap after process death/relaunch and backup export/import.
- **BN-06**: Search matches across all clips, resets cursors without removing sounds, and loads additional matching results when needed. Changing board/query during a pending append never shows another board's clips.
- **BN-07**: Long boards (100–500+ clips) stay responsive and memory bounded; no eager waveform/audio decoding or full-size artwork loading for all offscreen pads. Test native layout virtualization with scrolling profiling and lifecycle.
- **BN-08**: Existing playback sessions continue during scrolling; pad progress and Stop All remain accurate. Edit-only ⋮, Quick Add pinning, Theme variants, offline availability and clip gain work unchanged.
- **BN-09**: Test 360dp-wide viewport, font scaling ≥150%, TalkBack, rotation and repeated edit/board navigation. Never hide a pad behind a fixed overlay.

## Prototype boundary

The `prototype/standalone.html` uses a browser IntersectionObserver plus a manual Load more button to simulate bounded incremental rendering. Its state is in memory only and does not prove Android persistence, native list virtualization, disk caching, scrolling accessibility, or any audio processing. Astra must implement and test those separately.
