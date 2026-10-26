# Design precedence — October 24, 2026

1. **Highest priority:** `LATEST_CHANGES_2026-10-24.md` and `GALLERY_PAD_COLORS_HANDOFF.md`.
2. `DARK_THEMES_AND_MINIMAL_UI.md` for all screen and palette rules.
3. `prototype/standalone.html` for visual rendering, navigation, spacing and interactive demo.
4. `previews/00-latest-overview.png` / individual current screenshots, not old zipped preview renders.
5. `ASTRA_IMPLEMENTATION.md`, `BOARD_NAVIGATION_HANDOFF.md`, `PLAYBACK_SETTINGS_HANDOFF.md`, `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md` for Android behavior.
6. `references/approved-three-screen-concept.png` is visual inspiration **only**; it may depict controls not in the established scope.

**Explicit supersession:** Older handoffs that mention a GIPHY picker, online artwork, Library recording CTA, page-level Editor/Library explanatory headings, global theme shortcuts or Coffee as a separate theme are obsolete. Android should not implement those. Keep the approved transparent logo, editing rules, first Quick Add, 3×4/4×4 and Pages/Scroll, audio-first capture, per-clip playback controls and safe amplification.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
