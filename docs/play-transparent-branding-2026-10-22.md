# Transparent Stimmyz branding — October 22, 2026

**Later owner update:** the GIPHY demo described in this historical record was
removed in favor of Gallery. See the [gallery update](play-gallery-picker-2026-10-22.md)
for current behavior and its testing artifact.

## Design authority and scope

Imported the complete Downloads package unchanged into
[`design/StimmyzApp_Astra_Final_Transparent_Logo_Handoff_2026-10-22/`](design/StimmyzApp_Astra_Final_Transparent_Logo_Handoff_2026-10-22/).
The ZIP SHA-256 is
`29266bc837bda694763e2071ee45c5ed6874f487ab0580756e2cbded017b59ee`.
Its branding contract and latest visual update supersede older wordmarks and
charcoal plaques. The interaction contracts carry forward the October 21
board/playback/settings behavior.

The source audit found those existing interactions implemented: per-board
3×4/4×4, Pages/Scroll, overlap, edit-only pad menus, Quick Add, native-clock
progress, restart/once/loop/three plays, master volume, backup/restore and Trim
preview. The current owner's +12 dB tuning at 200% remains in place; the
package's older +6 dB description does not reverse that change. Prior audio
and capture evidence remains in the existing QA records.

The generated showcase is visual inspiration. Speed, Favorites and Library
categories are explicitly outside this package's established native features.

## File-level implementation

- `app-play/src/ui/BrandHeader.tsx`: one shared, accessible, locally bundled
  transparent image, proportional sizing, and a separate 48 dp overflow target.
- `app-play/App.tsx`: mount the header on Board, Editor and Library, preserve
  task-focused Settings/capture headers, and route New board from any tab.
- `app-play/assets/stimyz/stimmyz-logo-transparent.png`: exact supplied cropped
  PNG; the launcher icon is unchanged.
- `scripts/build-play-android.ps1`, `scripts/verify-play-stage.mjs` and its
  tests: explicitly stage and verify the new PNG inside the Play boundary.
- `app-play/src/ui/CreateFlow.tsx`, `GiphyArtworkPicker.tsx`,
  `giphyArtworkDemo.ts` and its tests: Default/Gallery/GIPHY sources with a
  searchable, theme-aware inline sample picker, Stickers/GIFs, empty results,
  preview selection and keyboard reveal.
- `app-play/src/ui/LibraryScreen.tsx`: put the heading, creation/import actions,
  search and sounds into one scroll surface. Native testing at 320 dp and
  150% text showed the former fixed content left no room for the sound list.
  Modals and measured row-menu anchors remain outside that scroll surface.

Implementation was delegated to two `gpt-6-luna` workers at high reasoning
effort with separate file ownership, then reviewed by the primary agent. A
third worker performed a read-only interaction-contract audit. Existing
uncommitted playback/native/data changes were preserved. No commit, push or
publication is part of this work.

## GIPHY boundary

The handoff explicitly requires provider approval before production persistent
pad artwork. No approval or production key is supplied. This implementation
therefore provides only clearly labeled local emoji samples: no API calls,
downloaded media, cached provider URLs, or GIPHY metadata in saved sounds or
backups. Selecting a sample previews it only. Save retains a previously chosen
Gallery image or the default icon, with this behavior explained in the UI.
Default clears Gallery art. Sound names, local audio and offline saving remain
independent of the sample picker. Existing Library Imgflip artwork support is
retained for compatibility.

GP-07 and the live-service portions of GP-09 remain gated on the provider
approval described in the supplied handoff. The picker is not a live GIPHY
integration.

## Verification

- Approved source SHA-256 matches
  `46684884e65efadf941d4341742dc6f42c9189f5c63ff1526f94b3a656372c29`.
  Source is 2172×724 RGBA; shipped derivative is 2147×724 RGBA. Both have alpha
  range 0–255 and zero-alpha corners. The supplied derivative is copied exactly.
- 147/147 Play tests and 11/11 staging/release-plugin tests pass; strict
  TypeScript passes.
- Final ARM64/x86_64 release-mode APK and AAB build and artifact audits pass.
  The signed local-testing APK uses the existing testing certificate and was
  installed with `adb install -r` on the Android emulator. Existing clips and
  board assignments remained available. No physical phone was connected.
- Native screenshots cover Board, Editor and Library in Vanilla and Coffee,
  plus Board in Peach, Mint, Snow and Ice. Header measurements confirm one
  accessible Stimmyz image, preserved aspect ratio, and no collision with the
  48 dp overflow control. All three tabs pass at 320 dp with 150% text.
- Native review caught and fixed React Native's intrinsic PNG-height fallback;
  the image now has explicit percentage dimensions inside a ratio-sized
  wrapper. The corrected header measures 650×219 physical pixels at 432 dp
  width, and 545×184 at 320 dp, both at density 400.
- The scrolled Library exposes saved rows and anchored menus at 320 dp/150%
  text. New board opens its dialog from both Editor and Library. Full-screen
  Trim/Details retains its task header without an extra logo.
- Local fixture import → Trim → Details → save passes. Native GIPHY sample
  query filtering, Stickers/GIFs switching, selected preview and no-results
  states pass; the sound name survives those interactions. A selected demo
  saves as default artwork, and the saved test tone plays after an offline
  cold start. AudioFlinger identifies the app's active native output track;
  this is not an acoustic listening or gain measurement.
- The packaged logo loads after an offline cold start. The launcher icon
  files have no changes. All 90 staged inputs match the delivered build.

Full spoken TalkBack review, physical-device visual/listening regression and
an actual low-memory decoder stress test remain unverified. Existing audio
and capture test records are retained; this UI change does not establish new
physical gain/limiter measurements. Provider approval and live GIPHY service
failure tests remain outside the enabled sample picker.

## Artifacts and screenshots

- [Signed testing APK](../data/design-transparent-20261022/delivery-build/artifacts/stimmyz-transparent-design-testing.apk)
- [Unsigned AAB](../data/design-transparent-20261022/delivery-build/artifacts/soundboard-play-unsigned.aab)
- APK SHA-256: `495c9304e019011279d5c45acf942af6ed398cec37d25ddd261464166857b9e3`.
  Testing metadata remains 1.0.20/code 21; no store publication or version bump.

| Tab | Before, Vanilla | After, Vanilla | Before, Coffee | After, Coffee |
| --- | --- | --- | --- | --- |
| Board | [Before](../data/design-transparent-20261022/before-board-vanilla.png) | [After](../data/design-transparent-20261022/after-board-vanilla.png) | [Before](../data/design-transparent-20261022/before-board-coffee.png) | [After](../data/design-transparent-20261022/after-board-coffee.png) |
| Editor | [Before](../data/design-transparent-20261022/before-editor-vanilla.png) | [After](../data/design-transparent-20261022/after-editor-vanilla.png) | [Before](../data/design-transparent-20261022/before-editor-coffee.png) | [After](../data/design-transparent-20261022/after-editor-coffee.png) |
| Library | [Before](../data/design-transparent-20261022/before-library-vanilla.png) | [After](../data/design-transparent-20261022/after-library-vanilla.png) | [Before](../data/design-transparent-20261022/before-library-coffee.png) | [After](../data/design-transparent-20261022/after-library-coffee.png) |

The main-tab captures above use the corrected logo build; the Library captures
also include the final scrolling fix. Its [large-text scrolled Library](../data/design-transparent-20261022/final-narrow150-library-scrolled.png)
and [anchored menu](../data/design-transparent-20261022/final-narrow150-library-menu.png)
show that final correction. The [inline sample picker](../data/design-transparent-20261022/giphy-inline-ice.png)
and [no-results state](../data/design-transparent-20261022/giphy-no-results.png)
are native Android captures, not browser prototype screenshots.

The temporary `playback-qa-A440-design-qa` sound was deleted after verification;
the three original emulator sounds remain. Emulator size, density, font scale,
Coffee theme and connectivity were restored after the checks.

Local evidence is retained under
[`data/design-transparent-20261022/`](../data/design-transparent-20261022/),
including before screenshots of all three tabs in Vanilla and Coffee.
