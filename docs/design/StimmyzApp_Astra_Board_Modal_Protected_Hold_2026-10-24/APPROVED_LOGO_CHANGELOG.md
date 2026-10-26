**SUPERSEDED on 2026-10-22.** See `BRANDING_WORDMARK_HANDOFF.md` for the currently approved *transparent, no plaque* wordmark. This file records historical design decisions only.

# Approved Stimmyz logo design update — 2026-10-22

The newly supplied **Stimmyz ✦** raster artwork is the branding authority. It replaces the prior mint-gloss vector recreation and the much older purple wordmark. The approved art has tightly spaced inflated gel lettering, mint/turquoise shading, white highlights and a mint rhomb sparkle already included in the image.

## Markup changed

- `prototype/app.js`: Board header now renders `stimmyz-logo-transparent.png`, with image alt `Stimmyz` and no duplicate star/wordmark text.
- `prototype/app.css`: Responsive dark-charcoal plaque in the Board header; gentle mint keyline; overflow action visually separated. Palette/theme accent controls stay unchanged.
- `prototype/brand-preview.html`: Original supplied banner plus approved light/dark compact treatment.
- `prototype/index.html` and `prototype/standalone.html`: updated design notes and embedded resource; interactive UI works offline as a browser demonstration.
- `prototype/assets/stimmyz-logo-original.png`: exact source PNG from this turn; original RGB background preserved.
- `prototype/assets/stimmyz-logo-transparent.png`: transparency extraction from supplied artwork with correct aspect ratio for native UI placement.
- Removed obsolete `stimmyz-wordmark.svg` to avoid competing logo sources.

## Handoff changed

- `BRANDING_WORDMARK_HANDOFF.md`: **authoritative**, specific file contract, Android guidance and 12 acceptance criteria.
- `ASTRA_IMPLEMENTATION.md`, `DESIGN_SOURCE_OF_TRUTH.md`, `README.md`, `design/tokens.json`: new asset precedence and resources.
- `design/build_standalone.py`: embeds the actual PNG in the one-file prototype.
- `design/validate_wordmark.py`: asset checksum and 38 focused browser checks, plus theme screenshots.
- `design/rebuild_brand_previews.py`: refreshed Board screenshots showing the approved logo, not a stale design.

## Not changed

The six theme palettes, S launcher icon, three-tab navigation, Quick Add first-slot behavior, device-audio-first capture, trim, Library, Settings, per-clip 0–200% gain, 3×4/4×4, Pages/Scroll, edit-only pad menus and gallery-only artwork import. Native Android media and artwork features are not implemented by this browser markup update.

## For Astra

Review `BRANDING_WORDMARK_HANDOFF.md`, then `ASTRA_IMPLEMENTATION.md`. Integrate the local transparent asset into the existing native header. Validate screenshots on actual Android device in Vanilla/Coffee before declaring implementation complete. Do not substitute the old SVG or re-create the supplied image as plain text.
