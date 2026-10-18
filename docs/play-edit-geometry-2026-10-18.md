# Play edit mode without layout shifts — 2026-10-18

Play 1.0.6/code 7 keeps the normal board geometry when Edit board is toggled.
Removed the edit-only height/padding band and instruction row. The Edit/Done
button reserves the same label width; selection outlines and small grip glyphs
are absolute overlays. The 48 dp grip touch targets remain. Search query and
scroll offset are preserved, and drag hit-testing follows visible filtered IDs.

Native simulator checks passed:

- 432 dp / font 1.0: all **44 shared text elements** retained identical bounds;
  selector, Edit/Done button, search and pad positions remained fixed.
- 360 dp / font 1.5, scrolled: all **37 shared text elements** retained identical
  bounds; toggling edit did not reset the scroll position.
- The `test` filter remained active in edit mode. Dragging Keyboard test before
  Record test moved the correct sound, and tap-to-move restored the original
  order. Existing My recording and all saved sounds were preserved.
- Original active board, search state and normal display profile were restored;
  the simulator remains open in Edit board. No physical phone was changed.

Evidence: [normal](../data/emulator-review-2026-10-18/no-shift-normal.png),
[edit](../data/emulator-review-2026-10-18/no-shift-edit.png),
[44-element bounds result](../data/emulator-review-2026-10-18/no-shift-bounds-result.json),
[scrolled normal](../data/emulator-review-2026-10-18/no-shift-scrolled-normal.png),
[scrolled edit](../data/emulator-review-2026-10-18/no-shift-scrolled-edit.png),
[37-element bounds result](../data/emulator-review-2026-10-18/no-shift-scrolled-bounds-result.json),
[filtered drag](../data/emulator-review-2026-10-18/no-shift-filter-drag.png).

Implementation was delegated and independently reviewed; TypeScript and five
existing layout tests passed. The completed native build matched the current
BoardScreen source hash and passed the Play package/exclusion audits. The APK
passed local testing signature v2/v3 and ZIP alignment checks before updating
only the simulator Play package with `install -r`.

[Signed testing APK](../data/play-build-20261018-094210-835-8a80dbf5/artifacts/soundboard-play-testing.apk)
SHA-256: `029998cdc76736ffd6f44fd67dcd200b9377dad0e5ad149d1edf5f81a02f9b30`.
Unsigned APK/AAB and audit metadata are in the same artifact directory.
No commit, push or publication occurred. Remaining handoff work stays tracked
in [STEPS.md](../STEPS.md).

## Saved-pad menu follow-up

Play 1.0.7/code 8 renders the entire pad-options button only in Edit board mode,
including saved sounds. Normal pad playback handlers and all styles are unchanged.
TypeScript and the five existing board-layout tests passed. The ARM64+x86_64
native APK/AAB build and package/exclusion audits passed; the signed testing APK
passed v2/v3 signature and ZIP alignment checks and updated only simulator Play
with `install -r`.

On the user's current 😑 board, My recording remained in pad 10. Native checks
found zero menus in normal mode, 16 in edit mode, and zero after Done. The saved
pad menu opened successfully during editing. All 28 shared text elements retained
identical bounds. The board was left in its original normal mode; no sound or
assignment was changed. Dev source remains unchanged.

Evidence: [normal](../data/emulator-review-2026-10-18/saved-pad-menu-normal.png),
[edit](../data/emulator-review-2026-10-18/saved-pad-menu-edit.png),
[opened options](../data/emulator-review-2026-10-18/saved-pad-menu-open.png),
[after Done](../data/emulator-review-2026-10-18/saved-pad-menu-done.png),
[menu and bounds result](../data/emulator-review-2026-10-18/saved-pad-menu-result.json).

[Signed testing APK](../data/play-build-20261018-150240-526-4328ab33/artifacts/soundboard-play-testing.apk)
SHA-256: `91027cdb6bf6a54d0236f17df9a9e39b75b1b1a93efe17a6f2dd9c3c6d191b59`.

## Larger Board wordmark

Play 1.0.9/code 10 increases Stimmyz from 23 to 32 sp, matching the reviewed
prototype's 32 px brand text, with 39 sp line height, tighter tracking and a
smaller 20 sp sparkle. Pink/purple theme colors and system font-scaling behavior
remain. The subtitle retains its existing size.

TypeScript and the five existing board-layout tests passed. The ARM64+x86_64
native build and package audits passed, followed by local testing signature
v2/v3 and ZIP alignment verification. Updated only simulator Play with `install -r`.
Visual checks passed at 432 dp/font 1.0 and 360 dp/font 1.5: no logo clipping,
and identical header/shared-text bounds when toggling Edit board. Restored the
original 1080×2260, density 400, font 1.0 profile and normal board mode. The saved
Imgflip demo and existing sounds remain intact; Dev source is unchanged.

Evidence: [before](../data/emulator-review-2026-10-18/logo-size-before.png),
[after](../data/emulator-review-2026-10-18/logo-size-normal.png),
[compact large text](../data/emulator-review-2026-10-18/logo-size-compact-large-text.png),
[edit-bounds results](../data/emulator-review-2026-10-18/logo-size-bounds.json).

[Signed testing APK](../data/play-build-20261018-153634-305-07f84e7f/artifacts/soundboard-play-testing.apk)
SHA-256: `5291210d3524095b84e1d66716cc43cffc55f2218a16c524943e24c65141b5d4`.
