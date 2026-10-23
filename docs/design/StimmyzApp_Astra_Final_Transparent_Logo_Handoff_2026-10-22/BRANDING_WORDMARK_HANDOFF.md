# Stimmyz — final transparent logo implementation contract (2026-10-22)

**Authoritative:** The user explicitly approved `glossy_mint_stimmyz_logo_with_sparkle.png` after requesting a transparent background and asked for the handoff to reflect the new three-screen showcase. This supersedes all earlier mint-SVG, rainbow wording, and charcoal-plaque branding guidance.

## Assets and precedence

1. `prototype/assets/stimmyz-logo-approved-transparent-source.png`: the **exact unmodified generated PNG selected by the user**, RGBA **2172×724**, with actual alpha transparency. Source SHA-256: `46684884e65efadf941d4341742dc6f42c9189f5c63ff1526f94b3a656372c29`.
2. `prototype/assets/stimmyz-logo-transparent.png`: a losslessly cropped derivative (transparent padding only) for in-app use. Preserve lettering, gloss, mint gradient, and the **existing rhomb sparkle** exactly. The image and sparkle are one asset.
3. `references/APPROVED_THREE_SCREEN_SHOWCASE.png`: latest user-approved **visual inspiration** for Board, Editor, Library: glossy mint branding, bright illustrated sound pads, rounded surfaces, purple affordances, and three-tab bottom navigation. This is a generated marketing concept, **not** an exact or verified feature implementation.
4. `prototype/assets/stimmyz-app-icon.png`: earlier approved standalone S launcher icon. **Do not modify.**
5. `prototype/brand-preview.html`, `previews/transparent-logo-light-dark.png`, and `previews/brand-board-*.png`: actual visual integration proof in light/dark themes.

The old `stimmyz-logo-original.png` with a dark background is **retired** from production assets and retained in `references/PREVIOUS_RETIRED_DARK_WORDMARK.png` for history only. The original `stimmyz-wordmark.svg` is obsolete.

## Header markup and visual constraints

- Board, Editor, and Library headers display the **same PNG** on fully transparent backing. No permanent charcoal badge, pill, plaque, opaque rectangle or framed card behind the logo.
- Use the file's true alpha channel. Do not fake transparency with CSS blend modes or sample a background color into the image.
- Preserve logo dimensions and typography via aspect-ratio-constrained fit. Within the 430px prototype phone the image aims for a width of ~260px and a height of ~82px, taking available space from the flex row rather than overlapping the 44px top-right overflow control. Scale down at narrow device widths.
- On pale backgrounds, a slight neutral/mint drop shadow may aid contrast; on Coffee use a minimal dark shadow. Do not recolor the logo per theme.
- Keep the built-in rhomb; do not append another sparkle as pseudo-element or text.
- Accessibility: `alt="Stimmyz"` or Android `contentDescription`; keep extra visual glints inaccessible. Top-right overflow needs ≥44px visual/48dp native touch target.
- Settings and full-screen capture flow may continue using their established task-focused headers, without an extra logo if vertical space is constrained.

## Visual reference vs functional source of truth

**Reference from new showcase:** glossy mint logo on all 3 main tabs; polished pastel/dark palette, strong rounded meme-pad colors, purple primary actions, three-tab navigation, compact decorative controls, artwork-first Library thumbnails and readable labels.

**Do not treat the showcase alone as authorization** to replace the device-recording-first Editor with a new audio-editing dashboard, add a Speed control, categories, favorites, or change the Library's saved/offline guarantees. The new mockup is a static concept, and the existing user-approved behavior/feature handoffs remain authoritative. Implement the established native routes and flows; discuss any new functional controls before building them.

## Required Astra changes

1. Ship the transparent logo as an offline Android drawable/optimized WebP (lossless and alpha-preserving) or PNG. Never network-fetch a header logo.
2. Apply on Board, Editor, Library; preserve the 3-tab shell, six themes, edit-only pad menus, and Quick Add #1.
3. Remove the old charcoal badge container and retired logo resources from the active code path. Do not leave them as fallback production visuals.
4. Keep native device-audio recording + trim, global Settings simplification, 3×4/4×4 board and Pages/Scroll, per-clip 0–200% gain/limiter, GIPHY demo/legal restrictions, and backup specs exactly as already documented.
5. Produce before/after native screenshots for light (Vanilla) and dark (Coffee) main tabs; test smallest supported width, dynamic type, clipping, TalkBack, offline image loading, and low-memory decode.

## Acceptance criteria

- **BR-T01** Approved source SHA matches above; the source has zero-alpha corners and an alpha channel.
- **BR-T02** The transparent derivative has no opaque rectangular backing or baked background.
- **BR-T03** Source graphic remains intact: lettering, mint gloss, exact sparkle and spacing.
- **BR-T04** All three main tabs render the same image; no duplicated sparkle or text substitution.
- **BR-T05** No dark plaque/badge appears behind the logo on any of the 6 themes.
- **BR-T06** Logo and overflow control never collide at narrow viewports; no horizontal scrolling.
- **BR-T07** Vanilla, Snow, Peach, Mint, Ice, and Coffee pass legibility/contrast review without an opaque backing.
- **BR-T08** Standalone S launcher icon unchanged.
- **BR-T09** Native image works offline and is bundled as a drawable rather than fetched or rendered via WebView.
- **BR-T10** The static marketing showcase does not introduce undocumented native controls/features.
- **BR-T11** Existing board, Settings, recording, Library, GIPHY and playback UX remains functional.
- **BR-T12** Astra reports changed files and Android device proof before declaring complete.

The HTML prototype and supplied concept preview are **not** proof of completed Android implementation.
