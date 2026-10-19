# Clean Rebuild implementation and simulator review — 2026-10-18

The Play UI follows `design/StimmyzApp_Astra_Clean_Rebuild_2026-10-18/`
(`DESIGN_SOURCE_OF_TRUTH.md`, live HTML/CSS/JS, and its captured previews).
The earlier reviewed handoff is historical. This updates the existing Expo 57 /
React Native 0.86 Play app; Dev UI and its data are unchanged.

## Implemented

- Six persisted palettes: Peach, Mint, Snow, Ice, Vanilla, Coffee. Legacy
  light/system preferences migrate to Vanilla and dark to Coffee. The wordmark
  retains its magenta/violet/blue colors.
- Four-column Board with 8 dp gaps, 14 dp corners, and a separate Quick add action
  at index zero. Standard-size tiles use the reference 0.88 aspect ratio;
  larger text increases tile height to keep the Quick add title/caption readable.
- Independent, always-visible overflow on assigned pads; compact anchored
  Replace/Rename/Move/Clear menus. Empty placeholders stay neutral. Board and
  Quick add menus dismiss outside and respect available window space.
- Quick add remembers File, Record, or Library. The configuration arrow appears
  only in Edit board. File/Record are forwarded into the shared creation route.
- Drawn Board/waveform/database navigation icons at 29 dp, a 78 dp navigation
  bar, 70 × 4 dp active underline, and the reference's themed navigation colors.
- Dashed Editor import card, purple gradient file action, pink recording action,
  and Source → Trim → Details. Native recording, decoding, selected-range
  playback, WAV rendering, private storage, and assignment contracts remain.
- Independently draggable waveform handles, initially collapsed Fine tune,
  all eight time nudges, full-width preview, and fixed Next/Save actions.
- Optional Default/Gallery/Search artwork paths. Gallery uses the system image
  document picker and saves a center-cropped JPEG up to 512 px privately.
  Existing Imgflip popular-template browsing remains available.
- Library header/CTA/search/sort/thumbnail rows and anchored
  Play/Rename/Change artwork/Add to board/Delete actions. Make another sound
  follows the rows in the scrolling list.
- Artwork replacements use a new owned filename. A failed metadata write leaves
  the previous image intact and cleans the unreferenced replacement.
- Play-only MP4/MOV source support uses the existing bundled decoder to extract
  audio, then renders a WAV soundbite. No extractor/native dependency was added.

Implementation was delegated to three bounded `gpt-6-luna` workers at high
reasoning effort. The parent reviewed the code and performed native comparison.

## Verification

- October 18 verification: Strict Play TypeScript passes; all 70 Play tests
  pass, including palette migration, board assignment/reorder, PCM
  selection/rendering, gallery artwork, and failed artwork replacement. Nine
  staging/release-plugin tests pass.
- ARM64 + x86_64 APK/AAB build passes the source boundary, native autolinking,
  package identity, permissions, backup/cleartext, and extractor-marker audits.
- Testing APK uses the existing local testing certificate; v2/v3 signature and
  16 KiB ZIP alignment verification pass. Installed with `adb install -r` only
  on `emulator-5554`, package `dev.sarunas.soundboard.play`, 1.0.15/code 16.
- All six native background samples exactly match the specified hex tokens.
- Quick add remained at `[58,633][284,890]` before/after adding the video-derived
  clip and while toggling Edit. Normal mode has zero configuration arrows;
  Edit mode has one. Pad overflow opens with zero active playback tracks.
- Actual recording → drag both handles → +100 ms Start adjustment → Save
  produced `Design-QA-Recording` with the selected 18.40-second duration.
- Synthetic MP4 and actual MOV containers with AAC audio both opened as
  8.01-second trim sources. The selected MP4 audio played on an active native
  audio track and saved as a 5.93-second Library soundbite with gallery artwork.
- Library assignment placed that generated clip into an empty Main pad. Move to
  Artwork demo and back worked through the pad menus. During verification, the
  five original Library entries were present alongside two QA clips.
- Saved artwork, clip entries, board selection, and theme survived app updates
  and force-stop/relaunch. Quick add Record preference survived restart; File
  preference was restored after checking direct File and Record actions.
- With emulator Wi-Fi and mobile data disabled, the completed standalone build
  cold-launched and played the private video-derived sound. AudioFlinger showed
  an active track belonging to the Play process; both network connections were
  restored immediately afterward.
- At 360 dp / 150% text, Quick add fits, endpoints and selected duration reflow,
  all eight fine-tune buttons remain readable after scrolling, and theme picker
  Done remains visible. Original 1080 × 2260, density 400, font 1.0 restored.
- After testing, removed `clean-rebuild-video` and `Design-QA-Recording`; the
  synthetic pad assignment was cleared by Library deletion. At the end of that
  verification run, the original five Library sounds and their original board
  assignments were present. Main board, File Quick add, and the original light
  preference (migrated to Vanilla) were also restored at that time.

## 2026-10-19 restart

Restarting the default AVD loaded its `default_boot` snapshot dated 2026-08-30.
That restored state had only the Dev package; Play and the QA Downloads fixture
were absent. The exact verified 1.0.15/code 16 APK above was reinstalled with
`adb install -r`, without uninstalling the package or clearing app data. The
five saved Play clips from the October 18 QA run are absent from the restored
emulator state; their preservation claim applies to that October 18 run only.
No recovery of the missing clip data is established here. The current Play app
state is the default Vanilla theme with an empty Main board.

### Density follow-up

The restored AVD exposed a Board regression at 1080 × 2400 with density 420:
three columns fit while the fourth tile wrapped. The grid now rounds tile widths
down to physical-pixel boundaries and budgets the gaps in the same coordinate
space. Board rendering and drag destinations use the same snapped tile width.
The density 420 native check now shows four columns: Quick add at
`[60,667][284,922]` and Pad 3 at `[795,667][1019,922]`. Edit mode preserves
those bounds and shows one Quick add configuration arrow. At 1080 × 2260 with
density 400, four columns also fit: Quick add at `[58,633][284,889]` and Pad 3
at `[796,633][1022,889]`.

The full Play suite passes 72/72 tests. The latest targeted layout tests (10)
and strict TypeScript check pass. After the density proof, a final visual-only
source update aligned the Editor source icon positions and Library play/sort/
Make another sound styling with the prototype; these changes were included in
the final native build and checked below.

### Final October 19 native verification

The final ARM64 and x86_64 APK/AAB passed all build audits. The signed testing
APK passed v2/v3 signature and 16 KiB alignment checks, then was installed on
the AVD with `adb install -r`. Package version remains 1.0.15/code 16. Its
SHA-256 is
`b1367719f15861e5e8b4f5273e4969a0d272f1cdf5ca55cb715c9912ca0b7aed`.

The final screenshots show the four-column Board in Coffee, the corrected
Editor side-icon positions, and Library controls matching the prototype. A
synthetic MP4 was selected and saved as the 8.01-second `clean-rebuild-video`
clip. The Library showed the expected purple 43 dp Play control, 49 × 48 dp sort
button, and 118 dp Make another sound card. The generated clip was deleted using
the native Delete action; the Library count returned to zero. The final user
state was restored to Main, Vanilla, File Quick add, 1080 × 2260/density 400/
font scale 1.0, and Wi-Fi/mobile data enabled. The
[`board-ready` screenshot](../data/clean-rebuild-qa/board-ready-20261019.png)
records that state. The five clips absent after the earlier default snapshot
restart remain unrecovered; this verification does not restore or claim them.

Final native captures: [Board](../data/clean-rebuild-qa/board-final-20261019.png),
[Editor](../data/clean-rebuild-qa/editor-final-20261019.png),
[Trim](../data/clean-rebuild-qa/trim-final-20261019.png),
[Details](../data/clean-rebuild-qa/details-final-20261019.png),
[Library with QA clip](../data/clean-rebuild-qa/library-final-20261019.png),
[Library after deletion](../data/clean-rebuild-qa/library-cleaned-20261019.png), and
[restored Board](../data/clean-rebuild-qa/board-ready-20261019.png).

A `default_boot` checkpoint was saved at 2026-10-19 17:26:53 with the Play
1.0.15/code 16 activity foregrounded (the emulator listed a 75M VM size).
Afterward, a normal emulator restart restored the installed package and
foregrounded Main with the Vanilla theme and empty Library. This confirms the
restart for the checkpoint state; it does not recover the five clips absent
from the earlier restored snapshot.

## Evidence and artifacts

PNG screenshots and UI hierarchies are under
[`data/clean-rebuild-qa/`](../data/clean-rebuild-qa/). Live recording captures use
foreground-activity proof because the timer prevents idle UI hierarchy capture.
The generated audio/video and artwork fixtures are under its `fixtures/` folder.
The October 19 visual comparison set, refreshed from the final native screens
and independently reviewed, includes the
[overview](../data/clean-rebuild-qa/comparison-final-overview.png) and separate
[Board](../data/clean-rebuild-qa/comparison-final-board.png),
[Editor](../data/clean-rebuild-qa/comparison-final-editor.png),
[Trim](../data/clean-rebuild-qa/comparison-final-trim.png),
[Details](../data/clean-rebuild-qa/comparison-final-details.png), and
[Library](../data/clean-rebuild-qa/comparison-final-library.png) comparisons.
The density regression evidence includes the
[density 420 Board](../data/clean-rebuild-qa/density420-four-columns.png),
[density 420 Edit board](../data/clean-rebuild-qa/density420-edit-grid.png),
and [density 400 Board](../data/clean-rebuild-qa/density400-four-columns.png)
screenshots, plus their UI hierarchies in the same directory. Test evidence is
in [the 72-test Play log](../data/clean-rebuild-qa/play-tests-density-20261019.log)
and [the final targeted layout log](../data/clean-rebuild-qa/density-layout-final-tests.log).

The October 18 comprehensive QA build is retained as a historical artifact
under
[`data/play-clean-rebuild-complete-20261018/artifacts/`](../data/play-clean-rebuild-complete-20261018/artifacts/).
The [signed testing APK](../data/play-clean-rebuild-complete-20261018/artifacts/soundboard-play-testing.apk)
SHA-256 is `0cfc7a6e951ed92395cdf6a0ac7bff20e80342149223f6c001dcc6774c44df4f`.
The detailed Play test log is
[`play-tests.log`](../data/clean-rebuild-qa/play-tests.log).
The October 19 final verification APK/AAB and signatures are under
[`data/play-clean-rebuild-final-20261019/artifacts/`](../data/play-clean-rebuild-final-20261019/artifacts/).
The signed [final testing APK](../data/play-clean-rebuild-final-20261019/artifacts/soundboard-play-testing.apk)
SHA-256 is `b1367719f15861e5e8b4f5273e4969a0d272f1cdf5ca55cb715c9912ca0b7aed`.
The [final build log](../data/clean-rebuild-qa/final-build-20261019.log)
records the artifact checks.
The earlier October 19 density verification APK is under
[`data/play-clean-rebuild-density-final-20261019/artifacts/`](../data/play-clean-rebuild-density-final-20261019/artifacts/).

Native screenshot review corrected header spacing, gradient seams, neutral empty
pads, chevron/database shapes, out-of-header menu hit bounds, Quick action
forwarding, large-text overflow, and Trim/Library spacing against the live CSS.

## Practical limits

The native app displays the user's actual clips, artwork, board names, Android
system bars, and system font. It does not bundle the restricted prototype meme
crops or fabricate its sample audio. These content/system differences prevent
a literal identical-pixel comparison; component geometry and interaction are
checked against the prototype. Gallery currently uses the existing system image
document picker rather than introducing a new photo-picker dependency; manual
crop/reposition remains outside this change. Physical microphone quality and
physical-device playback latency were not measured. No store publication,
physical-phone install, commit, or push occurred.
