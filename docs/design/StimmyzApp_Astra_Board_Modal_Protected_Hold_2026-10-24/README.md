# StimmyzApp — Astra handoff · 2026-10-24

**TOP PRIORITY (latest revision):** Start with `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` and `previews/00-board-modal-hold-overview.png`. These override older *inline Edit Board settings* screenshots and documentation. The offline HTML prototype is at `StimmyzApp_Interactive_Prototype.html`.

**Latest source of truth.** This package replaces all earlier Stimmyz visual handoffs. It is an **interactive HTML reference and native Android implementation specification**, not a built Android app.

## Read in this order

1. `LATEST_CHANGES_2026-10-24.md` — exact latest decisions and nonnegotiable UI requirements.
2. `prototype/standalone.html` — offline, self-contained working browser markup (audio and capture simulated).
3. `previews/00-latest-overview.png` — actual screenshots from that prototype, not generated marketing art.
4. `ASTRA_IMPLEMENTATION.md` — implementation phases, release constraints, acceptance tests.
5. `GALLERY_PAD_COLORS_HANDOFF.md` — **gallery-only** artwork pipeline and stable RGB/pastel color algorithm.
6. `DARK_THEMES_AND_MINIMAL_UI.md` — nine themes, UI cleanup, accessibility, theme migration.
7. `BOARD_NAVIGATION_HANDOFF.md`, `PLAYBACK_SETTINGS_HANDOFF.md`, `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md` — established behavior that remains valid.
8. `BRANDING_WORDMARK_HANDOFF.md` — user-approved transparent mint logo and original S launcher icon.
9. `design/latest-ui-contract.json`, `design/latest-browser-validation.json` — machine-readable decisions and browser verification.

## Latest changes

- **Editor:** delete only the redundant *Make a sound* page heading and subtitle. Keep the device recording hero and secondary source options; never add a second Record button.
- **Library:** delete *Your library* heading and intro, large Record device audio CTA, and bottom secondary Create CTA. Search/sort and clip list follow the shared header.
- **Artwork:** use **Default** or **Open gallery** only. No remote media search, provider SDK/API, streaming/GIF search, attribution or licensing stack. Android system Photo Picker imports user-selected images; copy into app-owned storage for offline use.
- **Pads:** every new sound gets its own stable colorful gradient, drawn from the existing vivid palette plus new pastel variants; never paint all pads the same color. Track assignment in saved sound metadata. Images optional; labels must remain readable.
- **Theme ownership:** Appearance belongs ONLY to Settings. Remove theme shortcut from global/Board overflow. Board selector is for board selection and creation only.
- **Nine themes:** Vanilla, Peach, Mint, Snow, Ice, **Chocolate** (existing Coffee restyled/renamed), **Grape**, **Nut**, **Blackberry**. Existing persisted `Coffee` preference maps to Chocolate without altering user data. Respect existing stored preferences and migrate safely.
- The existing transparent mint “Stimmyz ✦” image is authoritative and remains unchanged. The original S launcher icon also stays as-is.

## Preserve the established product

Device playback recording is the primary creation path; microphone and local file imports are secondary. Keep Quick Add first, pad ⋮ menus only during Edit Board, Quick Add's edit arrow edit-only, per-board 3×4/4×4 and Pages/Scroll, always-on playing-pad progress, per-sound 0–200% gain with native limiting, loops, Stop all, Library clip menus, offline files, backup/restore specifications, and all existing safety / permissions.

## Important boundaries

- Prototype is **UI-only**: mock sounds and local file previews do not prove Android capture, cropping, decoding, gain, import/storage, or backup are implemented.
- Third-party example sound names/images are for demonstration only; do not ship unlicensed meme artwork or audio in production.
- Prior `DEVICE_AUDIO_CAPTURE_RESULTS.md` is historical test evidence from Oct 20; it is not proof of compatibility across devices or playback sources.
- `references/approved-three-screen-concept.png` is a marketing visualization, not a source for adding unrequested features; the browser screenshots and written requirements control.
- Astra must inspect the existing Android repository, produce a file-level change plan, extend—not replace—the current app, then test on device before claiming completion.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
