# Play recording and native visual checks — 2026-10-18

Latest follow-up: [Play 1.0.5 pad rearranging and native verification](play-pad-reorder-2026-10-18.md).
The earlier recording and visual passes below retain their original build details.

## Follow-up: Quick add arrow only while editing (1.0.4 / code 5)

The user clarified that Quick add's configuration arrow should appear **only
while Edit board is active**. The menu overlay now follows that rule. Normal
Quick add taps still use the saved preference; assigned-sound overflow behavior
is unchanged. This preference supersedes the handoff's always-visible Quick add
configuration arrow. No storage or recording behavior changed.

Version 1.0.4/code 5 was installed as an update in the simulator. Native captures
verified the arrow [absent normally](../data/emulator-review-2026-10-18/quick-arrow-normal.png),
[visible while editing](../data/emulator-review-2026-10-18/quick-arrow-editing.png),
opening the [configuration menu](../data/emulator-review-2026-10-18/quick-arrow-menu.png),
and [hidden after Done](../data/emulator-review-2026-10-18/quick-arrow-done-settled.png).
The normal pad still opened its [saved source action](../data/emulator-review-2026-10-18/quick-arrow-tile-action.png).
The emulator was left on the current user's board in normal mode. No preference,
assignment, board or saved sound was changed during this check.

One `gpt-6-luna` / high worker made the bounded change; parent review, TypeScript
and five existing board-layout tests passed. The dual-ABI native build passed
(374 tasks, 2m 8s), including package audits, APK signature v2/v3 and ZIP alignment.
Current [testing APK](../data/play-build-20261018-091155-693-186ccfb5/artifacts/soundboard-play-testing.apk)
SHA-256: `a551d60313d7381cabdcfb26f490975e34cb0bf71e2cb3fa957cf10882abd16c`.
The Dev app and physical phone were not changed.

## Follow-up: visible Editor recording action (1.0.3 / code 4)

The simulator's Editor previously showed only **Choose a source**, hiding the
recording option one screen deeper. It now shows separate full-width **Choose
file** and **Record sound** actions. Each opens the existing creation flow with
that action selected. Entering Editor alone does not request microphone access.
Board and Library still open the general source choices. Editor is scrollable
for larger text.

The updated APK was installed with `install -r` in `emulator-5554`. Tapping Record
started the timer directly; Stop produced a 7.26-second microphone source in
Trim. Discard returned to Editor. Choose file opened Android DocumentsUI;
cancellation returned safely to Source. Both Editor buttons fit at 360 dp / font
1.5. The three previously saved clips were preserved; the unsaved test was
discarded. All 102 tracked Dev files still match the baseline.

Screenshots: [Editor](../data/emulator-review-2026-10-18/editor-direct-record-final.png),
[active recording](../data/emulator-review-2026-10-18/editor-direct-record-active.png),
[Trim](../data/emulator-review-2026-10-18/editor-direct-record-trim.png),
[large text](../data/emulator-review-2026-10-18/editor-direct-record-large-text.png).

One `gpt-6-luna` / high worker implemented this bounded follow-up; parent review,
45 existing Play tests, nine packaging tests and TypeScript passed. Native build
passed (374 tasks, 2m 8s), along with package audits, APK signature v2/v3 and ZIP
alignment. The emulator is left on **Editor**, dark, 432 dp / font 1.0.

Current [testing APK](../data/play-build-20261018-090130-795-61ded4fb/artifacts/soundboard-play-testing.apk)
SHA-256: `5fe779e1767084c273e64389c035cdae18b21d130aa27d322bd6fafc377b75a9`.
Unsigned APK/AAB and audit metadata are in the same artifact folder. No physical
phone was changed. The silent emulator-input limitation below still applies.

## Original recording and visual pass (1.0.2 / code 3)

**Result:** Play 1.0.2 (code 3) was built, updated in the visible Android emulator,
and checked against the reviewed handoff. Real microphone capture now goes through
**Source → Trim → Customize → Save**, including board assignment and Library
persistence. The emulator remains open for further visual checks.

The physical phone was not connected during this run; its apps were not changed.
All 102 tracked `app-client/` files match the pre-work SHA-256 baseline. The
emulator's existing `dev.sarunas.soundboard` app remains installed alongside
`dev.sarunas.soundboard.play`. No uninstall, data wipe, commit, push or store
publication occurred.

## Changes and native bugs fixed

- Added a foreground recorder using the existing Expo Audio dependency. Permission
  is contextual to choosing Record. The active screen has a red indicator, running
  timer, Stop & use, and Cancel with a discard confirmation. No background
  recording is enabled.
- Capture is limited to five minutes / 32 MiB; selected clips remain limited to
  60 seconds. Recordings enter the existing decoder/trim pipeline and save as local
  WAV clips. Cleanup distinguishes recorder-owned cache from the editor's source.
- The first emulator run exposed permission-dialog lifecycle cancellation. The UI
  now resolves permission before assigning the active recorder and waits for the
  app to return to the foreground. First Allow and already-granted paths passed.
- Decorative children intercepted trim-handle touches. Visible handle dragging now
  changes the range. Fine tune uses separate Start/End labels and readable buttons;
  redundant trim headings/panels were removed.
- Android's keyboard covered Save. Android height adjustment now keeps the field
  and Save above the keyboard. Tapping Save with the keyboard open succeeded.
- Adjusted responsive board sizing, wordmark and selected-navigation accents,
  full-width navigation, Library search/sort and creation actions. Creation has two
  source cards, connected numbered steps, a live pad preview and fixed CTA.

Three bounded implementation workers used `gpt-6-luna` with high reasoning effort.
The parent reviewed their changes and performed native QA. The final read-only
shell/build/capture review found no delivery-blocking regression.

## Observed runtime results

| Check | Observation |
|---|---|
| First microphone grant | Android Allow dialog → advancing timer → usable recorded source, without retry |
| Permission denial | Final build showed microphone access/settings guidance and stayed on Source without recording; original granted permission was restored after the test |
| Save and persistence | Recorded source 36.45 s → trimmed 7.87 s → customized → Pad 2; retained after force-stop/relaunch |
| Handle and precision | Source 24.66 s → visible end-handle drag selected 4.72 s → End +100 ms selected 4.82 s; saved as pink **Record test** on Pad 3 |
| Keyboard | Final build recorded 9.49 s, named **Keyboard test**, and saved to Pad 4 while the keyboard remained open |
| Background interruption | Home during capture stopped/discarded it; returning showed interruption, with no extra Library entry |
| Explicit cancel | At 360 dp / 150% text, Cancel → Discard returned to Source: “Recording discarded. Nothing was saved.” |
| Final Library | Exactly three clips: Keyboard test 9.49 s, Record test 4.82 s, My recording 7.87 s; profile-test drafts added no entries |
| Update persistence | Final APK installed with `install -r`, preserving the earlier saved clips |

These are real native recorder/decoder/save operations. **The emulator was started
without host audio input, so its microphone stream is silent.** Audible microphone
quality, physical-device interruptions and audible playback require a phone check.
The five-minute cap was tested in the adapter, not a five-minute native soak.

## Design comparison

References: [reviewed handoff](design/reviewed-2026-10-17/ASTRA_HANDOFF.md),
[prototype](design/reviewed-2026-10-17/design/prototype.html), and its previews.
Capture links below point to retained local QA files in ignored `data/`.

| Screen | Reference | Native capture and result |
|---|---|---|
| Dark Board | [Design](design/reviewed-2026-10-17/design/previews/01-board-dark.png) | [411 dp / 115% text](../data/emulator-review-2026-10-18/verified-phone-board.png): four columns, all 16 pads and navigation visible |
| Source | [Design](design/reviewed-2026-10-17/design/previews/03-create-source.png) | [Native](../data/emulator-review-2026-10-18/verified-phone-source.png): two choices, connected steps, fixed Cancel |
| Recording | Handoff microphone requirement | [Active capture](../data/emulator-review-2026-10-18/verified-recording-active.png): timer and prominent stop/cancel |
| Trim / Fine tune | [Design](design/reviewed-2026-10-17/design/previews/04-create-trim-fine-tune.png) | [411 dp / 115% text](../data/emulator-review-2026-10-18/verified-phone-fine-tune.png): readable rows, fixed Continue |
| Customize | [Design](design/reviewed-2026-10-17/design/previews/05-create-customize.png) | [Preview](../data/emulator-review-2026-10-18/verified-customize.png), [keyboard open](../data/emulator-review-2026-10-18/verified-customize-keyboard.png): name and Save visible |
| Library | [Design](design/reviewed-2026-10-17/design/previews/07-library-menu.png) | [Three saved clips](../data/emulator-review-2026-10-18/verified-library-settled.png): compact sort, rows, full-width creation and Appearance actions |
| Light Board | [Design](design/reviewed-2026-10-17/design/previews/08-board-light.png) | [Native](../data/emulator-review-2026-10-18/verified-light-board.png): light surfaces, readable labels and selected accent |

Profiles used `Soundboard_API_36`, Android 16 / API 36, x86_64 Google APIs,
serial `emulator-5554`. All display changes were emulator-only.

| Profile | Settings | Checked result |
|---|---|---|
| Design-sized | 1080×2260 px, density 400, 432×904 dp, font 1.0 | Dark/light Board, recording/save, Customize keyboard, Library |
| Phone-sized | 1080×2340 px, density 420, ≈411×891 dp, font 1.15 | All 16 pads, Source, recording, expanded Fine tune; no button wrapping |
| Compact / large text | 900×2000 px, density 400, 360×800 dp, font 1.5 | [Three-column scrolling Board](../data/emulator-review-2026-10-18/verified-compact-board.png), [Source](../data/emulator-review-2026-10-18/verified-compact-source.png), recording controls and confirmed discard |

This is a closer native implementation, not pixel equality or a complete handoff.
The HTML sample pads/artwork are placeholders; native captures use saved clips and
built-in glyphs. Native fonts, accessible targets, system text scaling and insets
change spacing. Gallery artwork, video/share ingestion, online art, pad reorder/
move, backup/export/import and interrupted draft restoration remain pending.
Quick add currently offers file or Library; Record is available in Source and
Editor but is not yet a Quick add default.

## Validation and artifacts

- **45/45 Play tests**, **9/9 build-stage/plugin tests**, and TypeScript passed.
  Focused handle/layout tests and final TypeScript passed after the last fixes.
- Dual-ABI `arm64-v8a,x86_64` release build succeeded: 374 tasks, 2m 4s.
  APK/AAB audits passed: Play identity, RECORD_AUDIO present, no extractor source/
  binary markers or native autolinking, backup and cleartext disabled.
- Local testing APK signature v2/v3 and 16 KiB ZIP alignment checks passed. This
  does not establish full ELF page-size compatibility or store readiness.
- `git diff --check` passed; tracked Dev baseline unchanged.

Final artifacts: `data/play-build-20261018-084423-305-403cb55c/artifacts/`.

| Artifact | SHA-256 |
|---|---|
| [Signed testing APK](../data/play-build-20261018-084423-305-403cb55c/artifacts/soundboard-play-testing.apk) | `251b0bb360bb7c694289d4864927cfa4d971853127a8fac19e3547bd288d139e` |
| [Unsigned APK](../data/play-build-20261018-084423-305-403cb55c/artifacts/soundboard-play-testing-unsigned.apk) | `c64c6e42aa0fbf5b69e852177b14d0cbf7020332cadf6cb5acbd2386a0f74d5d` |
| [Unsigned AAB](../data/play-build-20261018-084423-305-403cb55c/artifacts/soundboard-play-unsigned.aab) | `ffcb49405b16164067162cc6b790a99fa87144046c7e6a797056fe8ed71f0b1f` |

`release-info.txt` / `SHA256SUMS` describe unsigned export; the signed testing APK
was produced and verified afterward. Only the separate local testing key was used.

## Repeatable visual check loop

Keep the emulator visible, update Play using `adb install -r`, open each affected
screen, capture it, and compare with the same handoff preview. Record the display
profile and interaction outcome. Let layout and keyboard transitions settle first.

From the repository root:

```powershell
.\scripts\capture-play-emulator.ps1 -Name unique-settled-screen
# A running timer prevents UIAutomator idle; use foreground proof instead:
.\scripts\capture-play-emulator.ps1 -Name unique-active-recording -ScreenshotOnly
```

The helper refuses physical-phone serials and overwrites, restricts output to
`data/`, verifies Play package/foreground Activity, and saves PNG plus XML (or a
foreground proof for active recording). The emulator is left open at 432 dp,
font 1.0, dark. Physical-phone microphone QA is the next runtime check; incomplete
handoff features remain tracked in [STEPS.md](../STEPS.md).
