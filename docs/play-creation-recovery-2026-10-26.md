# Creation playback recovery and keyboard layout — 2026-10-26

The owner supplied a Samsung screenshot showing “Failed to resume audio
context.” after creating and assigning a sound, and a nine-second recording
showing the Details form repeatedly collapsing while the naming keyboard was
open. These changes target the separate Play app.

## Playback

The previous engine reused its AudioContext after a native resume rejection.
In the installed audio library, an initialized context whose native stream
cannot resume has no successful fallback through `tryStartDriver()`. Retrying
that context can therefore keep failing until the process restarts. The
screenshot establishes the reported error; the exact device event that made
the stream unusable has not been reproduced.

The engine now retires a failed or closed context, clears its graph and buffer
caches, releases playback reservations and focus, and waits for native close
before opening a replacement stream. The latest eligible pad request receives
one automatic retry. A second failure surfaces normally and leaves the next
tap able to construct a fresh context. Cancellation must suppress the retry,
and older decode results must never start playback after recovery.

## Keyboard

The creation root previously combined Android activity resizing with
`KeyboardAvoidingView` using `height`. React Native's height implementation
recalculates its own height from keyboard and layout measurements, creating a
second geometry owner. The recording shows the scrolling form alternating
between its ordinary height and a collapsed height with Save beneath the
stepper.

Android creation now uses an ordinary flex View and the activity's resized
viewport. iOS retains keyboard padding. The existing focused-input reveal
hook, scrollable Details form and fixed Save footer are retained.

## Verification boundary

Implementation was delegated to two `gpt-6-luna` workers with high reasoning
effort and reviewed by the primary agent. Final verification passed:

- 206/206 Play tests, including 46 playback tests. Recovery coverage includes
  stale decode completion, a fresh suspended context, closed contexts,
  concurrent failures, persistent failure capped at one retry, Stop all, and
  Stop pad during deferred native close.
- Strict Play TypeScript checking.
- 11/11 shared keyboard geometry/reveal tests.
- 14/14 staging and release-plugin tests.
- Source staging audit: 105 files, including 64 source files.
- `git diff --check`.

The keyboard tests exercise reveal geometry and hook lifecycle; they do not
simulate Samsung's native keyboard animation. Playback tests use controlled
native-context substitutes rather than a physical Oboe output stream. Logs,
recording contact sheets and the reviewed source inventory are retained under
the ignored `data/bugfix-20261026/` directory.

The source fix leaves saved audio, library metadata and board assignments
unchanged. The subsequent owner-requested phone update advances the testing
version to 1.0.29/code 30. Existing untracked `website/` work was left untouched;
no commit or push was performed.

Docker's Linux engine was initially unavailable. After the owner requested
installation, Docker Desktop was started and the ARM64 capture-enabled APK/AAB
build passed its ordinary package, permissions, native-module, extractor,
FFmpeg and 16 KiB alignment audits. All 104 inventoried staged input hashes
matched; the playback engine, creation root and version matched live source.

The APK was signed with the existing local testing certificate, verified with
v2/v3 signatures and checked for 16 KiB ZIP alignment. The certificate SHA-256
matches the APK pulled from the phone:
`b095e9fe2a6242050ef08117a90534e4629da9a35e0fdc095b04335dc32c020c`.

`adb install -r --user 0` succeeded on Samsung device `R5CWC206XDT`, updating
Play 1.0.28/code 29 to 1.0.29/code 30. A cold launch returned `Status: ok` in
285 ms, and the process remained running without a matching fatal/JS startup
error in its bounded log. User 0's data inode `170828` and first-install time
were unchanged; no uninstall or data clear occurred. Saved-clip contents and
the reported behavior were not independently exercised during installation.

Signed testing APK:
[`stimmyz-1.0.29-testing.apk`](../data/play-creation-fix-build-20261026/artifacts/stimmyz-1.0.29-testing.apk),
SHA-256 `c838cc558b307164c29979daa7447a32a1690ee42e362deb1945a6485b3e4544`.
Unsigned APK/AAB, build audits and signing verification are under the same
`artifacts/` directory. Installation and scoped startup logs are retained under
`data/bugfix-20261026/`. This is a local testing update, not a Play submission.

Physical behavior validation remains open: create from each source, preview, name with the
keyboard open, save/assign, play the new and existing pads, then repeat after
backgrounding and an audio interruption. Include keyboard hide/show and large
text. These source changes do not close the production device acceptance gates.
