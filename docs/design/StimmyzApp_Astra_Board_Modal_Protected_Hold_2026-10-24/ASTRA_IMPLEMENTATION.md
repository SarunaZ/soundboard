# Astra — implementation plan & acceptance criteria

## Objective

Implement latest minimalist Stimmyz UI and gallery-only art flow **in the existing native Android application**. Start by inventorying current screens, navigation, assets, view models, sound entity/storage schema, image picker, theme state and audio playback pipeline. Propose impacted files before modifying code. Don't treat the HTML as production code or replace the native app with a WebView.

## Priority 0: reconcile removed functionality

1. Delete GIPHY search, third-party imagery providers, online GIF/image selection UI, related services, API keys, search DTOs, dependency modules and permissions **if actually present and unused elsewhere**. Avoid breaking existing local artwork references: migrate unsupported remote-art records to the safe default artwork or preserve already legitimately stored local originals; do not delete users' audio.
2. Remove redundant Editor page title/subtitle. Preserve the device-recording card and secondary mic/file actions.
3. Remove Library title/description and both creation CTA variants (large recording CTA and bottom add-sound CTA). Keep search, sort, saved clips, sound menu actions, offline playback.
4. Remove the direct Appearance shortcut from top-right overflow. Appearance remains exclusively within Settings. Do not remove Settings itself.

## Priority 1: gallery-only artwork

Use Android Photo Picker (`ActivityResultContracts.PickVisualMedia`) for a single image; support an appropriate system document picker fallback where Photo Picker is not available. Prefer scoped picker access without broad storage permissions. On choice: check MIME/size/dimensions, bound memory usage, correct EXIF orientation, crop/center-fit to pad as appropriate, save normalized local artwork in app-owned private storage, persist the local reference against the sound, and clean replaced/deleted artwork safely. Handle cancellation, corrupt files, cloud-backed system media picker sources, OOM, file revocation, and offline replay. User-saved browser photos can be picked just like other Gallery photos; **do not embed a browser or Google Image Search**.

## Priority 2: stable colorful pad backgrounds

Existing sound samples keep their vivid gradient assignments. For new clips assign a color **once on creation**, store `padColorId` or stable equivalent in the sound model, and render from that identity. The prototype demonstrates original 15 vivid gradients, 16 more pastel gradients, and a golden-angle HSL progression for later pads. RGB/ARGB values can be precomputed by the native implementation. Persist the monotonic allocation cursor or equivalent stable identity so deletion or reordering doesn't recolor everything or immediately duplicate the prior assignment. In grid/list renderers use colors from the individual sound; never a single shared background across pads. Keep dark text and adequate contrast on pale pastels, plus image/label overlays where necessary. Do not recolor Quick Add.

## Priority 3: additional dark themes

Extend the saved theme enum/resolver to include Chocolate, Grape, Nut, Blackberry. `Coffee` is a legacy name for Chocolate; gracefully map stored Coffee preference without data loss. Preserve the five existing light themes. Dark themes need complete palettes for background, surfaces, separators, typography, muted copy, accent, navigation and settings/picker UI; no hardcoded black-on-black controls. Maintain the exact approved transparent logo on all themes; theme backgrounds should not be baked into the logo. Appearance lives in Settings only.

## Preserve existing behavior

- Board Quick Add first slot (every page in Pages, once at beginning in Scroll); board-local 3×4/4×4 sizing and Pages/Scroll/virtualization.
- Edit-only pad ⋮ and Quick Add configuration arrow; Library sound ⋮ always available.
- Device-recording-first creation with Android permissions/source capture restrictions, microphone and local audio/video import, waveform trim, loop preview/playhead behavior.
- Per-clip gain 0–200%, limiter/clipping protection, loop modes, board-local overlapping sounds, dynamic Stop all, restart-on-tap and always-visible playing pad progress. Default sound plays once.
- Theme persistence, backup of artwork + sound files + board metadata, offline playback, legacy data migration, TalkBack and responsive layout.

## Must-pass acceptance tests

1. Editor has no page-level title/subtitle but a single prominent `Record device audio` button and two secondary sources.
2. Library begins with search; no intro header and no creation CTA. Clip actions still work.
3. Settings contains Appearance; no theme shortcut in top-right overflow or Board selector. Switching any of nine themes works without losing state; previous Coffee preference maps to Chocolate.
4. Artwork step has **only** Default and Open gallery; no network-backed image search. Selecting/canceling/replacing/deleting photos survives restart and works offline; no broad gallery permission if system picker suffices.
5. New sounds show different assigned gradients; colors persist after restart, board changes, pagination, sorting, and library operations; existing pad colors unchanged. Colors/text remain legible on all nine themes.
6. Quick Add is first, its arrow appears only in edit mode, and pad ⋮ is only in edit mode; Library ⋮ stays present.
7. 3×4 and 4×4 with both Pages and Scroll show all sounds, retain per-board settings and don't interrupt currently playing audio except explicitly required behavior.
8. Native sound amplification must be bounded/limited; test loud and clipped source files + overlapping playback on physical device. Test device-audio capture only from sources that permit it.
9. Device screenshots at 360dp and standard width in Vanilla, Chocolate, Grape, Nut, Blackberry; inspect 1.5× font, TalkBack labels, contrast, tap targets, clipped text/controls and orientation.
10. No newly introduced unlicensed meme audio/art is bundled into Play Store build.

## Required delivery from Astra

List changed files, model/schema migration approach, tests run/passed, Android device evidence, before/after screenshots, sound latency/limiter outcomes, and any deferred items. Treat visual browser tests as reference only; do not claim they validate Android media processing.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
