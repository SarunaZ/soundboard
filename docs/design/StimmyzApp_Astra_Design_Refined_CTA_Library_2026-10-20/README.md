# StimmyzApp — Device-audio-first design update

**Update date:** 2026-10-20. Supersedes the previous import-first **screen hierarchy**, but preserves all previously approved design treatments and interactions.

## Start here

1. `DESIGN_SOURCE_OF_TRUTH.md` — updated design hierarchy and interactions.
2. `prototype/standalone.html` — fully offline interactive HTML implementation reference. This is a **UI simulator**, not live recording.
3. `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md` — **new** Trim preview playback progress specification and TP-01–TP-11 test criteria.
4. `ASTRA_IMPLEMENTATION.md` — engineering stages and current acceptance criteria.
5. `previews/` — actual screenshots captured directly from this HTML reference, including `trim-progress-vanilla.png` and `trim-progress-coffee.png`.
6. `DEVICE_AUDIO_CAPTURE_RESULTS.md` — owner-supplied physical and emulator POC report; limited to tested clips and versions.
7. `references/` — previously approved six-theme, dark-mode and trim-flow mockups; the *old import-first Editor* in those images is superseded.

## New primary interaction

**Record device audio → switch to compatible app → play moment → Stop → Trim → Customize → Save → Play**.

- The **Editor** hero is now **Record device audio**.
- **Record microphone** and **Import audio/video** remain accessible as secondary cards.
- **Quick Add** is fixed at grid index 0, defaults to device capture for new users, and shows its dropdown arrow **only in Edit Board mode**. Existing settings must not be overwritten in the real app.
- **Library** main CTA is Record device audio; bottom dashed button opens the full source picker.
- The personal-only URL field remains after the supported sources and is omitted from the Play Store preview.
- Do not change approved Peach / Mint / Snow / Ice / Vanilla / Coffee themes, pad ⋮ menu, library ⋮ menu, 29dp nav icons, draggable waveform or optional artwork step.

## What the prototype tests

Tap the Editor CTA or Quick Add to simulate device capture. The simulated Stop advances to waveform Trim. In Trim, tap Play preview to watch the playhead and progress bar move; Pause, Loop and adjust selection. Then Customize and Save to add a mock clip while Quick Add remains first. Change the Quick Add preference in Edit Board mode. Everything in the browser is illustrative; **no actual audio is captured or played**. Playback progress is simulated using browser time; the native implementation must use audio-player positions. The real device audio capture POC is a distinct native implementation.

## Evidence and limitations

`design/device-first-test-results.json` records browser interaction tests for priority and legacy UI invariants. `DEVICE_AUDIO_CAPTURE_RESULTS.md` includes successful selected-device source tests but expressly does not demonstrate universal app compatibility or full copyright permission. Relative links within that copied report refer to records in the original Android project and are **not** included here. Do not market device recording as an unrestricted downloader. Do not bundle internal demo meme art or third-party audio without rights verification.

## Instruction to Astra

> Update the existing screens using this package, preserving their approved theme styling and navigation, but change the creation hierarchy to **device-audio-first**. Inspect the actual repository and existing device capture POC before proposing a file-level implementation plan. Reuse working MediaProjection/AudioPlaybackCapture functionality; do not replace it with the HTML simulation. Preserve prior Quick Add preferences and the fixed first tile; edit-only arrow, pad/library ⋮ menus, all six themes and Trim/Customize workflow. Validate against previews from the updated HTML and the physical POC report; state limitations honestly.

## New Trim progress handoff

Read `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md` before changing the Trim screen. It adds an animated playhead, brighter played waveform segment, Play/Pause, elapsed/total progress, and optionally Loop. The source start/end values and Fine tune remain separate. **Do not drive the Android playhead from a UI-only stopwatch.** A paired native-audio test is required.


**Latest microcopy update:** The prominent device-audio recording card no longer contains the long “Hear something funny…” description. All remaining controls and safety/compatibility messages are preserved.

## Latest visual refinement (2026-10-20)

- Editor and Library **Record device audio** primary actions are now **text-only**, precisely centered.
- Library is now represented by a **collection of stacked cards with a play mark** in the tab bar and the Library heading, replacing the old database cylinder.
- Full-size navigation icons, pad ⋮ menus, Library ⋮ menus, Edit Board–only Quick Add chevron, wave progress, themes and source behavior remain unchanged.
- Updated, browser-captured screen previews can be found under `previews/refined-*.png`.
