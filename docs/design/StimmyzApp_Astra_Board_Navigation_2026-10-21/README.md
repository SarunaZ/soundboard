# StimmyzApp — minimal settings, flexible boards and lazy scrolling (Astra handoff)

**Revision:** 2026-10-21  |  **Primary deliverable:** source-level interactive HTML reference and implementation acceptance criteria.

## First files Astra should read

1. `BOARD_NAVIGATION_HANDOFF.md` — **new Pages / Scroll behavior**, native performance, persistence and acceptance tests.
2. `ASTRA_IMPLEMENTATION.md` — implementation priorities, precise behavior, and safe migration rules.
3. `PLAYBACK_SETTINGS_HANDOFF.md` — **authoritative** feature specifications and test cases for simplified settings, per-clip gain, grid sizing, and edit-only pad menus.
4. `DESIGN_SOURCE_OF_TRUTH.md` — visual precedence, unchanged screens, and themes.
5. `prototype/standalone.html` — self-contained interactive reference that works locally without network or media capabilities.
6. `previews/` — actual screenshots from the HTML prototype, including new `simplified-*`, `edit-board-*` and `clip-volume-*` images.

## Changes in this revision

- Pad progress is **always shown during playback**, never a setting.
- Tapping an active sound **restarts immediately**. Completed playback resets by default.
- Sounds **play once** unless the individual clip opts into loop or repeat 3 times.
- Overlapping playback is a **per-board** toggle in **Edit Board**, not a global setting.
- Board layout is **3 × 4 or 4 × 4** in **Edit Board**. 3×4 = 12 grid slots per four rows, 4×4 = 16. Each board also selects **Pages or Scroll**. In Pages mode Quick Add occupies slot one on every page. Scroll mode automatically loads additional four-row batches with Quick Add only once at the top; both modes keep all sounds accessible.
- Pad ⋮ appears **only in Edit Board**. Library ⋮ remains visible in the Library.
- Quick Add configuration arrow still appears **only in Edit Board**. Quick Add defaults to device recording for eligible new installs; preserve existing preferences.
- Each sound offers **0–200% gain (100% = original, 200% ≈ +6.02 dB)** and its own repeat behavior in **Playback options**; Android must use peak limiting and clipping protection when boosting.
- Global Settings intentionally has **no Board navigation preference**. Global Settings only contains master volume, background-playback preference **if actually supported**, theme, backup/restore, and About. Do not display nonfunctional controls as production features.

## Prototype boundaries

The browser demonstrates interactions, layouts, simulated progress, and automatic browser-scrolling batch loading with a fallback button. It **does not** actually capture, process, export, or play audio. The mock sound thumbnails may contain protected character art and must not be shipped. In the Android implementation, use the existing native audio/capture code, and test actual audible output and audio peaks on device.

Do not discard the Android project or replicate the HTML as a WebView unless the repo review shows it is the correct architecture. Start by inspecting the code, then present a file-level implementation plan.
