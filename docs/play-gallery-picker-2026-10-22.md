# Gallery artwork picker — October 22, 2026

The owner requested removal of the GIPHY demo and restoration of phone-gallery
artwork, with Gallery selected by default. This request supersedes the earlier
handoff's sample picker. The transparent logo and other October 22 changes
remain in place.

## Implementation

- Remove the unused GIPHY picker component, sample dataset and sample-filter
  tests. No GIPHY controls, previews or artwork-search requests remain.
- Details starts with Gallery selected. The photo picker opens only when the
  user taps Gallery; entering Details does not interrupt naming the sound.
- Default clears the current draft image. Canceling or failing image selection
  preserves the existing draft image and sound name. Artwork controls are
  disabled during preparation or save.
- Use Android's photo picker for the shared Gallery action, including saved
  Library artwork replacement. Restrict selection to one image, retain the
  existing bounded private-thumbnail processing and leave the provider's
  original image untouched.
- `expo-image-picker` is added at the Expo 57 compatible version. No gallery
  permission prompt is requested, camera permission is explicitly blocked,
  and the existing broad storage/media permission blocks remain in place.
- Android chooses the actual picker implementation and available albums.
  Devices without a supported photo picker may use its system fallback; the
  app does not hardcode Samsung Gallery or force a particular album.

Implementation was delegated to `gpt-6-luna` workers with high reasoning effort
and separate ownership of Details and the shared Gallery picker. The primary
agent reviews, builds and verifies the changes. Existing user changes and the
Dev app remain untouched. No commit or push is part of this task.

## Verification

- 145/145 Play tests, 11/11 packaging/release-plugin tests and strict TypeScript
  pass. The two removed tests belonged only to the deleted GIPHY sample filter.
- Immutable Yarn installation with build scripts skipped passes. The only added
  dependency is the Expo 57 image-picker module; its lockfile resolution is
  57.0.20. The Dev workspace's dependency declarations are unchanged.

- ARM64/x86_64 APK and AAB builds and artifact audits pass. The signed testing
  APK retains version 1.0.20/code 21 and the existing local testing certificate.
- The merged APK has no CAMERA, external-storage or broad READ_MEDIA permission;
  RECORD_AUDIO remains present for microphone creation.
- On the Android 36 emulator, Details shows Gallery selected initially and no
  GIPHY option. Gallery opens `com.google.android.photopicker` with Photos and
  Albums tabs directly, without a broad media-access prompt.
- Selection → preview → save passes. Cancellation retains the sound name and
  selected draft image; Default clears it; choosing a new Gallery image works.
  The saved Library's replacement action opens the same photo picker.
- Saved Gallery artwork remains visible after a force-stop and offline cold
  start. The original fixture's SHA-256 was unchanged before cleanup. Only the
  deliberately named `playback-qa-A440-gallery-qa` sound and its copied image
  fixture were removed after verification; the five existing emulator sounds
  remain, and connectivity was restored.

Evidence is retained under `data/gallery-picker-20261022/`:

- [Gallery selected by default](../data/gallery-picker-20261022/gallery-default-details.png)
- [Native Photos/Albums picker](../data/gallery-picker-20261022/system-photo-picker.png)
- [Selected image preview](../data/gallery-picker-20261022/gallery-selected-preview.png)
- [Saved artwork after offline restart](../data/gallery-picker-20261022/offline-gallery-artwork.png)
- [Signed testing APK](../data/gallery-picker-20261022/build/artifacts/stimmyz-gallery-testing.apk)
- [Unsigned AAB](../data/gallery-picker-20261022/build/artifacts/soundboard-play-unsigned.aab)

APK SHA-256: `9dae822c0e0890bc967e4678cd0f355cd2ca623b4a0ad58b2ba9a62d7a7e1dc2`.
Installed and launched on the connected Galaxy S24 Ultra with `adb install -r`.
The installed APK hash matches above, and the original installation time is
unchanged. The phone's existing app data was preserved.
Photo selection was exercised on the emulator; no private phone gallery
contents were inspected during verification.
