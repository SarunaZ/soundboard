# Browser design validation — 2026-10-22

Run from the package root:

```bash
python design/build_standalone.py
python design/rebuild_brand_previews.py
python design/validate_wordmark.py
python design/validate_board_navigation_current.py
python design/validate_giphy.py
python design/validate_simplified.py
```

Validated in Chromium with Playwright:

- **164 final transparent-logo checks** (source alpha, integrity, Board / Editor / Library across six themes, no opaque badge, narrow widths, no layout collisions, core interactions).
- **39 board navigation checks** (Pages / Scroll, Quick Add, edit-only menus and playback regressions).
- **26 GIPHY picker UI checks** (demo results only; not a live API).
- Simplified settings/volume/playback visual checks passed (full results in `design/simplified-validation.json`).

Browser prototype screenshots and tests do not prove native Android recording, rendering, audio peak limiting, or GIPHY licensing. Astra must test those separately on hardware.
