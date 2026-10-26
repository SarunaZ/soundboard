# Board layout, navigation and editing behavior

- A board chooses **3×4** (12 cells) or **4×4** (16 cells); the user also chooses **Pages** or **Scroll (lazy loading)** in **Edit Board**, per board. No related controls in global Settings.
- **Pages**: Quick Add is cell #1 on every page; 3×4 shows 11 sounds per page, 4×4 shows 15. Keep current page in board state and allow Previous/Next, preserving all sounds and selection after switching mode or board. If the list shrinks, clamp the page index.
- **Scroll**: Quick Add is cell #1 only once at the top. Load initial 4 rows (remaining cells are sounds), then append additional four-row batches on nearing the bottom; use native lazy grid virtualization so thousands of sounds don't decode artwork at once. Scroll position should be retained when navigating back where practical.
- Do not duplicate Quick Add or lose sounds during mode changes, filtering/searching, import or backup restore.
- Every individual **pad has its own stable gradient** selected when the clip was first saved, independent of board position, sorting, page index and theme. Use sound metadata—not index-based palette assignment at render time.
- Normal playback mode hides every pad ⋮ menu and the Quick Add configuration arrow. Both appear only when **Edit Board** is active; Library ⋮ menus stay available. Keep accessibility labels and touch hitboxes.
- All audio/session lifecycle behaviors remain native: restart active clip on tap, contextual Stop all while clips are active, per-board overlap, always-visible pad playback progress when playing, and no forced audio restart simply because more pad rows load.

Acceptance: both grids × both navigation modes × each of nine themes, multiple boards, ≥100 clips, Quick Add placement, edit-only controls, restored persisted preferences, and no dropped audio while scrolling.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
