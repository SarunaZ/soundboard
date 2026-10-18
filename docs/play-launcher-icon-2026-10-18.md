# Play launcher icon verification — 2026-10-18

Play 1.0.12/code 13 uses the turquoise S icon from the Dev source. The three
PNGs under `app-play/assets/stimyz/` are byte-identical copies of the matching
files under `app-client/assets/stimyz/`. Dev source and its installed emulator
package were not changed.

| File | SHA-256, identical in Dev, Play and frozen build stage |
| --- | --- |
| `icon.png` | `2e78bfd90b6aed2aabe9b6dbd46f5f12e2d8c13e9a16e67dcb9e233a114d9fb2` |
| `android-icon-foreground.png` | `f83e1f7850e75b99eae561bbdb787e851fea5a388432bb6a33632c3c2ae118d7` |
| `android-icon-monochrome.png` | `460e8b46c63ce5b4690d1dcbe6f699ac26055b0f1c8b6677c8063f7ba24ad0b4` |

The Expo config references Play-owned files and uses Dev's `#14161a` adaptive
background. Native staging permits only these three specific asset paths;
the verifier checks that all configured icon files exist in the stage.
All nine staging/plugin tests passed, including missing-icon rejection and
exclusion of arbitrary additional artwork. The native stage contained 53 files,
including 37 source files.

The ARM64+x86_64 APK/AAB build and package checks passed. The APK's adaptive icon
XML contains background, foreground and monochrome layers. Local testing signing
passed v2/v3 signature verification and 16 KiB zip alignment.

- Build stage: `data/play-build-20261018-160927-620-678ce94d/`.
- Signed testing APK SHA-256:
  `2b947becb2574cdae5e555092a32e90562eed015c19cfed784669a732883c155`.
- Updated only `dev.sarunas.soundboard.play` with `adb install -r` on
  `emulator-5554`; installed metadata reports 1.0.12/code 13.
- Visually confirmed the S icon in Android app settings and the app drawer;
  tapping the new launcher icon opens Play.
- The Library retained all five saved sounds; the active Artwork demo board
  retained its Imgflip test pad. Returned the simulator to Editor.
- The old emulator Dev package retained version 1.0.0/code 1 and its original
  2026-10-10 update timestamp. No physical phone installation was performed.

Screenshots and UI dumps are in `data/emulator-review-2026-10-18/`:
`icon-app-info-before`, `icon-app-info-after-fresh`, `icon-drawer-after`,
`icon-update-library`, `icon-update-board`, and `icon-update-editor`.
The installed older emulator Dev build has an older generic icon; this change
uses the current Dev source's S assets requested by the user.
