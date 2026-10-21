# Transfer saved soundbites from Soundboard to Stimmyz

The two apps keep separate private libraries. This transfer copies the old
Soundboard Library's saved audio into Stimmyz on the same Android device.
Names, durations, creation dates and original audio bytes are preserved; audio
is not trimmed or encoded again. Existing clips in either app stay in place.

## On the phone

1. In the old Soundboard/StimyzApp, open **Library → Export soundbites**.
2. Choose a shared location in Android's folder picker, such as a folder under
   Documents, and allow access. The app creates a new `Soundboard-transfer-…`
   child folder there. Wait for the export-complete message.
3. In Stimmyz, open **Library → Import soundbites** and select that exact
   `Soundboard-transfer-…` folder. Select the folder itself, not its parent or
   `manifest.json` file.
4. After import, play the transferred sounds in Library. Use each sound's
   **Add to board** action to place it on a Stimmyz board.

Android may prevent choosing a storage root or Downloads itself. Choose a
subfolder under Documents instead. Both apps ask only for the selected folder;
no broad storage permission or online service is needed. Keep the transfer
folder until you have checked the imported clips. Removing the transfer folder
later does not remove the private copies in either app.

An export includes saved Library clips, not bundled/remote board defaults. The
old app has no saved artwork metadata to transfer. Board positions and theme
preferences are not migrated. This is a clip-copy feature, not complete Play
board backup/export/import (D9).

## Validation and recovery

- Each transfer contains at most 1,000 clips, 32 MiB per clip and 512 MiB total.
  A manifest larger than 1 MiB is rejected. Files are copied in bounded chunks.
- The export writes `manifest.json` after all audio files finish. Import checks
  metadata, supported extensions, audio headers, sizes and CRC32 checksums.
- Import preserves existing Library entries and skips already-present clip
  IDs. Repeating an import does not duplicate successfully imported clips.
- New clips are added in one catalog snapshot after every copied file passes
  validation. An error or cancellation removes only files created by the
  current operation. Existing private files are never overwritten.
- An orphan private file with a conflicting ID causes a protected-file error.
  Automatic recovery from process death during the final copy/commit window
  is not provided by this first transfer slice; do not clear app data to retry.

## Builds and verification

The old app's export update is **1.0.4 / code 5** with the existing
`dev.sarunas.soundboard.sideload` identity and release key. Stimmyz's import
update is **1.0.18 / code 19**, package `dev.sarunas.soundboard.play`.
Updating the old app requires its existing release-key password entered
locally at the signing prompt. No key is generated or replaced.

Implementation uses the installed Expo FileSystem 57 APIs and the SDK's
versioned documentation. Shared transfer code is an explicit Play staging
leaf; the Dev root, extraction modules and media defaults are excluded from
the Play build.

Unit/type checks and native verification are tracked in
`data/soundbite-transfer-qa-20261020/`.

- All 132 Dev tests, 94 Play tests, and 11 Play staging/release-plugin tests
  pass. Strict TypeScript passes for both apps. The shared transfer tests cover
  cancellation, malformed manifests, source retention, size limits, provider
  collision behavior, CRC failures, headers and bounded copy chunks. Play
  tests cover batch capacity, duplicate skipping and cleanup on failure.
- The ARM64 + x86_64 Play APK/AAB passed its package, permissions,
  extractor-exclusion and staging audits. Its signed testing APK uses the
  existing local testing certificate, passes v2/v3 verification and 16 KiB ZIP
  alignment, and is installed on the emulator and Samsung SM-S928B.
- Emulator native import of a generated two-second PCM WAV succeeded with
  `1 imported / 0 skipped`. A second import returned `0 imported / 1 skipped`.
  Native playback created an active app audio track. Canceling the Android
  folder picker returned to Library without an error or stuck progress panel.
  The synthetic clip was removed through the app afterward; the pre-existing
  `My recording` clip stayed present. Screenshots and result XML are in the QA
  directory.
- The old app's ARM64 export update passed its Android build, 16 native unit
  tests, package/version, permissions, non-debuggable, backup/cleartext and
  alignment checks. Its unsigned APK is 42,142,140 bytes, SHA-256
  `69f8f3c943cce0f90ed91e7b1efcbfc95b6236064c06c5566422a7da2c39db81`, under
  `data/private-release-20261020-214804-225-dc3d7323/artifacts/`.
  The original public remote-manifest endpoint was recovered from the
  preceding signed APK and supplied to the new build to preserve its
  configuration. The owner entered the existing release-key password locally;
  no password was sent through chat. The signed APK is 42,269,963 bytes,
  SHA-256 `6475f4335999d06a3f0e5d8ea12b7d894569a03859a097e41efd66ffaf51dbf9`.
  Its v2/v3 signature retains the existing certificate (SHA-256
  `467f0fa1246038a1ed190d71c427923e344c5a16611349e7acf43ab281320571`).
- The old app **1.0.4 / code 5** installed in place on the connected Samsung
  SM-S928B (`R5CWC206XDT`), and cold-launched successfully in 192 ms. Its data
  inode (`174033`) and first-install time (`2026-10-15 19:33:00`) stayed the
  same. The Board still loaded five remote clips and retained its four local
  pad assignments after updating.
- The owner's **four saved Library clips** exported successfully into
  `Documents/Soundboard-transfers/Soundboard-transfer-1a15ab02f38-a88c7005/`
  on the phone. The completed folder has four WAVs plus `manifest.json`; the
  old Library still showed all four entries after export.
- Stimmyz reported **4 imported / 0 skipped**, retaining its previous five
  clips for a total of **9**. All nine remained after force-stop/relaunch.
  Native playback of a transferred clip produced an active audio track for
  the Play app's UID. This verifies playback activity, not an independent
  audible-listening assessment. Playback was stopped, and Stimmyz was left
  open to its unfiltered Library. The shared transfer copy was retained as a
  backup; no old soundbite, existing Play clip, or board assignment was deleted
  or replaced.
