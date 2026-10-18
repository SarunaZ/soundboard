# Fixed first Quick add tile — 2026-10-18

Play 1.0.13/code 14 renders Quick add as the first item in the scrolling board
grid, independently of saved pads. Adding or reordering sounds cannot replace
or move it. It stays available when every saved pad is occupied and remains
visible during filtering. It scrolls with the grid; it is not a floating overlay.

The existing file/Library preference is retained. Board-only Quick add targets
fill the first empty pad or append a sound when the board is full. Explicit pad
actions still target that pad and check its captured contents before assignment.
No saved-pad migration or Dev changes were needed. The Quick add configuration
arrow is edit-only; the action has no drag grip and is excluded from reorder
targets. Grid hit testing accounts for the extra leading tile.

## Checks

- All 65 Play tests, nine staging/plugin tests and strict TypeScript passed.
- Scenario tests fill 20 sound slots, append sound 21 without replacing existing
  records, refill a cleared hole, and check reorder geometry across a row boundary.
  The 20-sound capacity case was tested in the model, not populated on the device.
- Native simulator: Quick add occupies `[40,624][271,884]` before and after saving
  a disposable imported MP3. The new clip uses the next empty pad. Quick add also
  remains first after adding that clip through its Library preference.
- Quick add and existing pad label bounds match between normal and Edit modes;
  the configuration arrow appears only in Edit. No Quick add drag grip exists.
- Dragged the first saved pad to the next position, confirmed a drop onto Quick
  add leaves its order unchanged, and restored the original order by tapping.
- Search retains Quick add first. After cold restart, its first position, original
  file preference, active board and original sound position remain correct.
- Deleted only the disposable `Pinned add QA` clip and its two test assignments.
  Library returned to five sounds; the original empty pads were restored. The
  simulator is left on the normal Artwork demo board with no active draft.

A bounded `gpt-6-luna` worker made the implementation changes but reached its usage
limit before final verification. The parent reviewed the changes and completed
tests, native build, installation and simulator checks.

## Artifact and evidence

The ARM64+x86_64 build is under
`data/play-build-20261018-210731-234-f75ad68b/artifacts/`. Source staging verified
54 files, including 38 source files. Package, extractor exclusion, permission,
backup and cleartext checks passed. Local testing signing passed v2/v3 signature
verification and 16 KiB ZIP alignment. The signed testing APK has SHA-256:

`c008beeaee75b99ca9327a8ea4b852a78c628a572ab5381148c16c88c0ddb521`.

Updated only `dev.sarunas.soundboard.play` in `emulator-5554` with `adb install -r`.
The installed Dev package retains its original version and update timestamp.
No physical phone, store release, commit or push was involved.

Screenshots and UI dumps are under `data/emulator-review-2026-10-18/`, named
`pinned-add-normal`, `pinned-add-edit`, `pinned-add-drag`,
`pinned-add-blocked-drop`, `pinned-add-tap-restored`, `pinned-add-saved`,
`pinned-add-library-assigned`, `pinned-add-search-visible`, and `pinned-add-final`.
