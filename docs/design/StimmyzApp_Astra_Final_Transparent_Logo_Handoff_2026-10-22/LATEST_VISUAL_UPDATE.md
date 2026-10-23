# 2026-10-22 — Transparent logo and approved 3-screen visual direction

## What changed in prototype

- Replaced previous extracted logo with user's latest fully alpha-transparent PNG (exact raw original also bundled).
- Removed charcoal logo plaque and decorative frame; added mild adaptive drop shadow only.
- Unified the brand header on **Board, Editor, and Library**; top-right overflow remains available.
- Updated compact layout to avoid overlaps at 320, 360, 375, 412 px.
- Added brand preview showing actual transparent logo on Vanilla and Coffee, with no opaque badge.
- Added the latest user-approved 3-screen showcase as a reference image.

## Relationship to the new showcase

The screenshot demonstrates visual direction: glossy mint brand lettering with integrated diamond/rhomb, strong colorful meme-pad tiles, bright light surfaces or Coffee dark mode, polished rounded controls, and purple interaction highlights. The mockup is **not a complete screen specification**. In particular, it depicts a different Editor information layout with Speed and Favorites and Library category filters; these are not yet established features. Retain the proven device capture → trim → customization flow and the current Library's offline behavior.

## No changes

- App S icon, Quick Add position and action, edit-only pad ⋮ and Quick Add configuration arrow.
- Themes Peach/Mint/Snow/Ice/Vanilla/Coffee; 3x4/4x4; Pages/Scroll; nav Board/Editor/Library.
- Board overlap and per-sound gain/loop; always-on pad playback progress; global Settings simplified.
- Library menus, GIPHY sample picker, backup/restore specification; licensing constraints.

## Native implementation boundary

All browser behaviors are simulations. Astra must inspect the existing Android repo, integrate the logo as a packaged local drawable and run on-device visual/audio regression tests. Do not claim a production GIPHY API or native media processing is implemented by this handoff.
