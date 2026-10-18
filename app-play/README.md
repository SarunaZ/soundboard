# Stimmyz Play app

This is the separate Play distribution root for Stimmyz. It has its own Android
application ID (`dev.sarunas.soundboard.play`) and private data sandbox. Its
entrypoint is `index.ts`; it does not mount the Dev app or import the Dev
YouTube authoring flow.

The first slice starts with an empty 16-pad board and an empty Library. The Board
has a measured responsive pad grid, board selector, Edit board controls and a
Quick add tile fixed at the start of the scrolling grid. It is separate from
saved pads, remains visible during search, and never consumes a pad slot. Quick
add remembers whether to start local audio import or open Library; the new sound
uses the board's next empty pad or appends after the existing pads. Its action
chevron appears only while Edit board is active; tapping the tile uses the saved
action. Assigned pads play immediately, and pad overflow options appear only
while Edit board is active. The Library includes
search, sorting, preview and clip actions. Appearance is available from the
board selector and Library.

The Editor opens directly to separate **Choose file** and **Record sound**
actions. Choose file opens the device picker; Record sound requests microphone
permission and starts foreground recording. Both actions continue through the
shared trim and customize flow. Board and Library creation entry points still
show the general source choices. Creation supports importing one local audio
file or recording from the microphone, trimming up to 60 seconds, choosing a clip name and built-in
icon/color, then saving to the Play Library and optionally assigning to the
board/pad captured when creation began. Imported and recorded source audio is
limited to five minutes and 32 MiB. Recording requests microphone permission
only after the user chooses **Record sound** and uses the foreground UI; leaving
the foreground interrupts and cancels capture. Its Source → Trim → Customize
progress is explicit; Customize has a live pad preview and fixed Save action.
Customize also offers a **Choose image** action for Imgflip's free
popular-template picker, with local name filtering, optional image removal and
a source link; selected artwork can be changed with **Change image**. Selected artwork is saved
as a private JPEG thumbnail up to 512 px for offline Board and Library display.
The picker uses the free popular list, not Imgflip's paid full-catalog search.
The [artwork verification record](../docs/play-imgflip-artwork-2026-10-18.md)
documents simulator selection, saved previews and offline restart checks.
In Edit board mode, drag a pad by its grip to reorder it, or tap a pad and then
its destination. Editing controls and selection highlights overlay the existing
board, so toggling edit mode does not move the grid, tiles, labels, search field
or board selector, or change the scroll position. The updated order is saved
on-device and restored after
reopening the app. Reordering changes pad positions within the current board;
cross-board moves, video, share/import from other apps, gallery artwork,
manual artwork crop/reposition, full-catalog search, backup/export/import, and restoration of an interrupted
trim/customize draft remain pending. A canceled or interrupted draft is
discarded; already saved clips remain in Library. See the
[visual-fixes record](../docs/play-visual-fixes-2026-10-17.md) and
[recording emulator record](../docs/play-recording-emulator-2026-10-18.md) for
validation and current native-check status.

Dependencies use `app-client`'s Expo 57 base, plus Play-only
`expo-image-manipulator` for bounded artwork thumbnails and
`expo-document-picker` for system file selection. The picker copies the
selection into its app cache; Play stages a private editor copy, then removes
only that returned DocumentPicker cache file. The user's provider source stays
untouched.
Native import and cancellation checks are recorded in the
[file-picker verification record](../docs/play-file-picker-2026-10-18.md).

Build an unsigned Android artifact with `.\scripts\build-play-android.ps1` from
the repository root. This directory is not nested under `app-client/src` so its source
root, app identity, and package configuration remain distinct from Dev.

The Board header uses a 32sp Stimmyz wordmark with a smaller 20sp sparkle, while
the Soundboard subtitle remains at its existing size.

The current native Play test build is version 1.0.13/code 14 for ARM64 and x86_64.
Pad dragging, tap-to-move, restart persistence and background interruption passed
simulator checks; see the [reorder verification record](../docs/play-pad-reorder-2026-10-18.md).
First-use microphone permission, recording through Save and relaunch, and
foreground interruption passed emulator checks. The emulator input is silent by
default, so audible recording quality on a physical phone remains unverified.
See the [recording emulator record](../docs/play-recording-emulator-2026-10-18.md).

Run the data/media tests and TypeScript check with the repository's Docker tools:

```powershell
docker compose --profile tools run --rm --no-deps --entrypoint /bin/sh deps -lc 'corepack enable && yarn workspace app-play test && yarn workspace app-play check'
```

The current design source is the [reviewed handoff](../docs/design/reviewed-2026-10-17/ASTRA_HANDOFF.md)
and [research audit](../docs/design/reviewed-2026-10-17/RESEARCH_AUDIT_2026-10-17.md).
The [first-slice verification record](../docs/play-verification-2026-10-17.md)
contains the passing unsigned APK/AAB build results and artifact checksums.
Local recording/video and reliable creation take priority over further visual
polish; backup/export/import follows in the next priority group. Native build
and device verification are tracked in [STEPS.md](../STEPS.md).
