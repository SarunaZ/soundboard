# Astra — minimal settings, board layout, and per-sound gain

**Approved scope (2026-10-21).** This document supersedes the previous, more complicated Playback Settings design. **The goal is to reduce settings clutter while adding per-sound amplification and per-board 3×4/4×4 layouts.** Preserve the existing Stimmyz design and device-recording-first creation experience.

## Product decisions (not optional)

| Behavior | Decision | Where |
| --- | --- | --- |
| Playing pad progress | Always on while playing, hidden when idle; native-timestamp synchronized | Baseline UI; no setting |
| Pad taps | Restart the clip immediately if already playing, otherwise start it | Baseline; no setting |
| End of playback | Reset to start / clear progress | Baseline |
| Global repeat | Play once | Baseline; no global setting |
| Loop/repeat | Once, loop indefinitely, or 3 plays | Per-sound Playback options |
| Master volume | 0–100% app output gain; independent of phone volume | Global Settings → Playback |
| Per-sound volume | 0–200% gain (100% = unity, 200% ~ +6 dB) | Sound Playback options |
| Clip protection | Apply always-on headroom, true-peak limiting or equivalent anti-clipping strategy; never a toggle | Native playback baseline |
| Overlap | Single sound by default; allow multiple only if toggled for this board | Edit Board → Allow overlapping |
| 3×4 / 4×4 | Per-board grid. Defaults to 4×4 for existing/new boards unless user chooses otherwise | Edit Board → Grid size |
| Pages / Scroll | Per-board navigation choice. Pages default; Scroll uses automatic lazy-loaded batches | Edit Board → More sounds |
| Quick Add | First tile; its arrow is edit-only; action preserved on upgrades | Board |
| Pad ⋮ | **Edit Board only**; pad surface always plays (even in edit mode unless deliberately separated) | Board |
| Library ⋮ | Always available for local-clip management; Playback options accessible there | Library |
| Stop all | Appears only when one or more sounds active | Board |
| Background playback | May remain a global preference **only when working natively**; otherwise omit or label nonfunctional in preview | Global Settings |
| Themes | Peach, Mint, Snow, Ice, Vanilla, Coffee | Global Settings → Appearance |
| Backup/restore | Explicit export/import actions; not toggles | Global Settings → Backup |

### Grid size and navigation mode

**See `BOARD_NAVIGATION_HANDOFF.md` for the detailed, latest canonical contract.**

- `3×4` = three columns and four rows per **page or initial scroll batch** (12 slots). `4×4` = four columns and four rows (16 slots).
- `Pages` is the existing, migration-safe default with Prev/Next and `Page X of N`. Quick Add is first on **each** page; therefore 11 / 15 ordinary sounds per page.
- `Scroll` uses a continuously scrolling grid with **lazy-loaded** four-row batches. First batch includes Quick Add + 11 / 15 clips. Later batches add 12 / 16 clips with **no repeated Quick Add**. Loading triggers near the end, with an accessible `Load more sounds` fallback.
- Both selectors are per-board **Edit Board** preferences. Switching view modes or grid sizes must not delete, reorder or hide sounds, and must not reset another board's mode. Filter search results before batching and reset navigation cursors for changed queries.
- Persist navigation mode with grid and overlap for each board; include in backup/import migration and handle long lists with native lazy/recycling rendering rather than eagerly creating all pads.

### Sound gain / amplification

- Sound Playback options reachable from Library ⋮ in normal mode and Pad ⋮ when Edit Board is active. Both point to the **same saved sound ID**.
- Slider range **0–200%** in steps of 5%. Preset labels `0% · mute`, `100% · original`, `200% · boost` and accurate dB readout: `20 × log10(gainPercent/100)` for gain > 0.
- **100%** is unity digital gain. **200%** corresponds to ≈ **+6.02 dB digital gain**; it does not make the phone's hardware output twice as loud, and cannot exceed the physical device limits.
- Digital boost can clip peaks. The Android implementation **must not** merely multiply PCM by 2 and saturate/hard-clip it. Choose a predictable safe strategy (true-peak limiter, compressor/limiter with headroom, or offline gain normalization with tested peak limiting), especially for overlapping clips. Measure audible behavior; keep maximum output safe.
- Define the gain chain clearly: source PCM → per-clip gain → optional multi-clip mix with headroom → master volume → limiter/output. Adjust ordering if native engine requires it, but satisfy peak protection and independent clip control.
- Existing recordings default to 100% and preserve previously stored values when available; values must survive a cold restart, backup/restore and reuse of the same sound on multiple boards.
- The HTML range control is visual only and does not actually process PCM. Astra must implement and QA the native DSP (or explicitly stage it before shipping the enabled slider).

### Baseline playback

- Restart on repeated taps; the second tap does not pause or queue duplicate playback for the same pad.
- Pad progress uses **actual native playback position**, not an independent UI approximation. It appears during active playback, resets to zero at end/stop/restart, loops accurately, and remains in sync with audio.
- One sound at a time by default for each board; when overlap enabled, independently progress multiple active pads and expose contextual Stop All.
- If the user switches from overlap ON → OFF, stop extra instances and prevent orphan playback. Define a deterministic policy (recommended: Stop All), then QA it.
- Loops must always be stoppable, even with edit-only pad overflow. The always-accessible **Stop All** control addresses this; ideally active pads can also stop by long-press or an explicit non-edit playback affordance if users need per-sound stop.
- Avoid adding global “show progress,” “tap behavior,” “default repeat,” “separate stop button,” or global overlap preferences.

## Acceptance criteria — Android device, not only HTML

- **AS-01:** Settings has no global `Show pad progress`, `Tap an active pad`, `Default repeat`, or `Allow overlapping sounds` control. Playback contains Master volume and background playback only if natively implemented. Appearance, Backup and About remain.
- **AS-02:** Board Edit displays grid toggle `3×4` / `4×4` and navigation toggle `Pages` / `Scroll`, both with selected state; changing them updates the board immediately without loss of sounds. Follow BN-01...BN-09 for detailed mode behavior.
- **AS-03:** In Pages mode with 15 sounds plus Quick Add, 4×4 shows 16 tiles on one page; 3×4 shows Quick Add + 11 sounds on page 1 and remaining sounds on page 2. Scroll mode renders progressive batches with Quick Add once. No items lost when switching back.
- **AS-04:** Quick Add stays in slot 1 on each page in Pages mode, or slot 1 once at the top in Scroll mode; its arrow only appears in Edit Board. Adding sounds never pushes it down or shifts its preferred action.
- **AS-05:** In normal Board mode **zero pad ⋮ icons are rendered or accessible**. In Edit Board mode, each pad has a ⋮ menu with Replace/Rename/Move/Playback options/Clear. Tapping the main pad does not open ⋮.
- **AS-06:** Library row ⋮ menus remain available regardless of Board edit state. Clip playback options in Library and Board Edit refer to the same saved clip state.
- **AS-07:** Pad progress is always on for active pads, independently reflects native audio, and disappears after completion. There is no opt-out preference.
- **AS-08:** Re-tapping a playing pad immediately restarts at 0; completion resets, default play-once. Loop and 3× repeat can be enabled per clip only.
- **AS-09:** Per-sound volume slider supports 0, 100 and 200%, persists, applies to local audio and device-captured clips, does not alter Android media volume, and remains consistent across multiple board assignments.
- **AS-10:** Amplification is audited for clipping and mixed-stream headroom. Test quiet and already-maxed audio at 100%, 150%, 200%, and with overlapping playback; output should be limited, not severely distorted. Confirm correct peak behavior with a meter and human audition.
- **AS-11:** Board-level overlap is persisted separately for each board and the switch from overlap to single-sound mode stops extra audio safely. Stop All remains available with any playback.
- **AS-12:** Settings, Editor, Library, Trim progress, microphone, device-audio capture, imported media, themes and existing Quick Add preference regressions pass. Test font scale ≥1.5 and Android system bar safe areas.
- **AS-13:** Backup export/import preserves board navigation mode, grid selection, board overlap, per-sound gain/repeat and settings in a versioned manifest with safe migration of older data.
- **AS-14:** No nonfunctional background playback toggle in release UI and no fake “200% boost” that simply clips. Feature flag unfinished native capabilities until verified.

## Proposed data contracts (adapt after repository inspection)

```ts
type GridSize = '3x4' | '4x4';
type BoardNavigation = 'pages' | 'scroll';
type Repeat = 'once' | 'loop' | 'three';

type AppPreferences = {
  masterVolume: number;    // 0..1, persisted
  theme: 'Peach' | 'Mint' | 'Snow' | 'Ice' | 'Vanilla' | 'Coffee';
  backgroundPlayback?: boolean; // expose only once supported
};

type BoardPreferences = {
  boardId: string;
  grid: GridSize;          // default 4x4
  navigation: BoardNavigation; // default pages
  allowOverlap: boolean;   // default false
};

type ClipPreferences = {
  soundId: string;
  gain: number;            // 0..2 (100% = 1.0)
  repeat: Repeat;          // default 'once'
};
```

## Implementation sequencing

1. Audit player, audio engine, existing preferences, board model, and exact relationship between sound library and board pad assignments. Propose a file-level plan **before touching production code**.
2. Implement board edit-only menus + per-board grid/Pages-or-Scroll navigation + overlap. Preserve Quick Add pinning, library menus and existing sound data.
3. Make progress/restart/reset baseline behaviors. Remove obsolete global settings and migrate old preferences safely.
4. Implement per-clip volume/boost and limiter after native DSP tests; keep 200% slider gated until done. Preserve per-clip repeat and show options through approved menus.
5. Simplify Settings and verify themes, backing storage, backup metadata, device-first Source, Trim, and app lifecycle.
6. Test the acceptance matrix on real devices; capture screenshots and audio results. No screenshots alone can prove native gain or clipping safety.

**Important:** Device audio capture respects Android policy, and general-purpose recording does not authorize redistribution of copyrighted media. This handoff does not add or reintroduce `yt-dlp` in the Play Store build. Reference meme images and sound clips are design-only, not licensed release assets.
