# Latest revision — approved transparent Stimmyz logo (2026-10-22)

**START HERE:** `BRANDING_WORDMARK_HANDOFF.md` and `LATEST_VISUAL_UPDATE.md` are authoritative for the logo and new showcase styling. They supersede prior guidance for a charcoal logo plaque. Browser prototype reflects transparent branding across Board, Editor and Library. Existing audio and board behavior is unchanged.

# Important — latest approved logo overrides all earlier branding notes

Use `prototype/assets/stimmyz-logo-approved-transparent-source.png` as the exact final approved source and `prototype/assets/stimmyz-logo-transparent.png` in the Board, Editor, and Library headers. This **supersedes all mentions of `stimmyz-wordmark.svg`, pastel rainbow recreation, SVG vector assets, or font outlines** below. The original standalone S app icon remains unchanged. See `BRANDING_WORDMARK_HANDOFF.md` for definitive rules. All other features and interaction contracts remain as before.

---

# StimmyzApp — Transparent approved logo + complete Astra handoff

**Latest revision: October 22, 2026.** Carries forward all existing board, playback, sound-creation, Library, Settings, and GIPHY-picker contracts. **New in this revision:** final user-approved transparent mint logo across Board, Editor, and Library, no charcoal plaque, and updated 3-screen visual reference. This is an interactive design prototype/handoff, **not native Android implementation**.

## Start here — latest first

1. **`BRANDING_WORDMARK_HANDOFF.md`** — authoritative transparent logo asset contract and Android acceptance criteria.
2. **`LATEST_VISUAL_UPDATE.md`** — exact visual change log and boundary between marketing mockup and feature requirements.
3. **`references/APPROVED_THREE_SCREEN_SHOWCASE.png`** — new visual inspiration, not a verified implementation spec.
4. **`previews/00-final-three-tabs.png`** — actual updated prototype screenshots for Board, Editor, and Library.
5. **`prototype/standalone.html`** — complete, offline, interactive browser reference.
6. **`ASTRA_IMPLEMENTATION.md`** — native implementation order, migration and safety requirements.
7. **`BOARD_NAVIGATION_HANDOFF.md`, `PLAYBACK_SETTINGS_HANDOFF.md`, `GIPHY_ARTWORK_PICKER_HANDOFF.md`** — existing contracts unchanged.
8. **`DESIGN_SOURCE_OF_TRUTH.md`** and **`design/tokens.json`** — colors, layout and precedence.

**Asset:** `prototype/assets/stimmyz-logo-approved-transparent-source.png` is the exact approved alpha-transparent PNG. `prototype/assets/stimmyz-logo-transparent.png` is the cropped offline UI asset. Old dark-background and reconstructed SVG logos are retired. The original S launcher icon remains unchanged.

## Important

- The name `Stimmyz` uses the user-approved logo image with transparent cutout, **not the retired purple/pink/blue italic wordmark**. The existing `S` icon remains **unchanged**.
- All six UI themes and device-capture-first audio creation remain the same.
- The GIPHY grid is simulated; live search, caching permissions, and production keys are not implemented in the browser prototype.
- The prototype uses mock audio and illustrative pad artwork; production Android audio and content rights must be handled separately.
- No font files are bundled or should be sent to end users.

## Historical specification

### Previous revisions / board and playback background

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

