# Stimmyz visual design source of truth

**Revision:** 2026-10-21. The latest `prototype/standalone.html` and the newly captured screenshots in `previews/` are the design target for this refinement. The older `references/APPROVED_SIX_THEMES.png` is authoritative for theme mood, logo, playful pad styling and overall identity, **but not for obsolete interactive behavior**.

## Screens changed in this revision

- **Settings:** Simplified to Playback (master volume and background only when functional), Appearance, Backup & restore, About. Remove global overlapping, default repeat, pad progress and tap-behavior selectors. See `previews/simplified-settings-vanilla.png` and `previews/simplified-settings-coffee.png`.
- **Edit Board:** Board-specific selectors `Grid size: 3×4 / 4×4` and `More sounds: Pages / Scroll` plus the board-only overlap toggle are shown in a simple edit panel. See `previews/edit-board-3x4-coffee.png` and `previews/edit-board-4x4-coffee.png`.
- **Normal Board:** No pad ⋮ menus visible. Only tapping sound pads plays; Quick Add remains first and has no visible config arrow. See `previews/simplified-board-normal-coffee.png`.
- **Clip Playback options:** Sound volume/boost up to 200%, decibel readout, clipping-protection explanation, and per-clip repeat. Open from Edit Board pad ⋮ or Library row ⋮. See `previews/clip-volume-boost-coffee.png`.
- **Pages / Scroll:** Pages mode: 3×4 has 12 tiles/page including Quick Add; 4×4 has 16. `Page X of N` and Quick Add first on every page. Scroll mode: first four-row batch starts with a single Quick Add; scrolling loads more ordinary sounds automatically, in 12/16-clip batches, without paging buttons or duplicating Quick Add. See `previews/board-scroll-3x4-coffee.png` and `previews/board-pages-3x4-coffee.png`.

## Must not change

- Three bottom tabs Board / Editor / Library. Large, consistently sized ~29dp icons; selected underline; Library uses collection/stacked-cards glyph, not database.
- Gradient Stimmyz wordmark, bright image-based sound pads and all six existing theme families, no extraneous debug labels on the main screens.
- Source flow features **Record device audio first**, with microphone and import secondary. Main CTA is text-only and centered.
- Trim waveform with both draggable handles, optional collapsed Fine tune, moving preview playhead and accurate elapsed time. Customize with optional artwork. Saved audio offline.
- Quick Add stays tile #1 and its configuration arrow is only in Edit Board. Preserve per-user preferred action. Library ⋮ stays visible; pad ⋮ is Edit Board only.

## Interaction semantics

- Playback progress line on a pad appears **automatically**, no toggle. Active pad tapping restarts playback. Stop All appears only with active playback; optional per-sound loop still has a safe stop mechanism.
- On 3×4, pad art and label should be slightly larger as available width increases, not stretched out of aspect ratio. On 4×4, pads stay compact but retain tappable targets and readable labels.
- Active board grid, navigation mode and overlap are saved by stable board ID, not as global preferences. Changing grid size cannot delete or hide clips permanently.
- Per-sound volume slider 0–200 with its midpoint at 100; note ±dB relationship and distinction between loudness and hardware output. Never represent actual gain processing as proven by a browser screenshot.

## QA visual check

1. Compare Vanilla and Coffee at 360dp and typical phone width, checking status/navigation insets and 150% font scale.
2. Ensure pad overflow is entirely absent in normal mode; Quick Add arrow absent too. Edit mode displays menus without clipping or covering neighboring pads.
3. The 3×4 board has exactly 3 columns; 4×4 has 4. Pages navigation remains reachable; Scroll loads subsequent clips without duplicating Quick Add. Both work after new sounds are appended.
4. Check Theme selector, collection icon, library rows, creation screens and trim progress for regressions.
5. The prototype demo art includes recognizable meme characters; do not ship these illustrative sprites without confirming rights.
