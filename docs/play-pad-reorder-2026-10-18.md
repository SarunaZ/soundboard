# Play pad rearranging — 2026-10-18

Follow-up: [1.0.6 preserves board geometry when toggling Edit](play-edit-geometry-2026-10-18.md).
It replaces the edit-only bottom band described in this original 1.0.5 record.

Play 1.0.5/code 6 adds rearranging within a board's **Edit board** mode.
Drag the six-dot grip, or tap a pad and then its destination. A drop inserts the
whole pad at the destination, shifting intervening pads. Its ID, sound, custom
label and color travel together. The order saves immediately and survives restart.

Implementation uses the existing Play snapshot files and stable pad IDs, with no
schema migration or audio-file changes. The persistence wrapper reads the latest
saved board before applying a move. Other boards and active-board selection are
retained. Cross-board move controls remain pending.

Edit mode clears and disables filtering, dismisses the keyboard, suppresses pad
playback/creation taps, and shows source/destination highlighting. Grips have a
48 dp touch area and their own bottom band, keeping names readable. Holding near
the viewport edge scrolls to off-screen destinations. Done and board switching
clear selection; app backgrounding cancels a pending drag. Normal playback and
the user's edit-only Quick add arrow preference are retained.

Three bounded `gpt-6-luna` / high workers handled data/tests, UI and packaging.
The parent reviewed all changes and performed native simulator checks. Reused
Dev geometry is copied through one explicit staging leaf; Dev files are unchanged.

## Verification

- 48 Play tests, nine stage/plugin tests, five shared geometry tests, and
  TypeScript passed. New data tests cover both move directions, whole-record
  preservation, unrelated boards, JSON reload, invalid targets and immutability.
- On the 432 dp / font 1.0 simulator, **My recording** moved from position 2 to 7
  by dragging, remained there after force-stop/relaunch, and returned to its
  original place using the tap fallback.
- At 360 dp / font 1.5, holding at the bottom edge scrolled and moved the sound
  to initially off-screen position 12. Tap selection survived scrolling back up,
  allowing the original order to be restored.
- Going Home during a pending move and returning cleared the drag without
  changing the saved order. A synthetic `adb motionevent CANCEL` did not produce
  a reliable cancellation result; it is not counted as a passing native test.
  The final implementation uses PanResponder termination and explicit app-state
  cleanup. A bubbling touch-cancel handler interfered with dragging and was removed.
- The final corrected build passed an asserted drag from position 2 to 7,
  force-stop/restart persistence, tap-to-move restoration, and a Home interruption
  with no remaining selection or saved move. Original order and the user's
  previously active board were restored after testing; Edit board is left open.

Final-build evidence: [edit controls](../data/emulator-review-2026-10-18/reorder-verified-ready.png),
[drag result](../data/emulator-review-2026-10-18/reorder-verified-drag.png),
[restart persistence](../data/emulator-review-2026-10-18/reorder-verified-restart.png),
[tap restoration](../data/emulator-review-2026-10-18/reorder-verified-restored.png),
[background cancellation](../data/emulator-review-2026-10-18/reorder-verified-background-cancel.png).
Earlier same-version candidate checks:
[large text](../data/emulator-review-2026-10-18/reorder-compact-edit.png),
[edge scrolling](../data/emulator-review-2026-10-18/reorder-edge-drop.png).
These are local QA captures retained under ignored `data/`.

Final dual-ABI build: `data/play-build-20261018-093307-564-7726b15d/artifacts/`.
The native build passed (374 tasks, 2 minutes), as did source/package exclusion,
backup/cleartext, local testing signature v2/v3 and 16 KiB ZIP-alignment checks.
The [signed testing APK](../data/play-build-20261018-093307-564-7726b15d/artifacts/soundboard-play-testing.apk)
has SHA-256 `12c59d0e27b5d265aea5366ae96d9940ab91574e1a52abdbb84539a0ebe79d60`.
Unsigned APK/AAB and audit records are in the same folder. ZIP alignment alone
does not establish full native ELF compatibility or store readiness.

All 102 tracked Dev files match the pre-work SHA-256 baseline. No physical phone,
audio file, cloud service or store release was changed; no commit/push occurred.
