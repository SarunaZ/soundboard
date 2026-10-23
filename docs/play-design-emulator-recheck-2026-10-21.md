# Design comparison and emulator recheck — 2026-10-21

Follow-up: [protected amplification](play-amplification-2026-10-21.md) is enabled
in the newer testing build, and its retry confirmed the folder-picker recovery
after changing Android text size. Earlier blocked checks below are historical.

Follow-up to the owner's request to run the emulator, compare against the new
Downloads design, and run testing. The visual authority remains
[`DESIGN_SOURCE_OF_TRUTH.md`](design/StimmyzApp_Astra_Board_Navigation_2026-10-21/DESIGN_SOURCE_OF_TRUTH.md),
the prototype and its previews. This record extends the
[implementation record](play-board-navigation-2026-10-21.md).

## Environment and Docker

The visible `Soundboard_API_36` emulator runs through the Windows Android SDK,
with a read-only disk overlay and no snapshot save. Existing app data was
retained when installing the testing APK with `adb install -r`. QA imports and
preference changes affect the temporary emulator session, not a physical phone.

Docker Desktop's Linux backend was inspected: `/dev/kvm` is absent, and the
existing Android build image has neither the emulator package nor system images.
The emulator itself therefore runs natively on Windows. Native APK/AAB builds
and the full Play test suite run inside Docker. No Docker/WSL virtualization
settings were changed.

Evidence is in [`data/play-design-recheck-20261021/`](../data/play-design-recheck-20261021/).
The primary agent reviewed two bounded `gpt-6-luna` high-effort implementation
workers for the UI and lazy-list corrections. No commit or push was made.

## Findings corrected

- Settings previously used a compact dialog and a flat list. It now follows the
  design's page header and four rounded cards: Playback, Appearance, Backup &
  restore, About. Theme selection expands from its row. Footer navigation and
  Android Back close Settings; backup work prevents conflicting navigation.
- The Edit board panel now has its accent board heading, right-aligned choices,
  overlap control and mode-specific explanation. Edit labels reserve space for
  the drag glyph. Native actions retain 48 dp touch targets.
- Clip options now follow the sound header, volume/dB and Repeat hierarchy.
  The disabled boost range is labelled accurately; Cancel discards the draft.
- Playback snapshots previously recreated FlatList data, and `onEndReached`
  treated every callback as being at the end. A loop at the top could advance
  the loaded count to 191 without deliberate scrolling. List data now remains
  stable between progress updates, end loading uses measured list distance,
  and callbacks are scoped to board/grid/mode/query.
- Native review caught missing Settings side insets and background board nodes
  still appearing in its hierarchy. The final layout uses side padding and hides
  the underlying native content while keeping its React state mounted.

## Verification

- **120/120 Play tests in Docker**, strict TypeScript, and **11/11 stage/release
  tests** pass. The additional regression checks real distance from the list end.
- Native Pages: 3×4 shows 11 sounds then four; 4×4 shows all 15. Quick add is
  first on each page. Normal-mode snapshots have zero pad options controls.
- The generated 500-tone ZIP imported successfully alongside the pre-existing
  recording. Search finds sound 499 before its view batch loads. A cold restart
  retains the board's navigation preference.
- Scroll adds complete 16-sound batches with one Quick add. After the fix, a
  loaded count of **47 remained 47 through ten seconds of idle looping** at
  the top. The loop retained visible progress and Stop all after scrolling;
  Stop all cleared playback. Evidence: `loop-stability-start.log`,
  `loop-active-new.png`, `loop-during-scroll-new.png`,
  `loop-stability-result.log`.
- TalkBack 16 was enabled and confirmed bound, with touch exploration enabled;
  Tab placed native keyboard focus on the named board selector. Its initial
  notification prompt was handled in the temporary emulator session. This is
  a service/focus smoke check, not a complete spoken-navigation audit.
- The final Settings layout passed native hierarchy isolation, side-inset,
  footer navigation, Android Back, and 360 dp / 150% text checks. Screenshots:
  `final-settings-vanilla-360.png`, `final-settings-coffee-360.png`,
  `final-settings-coffee-360-font150-top.png`,
  `final-settings-coffee-360-font150-bottom.png`.
- Native export produced an **8,407,216-byte ZIP**; independent `unzip -t`
  passed every entry. Restoring that export completed, and the Library retained
  **501 / 1000 soundbites**, without duplication (`roundtrip-confirmed.log`).
- Changing Android text size exposed an installed Expo folder-picker launcher
  lifecycle failure. A narrowly scoped legacy SAF fallback now handles that
  exact error; cancellation, unavailable folders and unrelated failures are
  tested. The rebuilt APK installed successfully. Its final native recreation
  recheck **did not run**: automatic approval review failed after hitting the
  account usage limit. This was a review-service failure, not an unsafe-action
  rejection. Do not treat the fallback as native-verified yet.

The latest signed local testing APK is
[`stimmyz-design-testing.apk`](../data/play-design-recheck-20261021/stimmyz-design-testing.apk).
Its unsigned build and source inventory are under
`data/play-design-picker-final-20261021/`. The preceding UI-tested APK passed
signature/alignment and zero source-inventory mismatch checks; the rebuilt
picker-fix APK still needs those final delivery checks repeated. The visible
Windows emulator was left running. No physical phone was installed or release
published.

## Limits

The screenshots use synthetic tone pads, not the handoff's illustrative meme
assets. This is a layout and interaction comparison, not an identical-pixel
assertion. The app declares portrait orientation. Emulator playback does not
prove physical latency, acoustic quality, peak limiting or OEM behavior. Boost
above 100% remains disabled pending physical measurement and human listening.
Full TalkBack flow, physical performance, Bluetooth/audio-focus and interrupted
restore process-death checks remain open as recorded in the implementation QA.
