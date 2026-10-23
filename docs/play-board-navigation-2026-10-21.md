# Board navigation and playback refinement — 2026-10-21

Follow-up: the subsequent [amplification implementation and QA](play-amplification-2026-10-21.md)
supersedes this record's disabled-boost state for the latest local testing APK.

## Source and implementation plan

The owner's Downloads bundle
`StimmyzApp_Astra_Board_Pagination_Lazy_Loading_2026-10-21.zip` is preserved in
[design/StimmyzApp_Astra_Board_Navigation_2026-10-21/](design/StimmyzApp_Astra_Board_Navigation_2026-10-21/README.md).
Its board-navigation and playback-settings contracts supersede the October 20
interaction rules. Its demo media remains a design reference and is excluded
from the Play application. The root device-capture report remains authoritative
for prior capture evidence.

Archive SHA-256:
`6a3de2f402689cceff292527dbc96a1406b87293886a7395a7cf7a8220066e6f`.

Inventory found an Expo/React Native Play app using the Dev monophonic
AudioContext engine, version 1 named boards, version 3 appearance/Quick add
preferences, and Play-private catalog/presentation snapshots. Full Play backup,
per-board navigation, overlap and clip gain/repeat were absent. The existing
recording, import, Trim and artwork paths are retained.

File-level implementation plan, established before production edits:

- `app-play/src/data/boardModel.ts`, `boards.ts`, `preferences.ts` and new clip
  playback persistence: migrate missing fields to 4×4, Pages, overlap off,
  master volume 100%, clip gain 100% and play once. Keep stable board/clip IDs.
- New `app-play/src/media/backup*`: bounded, validated versioned ZIP backup of
  owned audio/artwork and metadata, with merge/conflict and rollback handling.
- New `app-play/src/media/playback*`: independent Play playback, native-clock
  progress, restart, repeat, overlap, bounded cache and safe output processing.
  Keep boost gated until device measurements and listening validate it.
- `app-play/src/ui/BoardScreen.tsx`, board navigation/layout helpers and tests:
  virtualized grids, per-board edit panel, Pages/Scroll, stable Quick add,
  filtered cursor resets, edit-only menus and contextual playback controls.
- `app-play/src/ui/LibraryScreen.tsx`, shared playback options and Settings:
  clip preferences, master volume, themes, real backup/restore and About.
- `app-play/App.tsx`: integrate Play engine, lifecycle cleanup and shared UI.

Three bounded `gpt-6-luna` workers use high reasoning effort, with separate
ownership of data/backup, playback and UI. The primary agent reviews integration,
checks staging and native builds, and records the evidence below. Dev code,
saved user media, native capture service and the three-tab structure are preserved.

## Result and files

| Area | Files | Result |
| --- | --- | --- |
| Board storage | `app-play/src/data/boardModel.ts`, `boards.ts` | Legacy-safe 4×4/Pages/overlap-off defaults; preferences follow stable board ID and survive assignment/reorder operations. |
| Playback storage | `app-play/src/data/clipPlayback.ts`, `preferences.ts`, `library.ts` | Gain/repeat follow saved clip ID; master volume persists; deletion removes clip playback preferences. |
| Playback | `app-play/src/media/playbackEngine.ts`, `playbackDsp.ts` | Native AudioContext clock, restarts, once/loop/three plays, independent overlap requests, contextual Stop all, per-voice and aggregate decoded-memory bounds, mix headroom and oversampled soft-knee protection. |
| Backup | `app-play/src/media/backup.ts`, `backupValidation.ts`, `backupMerge.ts` | Streamed, versioned stored ZIP containing owned audio/artwork and metadata; validated CRCs, central/local ZIP records, filenames, media headers, sizes and references; conflict-safe merge and rollback. |
| Board UI | `app-play/src/ui/BoardScreen.tsx`, `boardNavigation.ts`, `boardLayout.ts` | 3/4-column virtualized grid, four-row Pages or lazy Scroll batches, Quick add rules, search before batching, accessible fallback, edit-only menus and persisted edit preferences. |
| Settings/options | `app-play/src/ui/SettingsModal.tsx`, `ClipPlaybackOptionsModal.tsx`, `LibraryScreen.tsx`, `app-play/App.tsx` | Master volume, six themes, backup/restore, shared clip options, foreground lifecycle cleanup and cross-tab Stop all. |

Tests were added/updated alongside board models, library/preferences, backup
validation/merge/round-trip/failures, DSP/player lifecycle and navigation helpers.
The Dev application's tracked files are unchanged. No commit, push, publication
or physical-phone installation occurred.

Pages count populated sounds, while existing empty assignment slots remain
available without creating imaginary extra pages. Scroll starts with 11/15
sounds, then appends 12/16. View state resets on board/query/grid/mode changes;
it does not become durable board data. The FlatList uses a five-screen window
and four-row render batches. Short initial content also recognizes an upward
swipe attempt, so a tall viewport does not require the first batch to overflow.

Clip options store gain 0..2, but the release UI and engine currently cap new
gain application at unity. Existing stored boost values are retained. The
post-mix protection is a soft-knee WaveShaper with headroom, **not a proven
true-peak limiter**. `PLAYBACK_BOOST_AVAILABLE` remains false until physical
meter/listening acceptance passes. Unsupported background playback is omitted;
leaving the foreground stops board/library playback.

ZIP backup limits are 1,000 clips, 32 MiB per audio file, 512 MiB media total,
and 8 MiB manifest metadata. Artwork must be JPEG, at most 512×512 and 1 MiB.
Export builds a regular private cache ZIP, then uses native copy to the
user-selected Android document. This avoids the installed Expo Android
content-URI FileHandle's unretained ParcelFileDescriptor failing during a long
write. Temporary/partial files are removed on failure. Restore preserves
existing clip IDs/preferences, retains differing board configurations under
new board IDs, deduplicates repeated restores, and applies imported app
appearance, Quick add and master-volume preferences. No process-death-atomic
multi-snapshot transaction is claimed.

## Verification

- 116 Play tests and strict TypeScript pass on the final source. These include
  ZIP round trip, matching-CRC invalid media, corrupt/truncated archives,
  partial export cleanup, metadata rollback, legacy defaults, clip deletion,
  board conflicts/reimport deduplication, player races/repeat/memory and batch
  guard behavior and first-launch preference persistence. Initial defaults are
  saved before partial Settings updates, preserving the device-recording Quick
  add default when master volume or appearance is changed first.
- All 132 Dev regression tests and Dev strict TypeScript pass. All 11
  stage/release-plugin tests pass.
- ARM64 + x86_64 APK/AAB builds pass source staging, device-audio-only native
  registration, package/permission, backup/cleartext, extractor-marker and
  unsigned-artifact audits. Final testing version remains 1.0.18/code 19,
  package `dev.sarunas.soundboard.play`; this is a local QA build, not a release.
- The existing API 36 emulator was started with a read-only disk overlay and
  updated using the existing testing certificate, without clearing saved data.
  The prior recording, artwork, assignment and microphone Quick add preference
  remained. A generated 500-sound sine-wave ZIP imported through the native
  document picker and added three boards alongside the existing Main board.
- Native 3×4 Pages showed Quick add plus 11 sounds, then Quick add plus the
  remaining four. 4×4 fit all 15. Edit controls exposed selected grid/mode and
  overlap state; normal-mode accessibility snapshots contained zero pad
  overflow/config controls. Both modes retained Quick add rules.
- Native search found sound 499 before its view batch was loaded. A looping
  fixture showed native-clock pad progress and contextual Stop all; search
  retained playback control while its pad was offscreen. Stop all cleared it.
  Player activity is not an audible-quality or latency claim.
- The 360 dp/150% font review caught and fixed edit-button wrapping and Quick
  add arrow background coverage. Settings scrolls its content at that scale.

Evidence, screenshots, generated fixtures and logs are under
[`data/play-navigation-qa-20261021/`](../data/play-navigation-qa-20261021/).

Native checks on the preceding delivery build (the final rebuild adds only
the tested first-launch preference persistence fix):

- An upward swipe on an initially non-overflowing four-row board loaded
  **15 → 31** sounds without requiring a manual tap. Further scrolling reached
  **143 of 500**, with **20 sound pads / 117 total accessibility nodes** in the
  current native snapshot. Quick add remained a single stable grid entry.
  Native memory evidence is in `final-memory.txt`; this is an emulator bounded
  view-tree check, not a physical-device frame-time benchmark.
- The export completed through the Android Documents picker and created an
  **8,407,217-byte ZIP**. Independent `unzip -t` verified every entry. Its
  manifest contained **501 clips, four boards and 502 media files** (500
  synthetic tones plus the pre-existing recording/artwork), Coffee appearance,
  master volume 0.95, clip gain 0.95 and loop repeat. Importing that exported
  ZIP through the native picker completed successfully. After a cold restart,
  the unfiltered Library still showed **501 / 1000 soundbites**, confirming
  repeated restore did not duplicate the clips. Library's always-visible menu
  opened the same sound's **95% / −0.45 dB / Loop** options as Board.
- Native testing exposed two separate installed-Expo SAF issues: long-lived
  content-URI handle invalidation, and copy-to-precreated-document overwrite
  deleting the destination before permission resolution. The final exporter
  builds in private cache and copies **to the selected directory**, letting
  native copy create its own document. Both failed-attempt partial files were
  removed. The final native export/restore and independent ZIP validation pass.
- The native-tested APK updated the emulator using `adb install -r`. The final
  rebuilt APK retains the established testing certificate, verifies v2/v3
  signatures and 16 KiB ZIP alignment, and matches the final staged sources
  (zero inventory mismatches). The final preference initialization fix passed
  automated tests; its rebuilt APK was not installed again on the emulator.
  The read-only emulator was shut down after QA, discarding its test overlay.

## Delivery artifacts

| Artifact | Location | SHA-256 |
| --- | --- | --- |
| Signed local testing APK, 66,096,437 bytes | [`stimmyz-design-testing.apk`](../data/play-navigation-qa-20261021/stimmyz-design-testing.apk) | `5e55f5c1673a407daaf56a3a51e729e653f4cb8f5e20d0d429a3198185a8b146` |
| Unsigned APK, 65,971,878 bytes | [`soundboard-play-testing-unsigned.apk`](../data/play-navigation-releasecheck-20261021/artifacts/soundboard-play-testing-unsigned.apk) | `ddb87260bcff381d1bfa59d8de06409f80a60bb0f64ac976cc0c23da0236c86a` |
| Unsigned AAB, 49,203,987 bytes | [`soundboard-play-unsigned.aab`](../data/play-navigation-releasecheck-20261021/artifacts/soundboard-play-unsigned.aab) | `b6080e6dbc4fd846ccc4140eb12681ed442e1f33f43de43726ebf6d2e660360b` |

Testing certificate SHA-256:
`b095e9fe2a6242050ef08117a90534e4629da9a35e0fdc095b04335dc32c020c`.
Build logs and `release-info.txt` are retained with the artifacts. No release
signing identity, Play upload or publication was used.

## Screenshot comparison

The pre-update [Coffee board](../data/play-navigation-qa-20261021/before.png)
records the old visible pad overflow and scrolling blank-pad grid. Final native
screens use generated tone fixtures rather than design-package meme assets.

| Screen | Vanilla | Coffee |
| --- | --- | --- |
| Settings | [View](../data/play-navigation-qa-20261021/settings-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-settings-coffee.png) |
| Normal Board | [View](../data/play-navigation-qa-20261021/final-normal-3x4-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-normal-3x4-coffee.png) |
| Edit / 3×4 / Pages | [View](../data/play-navigation-qa-20261021/final-edit-pages-3x4-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-edit-pages-3x4-coffee.png) |
| Edit / 4×4 / Pages | [View](../data/play-navigation-qa-20261021/final-edit-pages-4x4-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-edit-pages-4x4-coffee.png) |
| Edit / 3×4 / Scroll | [View](../data/play-navigation-qa-20261021/final-edit-scroll-3x4-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-edit-scroll-3x4-coffee.png) |
| Edit / 4×4 / Scroll | [View](../data/play-navigation-qa-20261021/final-edit-scroll-4x4-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-edit-scroll-4x4-coffee.png) |
| Clip Playback options | [View](../data/play-navigation-qa-20261021/final-clip-playback-vanilla.png) | [View](../data/play-navigation-qa-20261021/final-clip-playback-coffee.png) |

The final [360 dp / 150% text Coffee view](../data/play-navigation-qa-20261021/final-360-font150-coffee.png)
shows the wrapped edit control, readable 3-column pad labels and unobstructed
Quick add action text. [Large-text Settings](../data/play-navigation-qa-20261021/settings-360-font150-vanilla.png)
scrolls while keeping its close/Done controls available.

## Remaining device acceptance

Physical Android gain/limiter measurements and human audition remain open;
boost stays gated. TalkBack/keyboard usability, physical 500-clip profiling,
Bluetooth/audio-focus behavior, API 29+ regression, full recording/trim device
regression and interrupted-restore process-death recovery remain separate
acceptance items. Screenshots and pure DSP tests do not close those checks.
