# Latest revision — approved transparent Stimmyz logo (2026-10-22)

**START HERE:** `BRANDING_WORDMARK_HANDOFF.md` and `LATEST_VISUAL_UPDATE.md` are authoritative for the logo and new showcase styling. They supersede prior guidance for a charcoal logo plaque. Browser prototype reflects transparent branding across Board, Editor and Library. Existing audio and board behavior is unchanged.

# Important — latest approved logo overrides all earlier branding notes

Use `prototype/assets/stimmyz-logo-approved-transparent-source.png` as the exact final approved source and `prototype/assets/stimmyz-logo-transparent.png` in the Board, Editor, and Library headers. This **supersedes all mentions of `stimmyz-wordmark.svg`, pastel rainbow recreation, SVG vector assets, or font outlines** below. The original standalone S app icon remains unchanged. See `BRANDING_WORDMARK_HANDOFF.md` for definitive rules. All other features and interaction contracts remain as before.

---

# Astra implementation handoff — StimmyzApp vNext

**Date:** 2026-10-22  |  **Scope:** targeted refinement to the **existing** Android app, not a rewrite.

## Latest revision — approved user-supplied logo

**NEW:** `BRANDING_WORDMARK_HANDOFF.md` is the authoritative specification for the approved user-provided mint `Stimmyz ✦` image. The previous custom SVG and purple-gradient text logos are retired. The original `S` app icon is unchanged. Integrate the transparent raster cutout into the existing Android UI, preserving all previous functionality. The artwork and UI are not a reason to rewrite the app.

## Read in this order

1. `BRANDING_WORDMARK_HANDOFF.md` — **latest visual change; supersedes older logo direction.**
2. `BOARD_NAVIGATION_HANDOFF.md` — **new** per-board Pages / Scroll contract and acceptance tests (overrides pagination-only language).
3. `PLAYBACK_SETTINGS_HANDOFF.md` — playback, gain, grid and menu contract (as updated).
4. `DESIGN_SOURCE_OF_TRUTH.md` — design fidelity, menus, themes and screenshot comparison.
5. `prototype/standalone.html` — interactive reference, **not production audio code**.
6. `design/tokens.json` — semantic theme palette and grid metadata.
7. `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md` — unchanged Trim screen progress contract.
8. `DEVICE_AUDIO_CAPTURE_RESULTS.md` — prior real-device capture tests; do not misrepresent compatibility as universal.

## Product vision

Stimmyz is a quick, personal meme/audio soundboard. The core experience is open → tap a favorite sound → hear it instantly. Making new clips is **device-audio-first**, while microphone recording and authorized local file import remain available. Keep the six themes and the existing Board / Editor / Library navigation. Avoid configuration overload.

## Changes in this handoff

- Simplify global Settings: master volume; background playback only if native support is complete; Appearance, Backup/restore, About.
- Pad playback progress, restart-on-tap, play-once default, resetting after playback, Stop All, clipping protection and readable labels become baseline behavior with **no unnecessary settings**.
- Allow simultaneous playback **per board** and grid sizing **3 columns × 4 rows or 4 columns × 4 rows** plus board navigation **Pages / Scroll (lazy-loaded)** in **Edit Board**.
- Pad ⋮ is **visible only during Edit Board**. Library row ⋮ stays always available. Quick Add remains first with its arrow edit-only.
- Clip Playback options (from Library and Edit Board menus) provide gain **0–200%** and repeat **once / loop / three times**.
- Safe digital boost must have a tested limiter. The browser demonstrates UI state only; native audio correctness must be verified on device.

## Existing features to preserve

- Six themes: Peach / Mint / Snow / Ice / Vanilla / Coffee, including the **approved user-supplied mint/aqua logo**, pastel and dark surfaces, image-forward pads, large ~29dp tab icons and active underline.
- Board selector, sound search, editable board layouts, full-screen Source → Trim → Customize, optional artwork, draggable waveform trim and real audio playback progress.
- Record device audio (Android MediaProjection/AudioPlaybackCapture), microphone, local file import and offline clips, with Android consent and an interruptible foreground recording service.
- Quick Add first, per-user action preference, edit-only config arrow, and other Pad/Library menu actions.
- Store/personal build separation; **no unauthorized YouTube extractor code in Google Play release**, no unlicensed bundled meme media.

## Engineering stages

**Branding priority — wordmark:** Apply the approved transparent `stimmyz-logo-transparent.png` in the Board header, preserve the existing app icon, and verify Vanilla/Coffee screenshots. See `BRANDING_WORDMARK_HANDOFF.md`.

**0 — Inventory:** Identify native audio player, playback events, storage schema, board association model, settings persistence, clipping strategy, and if any of the requested functionality already exists. Produce file-level plan and reversible migrations; no blind rewriting.

**1 — Navigation/board edit:** Implement true 3×4/4×4 capacities with per-board Pages / Scroll navigation; persist both grid and navigation per board. Pages show four rows with a pinned Quick Add each page; Scroll progressively appends four-row batches with Quick Add only once at the top. Do not duplicate Quick Add within a scrolling feed. Hide pad ⋮ entirely in normal mode (including accessibility tree); Library ⋮ remains. Board overlap toggle lives in Edit Board.

**2 — Playback defaults:** Remove Show pad progress / Tap behavior / Default repeat / global overlap controls. Always drive progress from native playback position. Restart-on-tap; once by default. Stop All contextual. Configure optional repeat only on clips.

**3 — Gain:** Add per-sound gain with 100% unity and 200% digital boost. Persist a float 0..2. Implement safe limiting and multi-stream headroom. Confirm with measurements/ears on an Android phone, not just UI tests.

**4 — Settings/backup:** Simplify settings page and keep theme/backup features. Update versioned ZIP schema or migration as necessary for navigation mode, grid and per-clip preferences; do not silently reset existing users' preferences or sounds.

**5 — QA:** Pass BN-01...BN-09 in `BOARD_NAVIGATION_HANDOFF.md` and AS-01...AS-14 in `PLAYBACK_SETTINGS_HANDOFF.md`; run regression tests on capture, trimming, saved/offline playback, six themes, large font, and API 29+ behavior.

## Reporting to owner

Give (a) exact files changed, (b) before/after screenshots in Vanilla and Coffee showing Settings, Edit Board 3×4/4×4 with both Pages / Scroll, normal Board without pad menus, and sound volume modal, (c) proof of actual Android gain/limiting, (d) test results, (e) deferred items and blockers. **Do not claim UI simulation is native functional behavior.**

