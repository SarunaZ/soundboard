# Device audio capture test player

This tiny, separate Android app emits a deterministic synthetic three-tone pattern (440, 660, then 880 Hz, followed by a short gap) through a streaming `AudioTrack`. It uses `USAGE_MEDIA` and lets the tester set `ALLOW_CAPTURE_BY_ALL`, `ALLOW_CAPTURE_BY_SYSTEM`, or `ALLOW_CAPTURE_BY_NONE`. Changing policy stops the current track; Start always creates a fresh player with the selected policy.

The fixture uses only generated tones. It has package ID `dev.sarunas.soundboard.capturefixture`, declares `allowAudioPlaybackCapture="true"` for the ALL baseline, and requests no microphone, network, or storage permission. Stop and Activity destruction release the track. Leaving the app for Android's projection-consent flow does not stop playback; return to this fixture if needed to press Stop. It is not part of the Stimmyz/Play build or staging tree.

## Build (Windows host needs Docker only)

Build the repository Android toolchain image and named cache volume once if they are not present:

```powershell
.\sb.ps1 apk
```

Then build the fixture:

```powershell
.\scripts\build-device-audio-test-player.ps1
```

The script uses `soundboard-android:local`, the `soundboard_gradle` named volume, Android SDK platform/build tools 36, and Gradle 8.14.3 cached in that volume. It writes the debug APK to ignored `data/device-audio-test-player/capture-fixture-debug.apk`. No host JDK, Android SDK, Gradle, or Node installation is needed. Install with an attached device or emulator:

```powershell
adb install -r .\data\device-audio-test-player\capture-fixture-debug.apk
adb shell monkey -p dev.sarunas.soundboard.capturefixture 1
```

## Controlled capture procedure

1. Install and open **Capture Fixture**, leave policy at **ALL**, and tap **Start tone**. Confirm the alternating three-pitch pattern is audible on the device. This checks the source player's local output before testing capture.
2. Open Stimmyz's device-audio capture, accept Android's fresh system consent, and keep its ongoing recording active. Return to Capture Fixture if the consent flow foregrounded Stimmyz, then leave the tone running. Stop capture from Stimmyz's notification or its in-app Stop; review the resulting audio for the recognizable three-pitch pattern and compare the waveform/levels. Repeat with a short 5–10 second capture.
3. Stop the fixture tone. Select **SYSTEM**, start it again, and repeat capture. Do the same for **NONE**. Each policy change stops the old track so playback starts with a newly constructed `AudioTrack`.
4. Record the device model, Android/One UI version, Stimmyz build and target SDK, policy, route (speaker/headphones/Bluetooth), whether the tone was audible live, capture duration, and whether the result was audibly non-silent. Do not infer a source restriction if the ALL control fails.

Expected diagnostic: a normal third-party capture app should be able to capture ALL audio; SYSTEM is limited to system capture clients and NONE disallows capture. These are expected platform semantics, not a pass claim. The Galaxy S24 Ultra results, including the offline saved-fixture audition, source comparisons, emulator regression checks and their limitations, are recorded in [DEVICE_AUDIO_CAPTURE_RESULTS.md](../../DEVICE_AUDIO_CAPTURE_RESULTS.md). An emulator can verify build/install, playback, consent and end-to-end mechanics, but it does not establish Samsung/One UI behavior beyond the reported physical observations.
